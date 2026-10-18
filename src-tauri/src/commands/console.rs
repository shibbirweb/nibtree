//! The Git Console: the git commands the app ran (see git_console.rs).

#[cfg(feature = "desktop")]
use tauri::{AppHandle, State};

use super::blocking;
use crate::error::AppResult;
use crate::git_console::GitCommandEntry;
use crate::state::AppState;

/// Every recorded command, oldest first. The first call also starts the "git-command" events
/// (one when a command starts, one when it ends), so nothing is sent before the console is opened.
#[crate::command]
pub async fn git_console_entries(app: AppHandle, state: State<'_, AppState>) -> AppResult<Vec<GitCommandEntry>> {
    let console = state.git_console;
    console.set_emitter(move |entry| {
        let _ = app.emit("git-command", entry);
    });
    blocking(move || Ok(console.entries())).await
}

#[crate::command]
pub async fn git_console_clear(state: State<'_, AppState>) -> AppResult<()> {
    let console = state.git_console;
    blocking(move || {
        console.clear();
        Ok(())
    })
    .await
}

/// The Git Console setting. Off, git commands are not recorded and the entries are dropped.
#[crate::command]
pub async fn git_console_set_enabled(enabled: bool, state: State<'_, AppState>) -> AppResult<()> {
    let console = state.git_console;
    blocking(move || {
        console.set_enabled(enabled);
        Ok(())
    })
    .await
}
