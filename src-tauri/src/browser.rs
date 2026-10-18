//! The app's side of the browser server (`nibtree-browser`, src-tauri/browser): its own settings
//! folder, the app state without Tauri, and command calls by name with JSON arguments. The server
//! owns the sockets; this module only runs commands and hands it the events. See
//! docs/plans/browser-app-plan.md.

use std::sync::Arc;

use serde_json::{Map, Value};

pub use crate::error::{AppError, AppResult};
pub use crate::host::{ChannelBody, Reply, Target};

use crate::host::{Args, Bus, Call, HostApp, HostWindow};
use crate::state::{AppState, LaunchMode};

/// Delivers an event to the tabs the target names.
pub type Events = Arc<dyn Fn(Target<'_>, &str, Value) + Send + Sync>;

/// Sends one Channel message to the tab that made a call: (channel id, message).
pub type Channels = Arc<dyn Fn(u32, ChannelBody) -> AppResult<()> + Send + Sync>;

struct BrowserBus {
    state: AppState,
    events: Events,
}

impl Bus for BrowserBus {
    fn state(&self) -> &AppState {
        &self.state
    }

    fn emit(&self, target: Target<'_>, event: &str, payload: Value) -> AppResult<()> {
        (self.events)(target, event, payload);
        Ok(())
    }

    fn exit(&self, code: i32) {
        std::process::exit(code)
    }
}

/// First thing in `main`: git starts this same program as its askpass helper (see askpass.rs), and
/// that run only answers and exits with the returned code. Otherwise it picks the settings folder.
pub fn prepare() -> Option<i32> {
    if let Some(code) = crate::askpass::client_main() {
        return Some(code);
    }
    nibtree_cli::home::use_dir_name(nibtree_cli::home::BROWSER_DIR_NAME);
    crate::git::repo::configure_libgit2();
    None
}

pub struct Runtime {
    app: HostApp,
}

impl Runtime {
    pub fn start(repo_path: Option<String>, events: Events) -> Runtime {
        let state = AppState::new(LaunchMode::App { repo_path });
        let app = HostApp::new(Arc::new(BrowserBus { state, events }));
        crate::askpass::install(Box::new(crate::commands::askpass::WindowHooks::new(app.clone())));
        Runtime { app }
    }

    /// Runs a command for the tab `tab_label`. Raw-body commands get their bytes in `raw`.
    pub fn call(
        &self,
        command_name: &str,
        args: Map<String, Value>,
        tab_label: &str,
        raw: Option<Vec<u8>>,
        channels: Channels,
    ) -> Reply {
        let call = Call {
            args: Args::new(args, channels),
            window: HostWindow::new(tab_label.to_string()),
            app: self.app.clone(),
            raw,
        };
        match crate::browser_command(command_name, call) {
            Some(reply) => reply,
            None => {
                let message = format!("Unknown command: {command_name}");
                Box::pin(async move { Err(AppError::invalid(message)) })
            }
        }
    }
}

/// The app's version (src-tauri/Cargo.toml), which the page shows and the update check compares.
pub fn app_version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

/// 32 random bytes as hex, for the server's access token.
pub fn new_token() -> AppResult<String> {
    crate::mcp::token::new_token()
}

/// Compares in constant time, so the token cannot be guessed byte by byte.
pub fn tokens_match(expected: &str, given: &str) -> bool {
    crate::mcp::token::tokens_match(expected, given)
}

#[cfg(test)]
mod tests;
