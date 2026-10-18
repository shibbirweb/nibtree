use super::blocking;
use crate::ai_usage::{self, ProviderUsage};
use crate::error::AppResult;
use crate::github::http::UreqTransport;
use crate::run_process::{self, FoundProgram};

/// The AI panel: which agent programs the login shell's PATH has. `fresh` reads the shell's environment again
/// (Refresh), so an agent installed since the app started is found.
#[crate::command]
pub async fn find_agent_programs(programs: Vec<String>, fresh: bool) -> AppResult<Vec<FoundProgram>> {
    blocking(move || Ok(run_process::find_programs(&programs, fresh))).await
}

/// The status bar's AI usage: Claude Code's and Codex's rate limits (see ai_usage). `fresh` is a Refresh by the user,
/// which may ask the Keychain again; `hidden` providers ("claude", "codex") are not read at all.
#[crate::command]
pub async fn ai_usage(fresh: bool, hidden: Vec<String>) -> AppResult<Vec<ProviderUsage>> {
    blocking(move || {
        let transport = UreqTransport::new(concat!("nibtree/", env!("CARGO_PKG_VERSION")));
        Ok(ai_usage::read_all(&transport, fresh, &hidden))
    })
    .await
}

/// Keep computer awake (keep_awake.rs): this window wants the display and the system awake, or no longer does.
/// Returns whether the computer is held awake now (any window may hold it).
#[crate::command]
pub fn set_keep_awake(window: tauri::Window, state: tauri::State<'_, crate::state::AppState>, active: bool) -> AppResult<bool> {
    state
        .keep_awake
        .set(window.label(), active)
        .map_err(crate::error::AppError::invalid)
}
