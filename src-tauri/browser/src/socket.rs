//! One WebSocket per tab. The page sends command calls; the server answers each with its result and
//! pushes Channel messages and backend events, all as JSON text (raw bytes as base64). A tab's label,
//! sent first, plays the part of a desktop window's label.

use std::collections::HashMap;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Mutex};

use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::State;
use axum::http::{header, HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use base64::Engine;
use futures_util::{SinkExt, StreamExt};
use nibtree_lib::browser::{AppError, ChannelBody, Channels, Events, Target};
use serde::Deserialize;
use serde_json::{json, Map, Value};
use tokio::sync::mpsc::{unbounded_channel, UnboundedSender};

use crate::Server;

#[derive(Default)]
pub struct Tabs {
    next_id: AtomicU32,
    senders: Mutex<HashMap<String, UnboundedSender<String>>>,
}

impl Tabs {
    pub fn events(self: Arc<Self>) -> Events {
        Arc::new(move |target, event, payload| self.emit(target, event, payload))
    }

    fn emit(&self, target: Target<'_>, event: &str, payload: Value) {
        let text = json!({ "type": "event", "event": event, "payload": payload }).to_string();
        for (label, sender) in self.senders.lock().unwrap_or_else(|poisoned| poisoned.into_inner()).iter() {
            let wanted = match target {
                Target::All => true,
                Target::Window(window_label) => window_label == label,
                Target::AllBut(window_label) => window_label != label,
            };
            if wanted {
                let _ = sender.send(text.clone());
            }
        }
    }

    fn add(&self, sender: UnboundedSender<String>) -> String {
        let label = format!("tab-{}", self.next_id.fetch_add(1, Ordering::Relaxed) + 1);
        self.senders.lock().unwrap_or_else(|poisoned| poisoned.into_inner()).insert(label.clone(), sender);
        label
    }

    fn remove(&self, label: &str) {
        self.senders.lock().unwrap_or_else(|poisoned| poisoned.into_inner()).remove(label);
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct IncomingCall {
    call_id: u64,
    command: String,
    #[serde(default)]
    args: Map<String, Value>,
    /// A raw body (an editor's text) as base64.
    raw: Option<String>,
}

/// Only the server's own page may open the socket: a page on another site sends its own Origin.
pub async fn upgrade(State(server): State<Arc<Server>>, headers: HeaderMap, socket: WebSocketUpgrade) -> Response {
    let host = headers.get(header::HOST).and_then(|value| value.to_str().ok()).unwrap_or_default();
    let origin = headers.get(header::ORIGIN).and_then(|value| value.to_str().ok()).unwrap_or_default();
    if origin != format!("http://{host}") && origin != format!("https://{host}") {
        return (StatusCode::FORBIDDEN, "Wrong origin").into_response();
    }
    socket.on_upgrade(move |socket| run(server, socket))
}

async fn run(server: Arc<Server>, socket: WebSocket) {
    let (outgoing, mut queued) = unbounded_channel::<String>();
    let label = server.tabs.add(outgoing.clone());
    let (mut writer, mut reader) = socket.split();
    let _ = outgoing.send(json!({ "type": "hello", "tabLabel": label }).to_string());
    let writing = tokio::spawn(async move {
        while let Some(text) = queued.recv().await {
            if writer.send(Message::Text(text.into())).await.is_err() {
                break;
            }
        }
    });
    while let Some(Ok(message)) = reader.next().await {
        let Message::Text(text) = message else {
            continue;
        };
        let Ok(call) = serde_json::from_str::<IncomingCall>(&text) else {
            continue;
        };
        let raw = call.raw.as_deref().map(|raw| base64::engine::general_purpose::STANDARD.decode(raw));
        let raw = match raw {
            Some(Ok(bytes)) => Some(bytes),
            Some(Err(_)) => {
                let error = AppError::invalid("The raw body is not base64");
                let _ = outgoing.send(result_text(call.call_id, Err(error)));
                continue;
            }
            None => None,
        };
        let reply = server.runtime.call(&call.command, call.args, &label, raw, channels(outgoing.clone()));
        let answer = outgoing.clone();
        tokio::spawn(async move {
            let _ = answer.send(result_text(call.call_id, reply.await));
        });
    }
    server.tabs.remove(&label);
    writing.abort();
}

fn channels(outgoing: UnboundedSender<String>) -> Channels {
    Arc::new(move |channel_id, body| {
        let text = match body {
            ChannelBody::Json(json) => json!({ "type": "channel", "channelId": channel_id, "json": json }),
            ChannelBody::Raw(bytes) => {
                let raw = base64::engine::general_purpose::STANDARD.encode(bytes);
                json!({ "type": "channel", "channelId": channel_id, "raw": raw })
            }
        };
        outgoing.send(text.to_string()).map_err(|_| AppError::invalid("The tab is closed"))
    })
}

fn result_text(call_id: u64, result: Result<Value, AppError>) -> String {
    let (ok, value) = match result {
        Ok(value) => (true, value),
        Err(error) => (false, serde_json::to_value(error).unwrap_or(Value::Null)),
    };
    json!({ "type": "result", "callId": call_id, "ok": ok, "value": value }).to_string()
}
