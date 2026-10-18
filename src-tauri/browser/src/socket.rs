//! One WebSocket per tab. The page sends command calls; the server answers each with its result and
//! pushes Channel messages and backend events, all as JSON text (raw bytes as base64). A tab's label,
//! sent first, plays the part of a desktop window's label. The page keeps it across reloads (`?tab=`), so a
//! tab that comes back within `RELOAD_GRACE` keeps what it owned; otherwise, or right away after Close
//! Window (a `close` message), the server frees it as a closed desktop window.

use std::collections::HashMap;
use std::sync::atomic::{AtomicU32, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::{Query, State};
use axum::http::{header, HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use base64::Engine;
use futures_util::{SinkExt, StreamExt};
use nibtree_lib::browser::{AppError, ChannelBody, Channels, Events, Target};
use serde::Deserialize;
use serde_json::{json, Map, Value};
use tokio::sync::mpsc::{unbounded_channel, UnboundedSender};

use crate::Server;

/// How long a disconnected tab may take to come back (a reload) before what it owned is freed.
const RELOAD_GRACE: Duration = Duration::from_secs(10);

#[derive(Default)]
pub struct Tabs {
    next_id: AtomicU32,
    senders: Mutex<HashMap<String, UnboundedSender<String>>>,
    /// Disconnected tabs that may still come back, with the number of their leave.
    leaving: Mutex<HashMap<String, u64>>,
    leaves: AtomicU64,
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

    /// The tab's label: the one it asks for when no open tab has it (a reload), else a new one.
    fn add(&self, wanted: Option<&str>, sender: UnboundedSender<String>) -> String {
        let mut senders = self.senders.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        let label = match wanted.and_then(tab_number) {
            Some(number) if !senders.contains_key(&format!("tab-{number}")) => {
                self.next_id.fetch_max(number, Ordering::Relaxed);
                format!("tab-{number}")
            }
            _ => format!("tab-{}", self.next_id.fetch_add(1, Ordering::Relaxed) + 1),
        };
        self.leaving.lock().unwrap_or_else(|poisoned| poisoned.into_inner()).remove(&label);
        senders.insert(label.clone(), sender);
        label
    }

    /// The tab disconnected; returns the number of this leave, which `still_gone` checks later.
    fn remove(&self, label: &str) -> u64 {
        self.senders.lock().unwrap_or_else(|poisoned| poisoned.into_inner()).remove(label);
        let leave = self.leaves.fetch_add(1, Ordering::Relaxed);
        self.leaving.lock().unwrap_or_else(|poisoned| poisoned.into_inner()).insert(label.to_string(), leave);
        leave
    }

    /// Whether the tab has not come back since that leave.
    fn still_gone(&self, label: &str, leave: u64) -> bool {
        let mut leaving = self.leaving.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        let gone = leaving.get(label) == Some(&leave);
        if gone {
            leaving.remove(label);
        }
        gone
    }
}

/// `tab-7` -> 7; anything else is not a tab label the server gave.
fn tab_number(label: &str) -> Option<u32> {
    label.strip_prefix("tab-")?.parse().ok().filter(|number| *number > 0)
}

#[derive(Deserialize)]
pub struct SocketQuery {
    tab: Option<String>,
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
pub async fn upgrade(
    State(server): State<Arc<Server>>,
    Query(query): Query<SocketQuery>,
    headers: HeaderMap,
    socket: WebSocketUpgrade,
) -> Response {
    let host = headers.get(header::HOST).and_then(|value| value.to_str().ok()).unwrap_or_default();
    let origin = headers.get(header::ORIGIN).and_then(|value| value.to_str().ok()).unwrap_or_default();
    if origin != format!("http://{host}") && origin != format!("https://{host}") {
        return (StatusCode::FORBIDDEN, "Wrong origin").into_response();
    }
    socket.on_upgrade(move |socket| run(server, socket, query.tab))
}

async fn run(server: Arc<Server>, socket: WebSocket, wanted_label: Option<String>) {
    let (outgoing, mut queued) = unbounded_channel::<String>();
    let label = server.tabs.add(wanted_label.as_deref(), outgoing.clone());
    let mut closed = false;
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
        let Ok(message) = serde_json::from_str::<Value>(&text) else {
            continue;
        };
        if message.get("type").and_then(Value::as_str) == Some("close") {
            closed = true;
            break;
        }
        let Ok(call) = serde_json::from_value::<IncomingCall>(message) else {
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
        if let Some(result) = crate::opener::handle(&call.command, &call.args) {
            let _ = outgoing.send(result_text(call.call_id, result));
            continue;
        }
        let reply = server.runtime.call(&call.command, call.args, &label, raw, channels(outgoing.clone()));
        let answer = outgoing.clone();
        tokio::spawn(async move {
            let _ = answer.send(result_text(call.call_id, reply.await));
        });
    }
    writing.abort();
    let leave = server.tabs.remove(&label);
    if closed {
        server.tabs.still_gone(&label, leave);
        server.runtime.release_tab(&label);
        return;
    }
    tokio::spawn(async move {
        tokio::time::sleep(RELOAD_GRACE).await;
        if server.tabs.still_gone(&label, leave) {
            server.runtime.release_tab(&label);
        }
    });
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

#[cfg(test)]
mod tests {
    use tokio::sync::mpsc::unbounded_channel;

    use super::{tab_number, Tabs};

    #[test]
    fn a_reload_gets_its_label_back_and_a_duplicated_tab_a_new_one() {
        let tabs = Tabs::default();
        let (sender, _queued) = unbounded_channel();
        assert_eq!(tabs.add(None, sender.clone()), "tab-1");
        // A duplicated tab copies the address and session storage, so it asks for a label in use.
        assert_eq!(tabs.add(Some("tab-1"), sender.clone()), "tab-2");
        let leave = tabs.remove("tab-1");
        assert_eq!(tabs.add(Some("tab-1"), sender.clone()), "tab-1");
        assert!(!tabs.still_gone("tab-1", leave));
        let leave = tabs.remove("tab-2");
        assert!(tabs.still_gone("tab-2", leave));
        assert!(!tabs.still_gone("tab-2", leave), "freed once");
        // A label from before a server restart is taken, and never handed out again.
        assert_eq!(tabs.add(Some("tab-9"), sender.clone()), "tab-9");
        assert_eq!(tabs.add(None, sender), "tab-10");
    }

    #[test]
    fn only_labels_the_server_gives_are_claimed() {
        assert_eq!(tab_number("tab-3"), Some(3));
        assert_eq!(tab_number("tab-0"), None);
        assert_eq!(tab_number("main"), None);
        assert_eq!(tab_number("tab-x"), None);
    }
}
