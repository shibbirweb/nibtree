//! The desktop app's host: Tauri's app handle, windows and Channels.

use std::sync::Arc;

use serde_json::Value;
use tauri::ipc::{Channel, InvokeResponseBody, Request};
use tauri::{AppHandle, Emitter, EventTarget, Manager};

use super::{Bus, ChannelBody, HostApp, HostChannel, HostWindow, RawBody, Target};
use crate::error::{AppError, AppResult};
use crate::state::AppState;

struct TauriBus(AppHandle);

impl Bus for TauriBus {
    fn state(&self) -> &AppState {
        self.0.state::<AppState>().inner()
    }

    fn emit(&self, target: Target<'_>, event: &str, payload: Value) -> AppResult<()> {
        let sent = match target {
            Target::All => self.0.emit(event, payload),
            Target::Window(label) => self.0.emit_to(EventTarget::webview_window(label), event, payload),
            Target::AllBut(source) => self.0.emit_filter(event, payload, |target| {
                matches!(target, EventTarget::WebviewWindow { label } if label != source)
            }),
        };
        sent.map_err(tauri_error)
    }

    fn exit(&self, code: i32) {
        self.0.exit(code)
    }
}

impl HostApp {
    pub fn from_tauri(app: &AppHandle) -> HostApp {
        HostApp::new(Arc::new(TauriBus(app.clone())))
    }
}

impl HostWindow {
    pub fn from_tauri(window: &tauri::Window) -> HostWindow {
        HostWindow::new(window.label().to_string())
    }
}

impl<T> HostChannel<T> {
    pub fn from_tauri(channel: Channel<InvokeResponseBody>) -> HostChannel<T> {
        HostChannel::new(move |body| {
            let body = match body {
                ChannelBody::Json(json) => InvokeResponseBody::Json(json),
                ChannelBody::Raw(bytes) => InvokeResponseBody::Raw(bytes),
            };
            channel.send(body).map_err(tauri_error)
        })
    }
}

impl RawBody {
    pub fn from_request(request: &Request<'_>) -> AppResult<RawBody> {
        Ok(RawBody::new(crate::commands::raw_body(request)?))
    }
}

fn tauri_error(err: tauri::Error) -> AppError {
    AppError::invalid(err.to_string())
}
