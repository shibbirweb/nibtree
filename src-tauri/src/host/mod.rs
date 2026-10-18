//! What a command needs from the program running it: the app state, events to the page, Channels and
//! the window it was called from. The desktop app (Tauri) and the browser server (`nibtree-browser`)
//! each implement `Bus`, and `#[command]` (nibtree-macros) hands command bodies these types, so one
//! body serves both. See docs/plans/browser-app-plan.md.

use std::future::Future;
use std::marker::PhantomData;
use std::pin::Pin;
use std::sync::Arc;

use serde::de::DeserializeOwned;
use serde::Serialize;
use serde_json::Value;

use crate::error::{AppError, AppResult};
use crate::state::AppState;

#[cfg(feature = "desktop")]
mod desktop;

/// Which windows (desktop) or browser tabs an event goes to.
pub enum Target<'a> {
    All,
    Window(&'a str),
    AllBut(&'a str),
}

/// A Channel message: JSON already serialized, or raw bytes (terminal output).
pub enum ChannelBody {
    Json(String),
    Raw(Vec<u8>),
}

pub trait Bus: Send + Sync {
    fn state(&self) -> &AppState;
    fn emit(&self, target: Target<'_>, event: &str, payload: Value) -> AppResult<()>;
    /// Ends the program (the merge tool after Save or Cancel).
    fn exit(&self, code: i32);
}

#[derive(Clone)]
pub struct HostApp(Arc<dyn Bus>);

impl HostApp {
    pub fn new(bus: Arc<dyn Bus>) -> HostApp {
        HostApp(bus)
    }

    pub fn state(&self) -> &AppState {
        self.0.state()
    }

    pub fn emit<S: Serialize>(&self, event: &str, payload: S) -> AppResult<()> {
        self.0.emit(Target::All, event, to_value(payload)?)
    }

    pub fn emit_to<S: Serialize>(&self, window_label: &str, event: &str, payload: S) -> AppResult<()> {
        self.0.emit(Target::Window(window_label), event, to_value(payload)?)
    }

    /// To every window but one, usually the one that made the change.
    pub fn emit_to_others<S: Serialize>(&self, window_label: &str, event: &str, payload: S) -> AppResult<()> {
        self.0.emit(Target::AllBut(window_label), event, to_value(payload)?)
    }

    pub fn exit(&self, code: i32) {
        self.0.exit(code)
    }
}

/// The window (desktop) or browser tab a command was called from.
#[derive(Clone)]
pub struct HostWindow {
    label: String,
}

impl HostWindow {
    pub fn new(window_label: String) -> HostWindow {
        HostWindow { label: window_label }
    }

    pub fn label(&self) -> &str {
        &self.label
    }
}

type SendFn = Arc<dyn Fn(ChannelBody) -> AppResult<()> + Send + Sync>;

/// The page's Channel for a stream of messages (search progress, terminal output).
pub struct HostChannel<T> {
    send: SendFn,
    message: PhantomData<fn(T)>,
}

impl<T> Clone for HostChannel<T> {
    fn clone(&self) -> Self {
        HostChannel { send: self.send.clone(), message: PhantomData }
    }
}

impl<T> HostChannel<T> {
    pub fn new(send: impl Fn(ChannelBody) -> AppResult<()> + Send + Sync + 'static) -> HostChannel<T> {
        HostChannel { send: Arc::new(send), message: PhantomData }
    }

    pub fn send_body(&self, body: ChannelBody) -> AppResult<()> {
        (self.send)(body)
    }
}

impl<T: Serialize> HostChannel<T> {
    pub fn send(&self, message: T) -> AppResult<()> {
        let json = serde_json::to_string(&message).map_err(|err| AppError::invalid(err.to_string()))?;
        self.send_body(ChannelBody::Json(json))
    }
}

/// The bytes of a command invoked with a raw body (an editor's text).
pub struct RawBody(Vec<u8>);

impl RawBody {
    pub fn new(bytes: Vec<u8>) -> RawBody {
        RawBody(bytes)
    }

    pub fn into_bytes(self) -> Vec<u8> {
        self.0
    }
}

/// A command call from the browser.
pub struct Call {
    pub args: Args,
    pub window: HostWindow,
    pub app: HostApp,
    pub raw: Option<Vec<u8>>,
}

/// What a browser entry point returns.
pub type Reply = Pin<Box<dyn Future<Output = AppResult<Value>> + Send>>;

/// The JSON arguments of a browser call.
pub struct Args {
    values: serde_json::Map<String, Value>,
    /// Sends a Channel message to the tab that made the call: (channel id, message).
    channels: Arc<dyn Fn(u32, ChannelBody) -> AppResult<()> + Send + Sync>,
}

const CHANNEL_PREFIX: &str = "__CHANNEL__:";

impl Args {
    pub fn new(
        values: serde_json::Map<String, Value>,
        channels: Arc<dyn Fn(u32, ChannelBody) -> AppResult<()> + Send + Sync>,
    ) -> Args {
        Args { values, channels }
    }

    /// A missing argument reads as null, so an `Option` comes out as None, as in Tauri.
    pub fn take<T: DeserializeOwned>(&mut self, key: &str) -> AppResult<T> {
        let value = self.values.remove(key).unwrap_or(Value::Null);
        serde_json::from_value(value).map_err(|err| AppError::invalid(format!("Argument {key}: {err}")))
    }

    pub fn channel<T>(&mut self, key: &str, _window: &HostWindow, _app: &HostApp) -> AppResult<HostChannel<T>> {
        let text: String = self.take(key)?;
        let channel_id: u32 = text
            .strip_prefix(CHANNEL_PREFIX)
            .and_then(|id| id.parse().ok())
            .ok_or_else(|| AppError::invalid(format!("Argument {key} is not a Channel")))?;
        let channels = self.channels.clone();
        Ok(HostChannel::new(move |body| channels(channel_id, body)))
    }
}

pub fn reply_value<T: Serialize>(value: T) -> AppResult<Value> {
    to_value(value)
}

fn to_value<T: Serialize>(value: T) -> AppResult<Value> {
    serde_json::to_value(value).map_err(|err| AppError::invalid(err.to_string()))
}
