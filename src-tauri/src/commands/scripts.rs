use tauri::{State, Window};

use super::blocking;
use super::terminal::channel_sink;
use crate::error::AppResult;
use crate::run_process::{self, RunRequest};
use crate::state::AppState;
use crate::terminal::TerminalInfo;
use crate::node_versions::{self, NodeInstall};
use crate::scripts::{self, ScriptSource};

/// The Scripts tool window: every runnable script under the workspace folders.
#[crate::command]
pub async fn list_project_scripts(folder_paths: Vec<String>) -> AppResult<Vec<ScriptSource>> {
    // Opening or refreshing the panel also reads the shell's environment again, for runs.
    run_process::reload_login_env();
    blocking(move || Ok(scripts::list_project_scripts(&folder_paths))).await
}

/// Installed Node versions, newest first, for running a package with the version it asks for.
#[crate::command]
pub async fn list_node_versions() -> AppResult<Vec<NodeInstall>> {
    blocking(|| Ok(node_versions::installed_here())).await
}

/// Starts a script as its own process (the Run tab). Output and exit arrive like a terminal's:
/// raw bytes on `output`, then `{ exit }`; input, resizing and acks use the terminal commands.
#[crate::command]
#[allow(clippy::too_many_arguments)]
pub async fn run_script(
    window: Window,
    state: State<'_, AppState>,
    program: String,
    args: Vec<String>,
    cwd: String,
    node_bin_dir: Option<String>,
    cols: u16,
    rows: u16,
    output: Channel<crate::host::ChannelBody>,
) -> AppResult<TerminalInfo> {
    let terminals = state.terminals.clone();
    let links = state.terminal_links.clone();
    let request = RunRequest {
        program,
        args,
        cwd,
        node_bin_dir,
        cols,
        rows,
    };
    let window_label = window.label().to_string();
    blocking(move || {
        let (link, on_output, on_exit) = links.link(channel_sink(output));
        let info = run_process::start_run(&terminals, &request, on_output, on_exit)?;
        links.register(info.terminal_id, link);
        terminals.adopt(info.terminal_id, &window_label);
        Ok(info)
    })
    .await
}
