#[cfg(feature = "desktop")]
use tauri::{AppHandle, State, Window};

use super::blocking;
use crate::error::AppResult;
use crate::git::repo::RepoInfo;
use crate::git::workspace::{self, WorkspaceInfo};
use crate::state::AppState;
use crate::watcher;

#[crate::command]
pub async fn open_workspace(folder_path: String) -> AppResult<WorkspaceInfo> {
    blocking(move || workspace::open(&folder_path)).await
}

/// Rescans one workspace folder for repositories. The frontend calls it for
/// Scan for Repositories and when the watcher reports a new repository.
#[crate::command]
pub async fn discover_repositories(workspace_root: String) -> AppResult<Vec<RepoInfo>> {
    blocking(move || workspace::discover_repositories(&workspace_root)).await
}

#[crate::command]
pub async fn init_repository(folder_path: String) -> AppResult<RepoInfo> {
    blocking(move || workspace::init(&folder_path)).await
}

/// Starts watching one workspace folder for changes in `repo_roots`, replacing
/// the previous watcher of that folder in the asking window. A multi-root
/// workspace watches each of its folders; the frontend unwatches folders it
/// removes, and a window that closes loses all of its watchers.
///
/// Async on purpose: a command without `async` runs on the main thread, and
/// starting a watcher on a big folder there froze the window.
#[crate::command]
pub async fn watch_workspace(
    app: AppHandle,
    window: Window,
    state: State<'_, AppState>,
    workspace_root: String,
    repo_roots: Vec<String>,
) -> AppResult<()> {
    let root = workspace_root.clone();
    let window_label = window.label().to_string();
    let label = window_label.clone();
    let workspace_watcher = blocking(move || watcher::watch(app, &label, &root, &repo_roots)).await?;
    let previous = state
        .watchers
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .insert((window_label, workspace_root), workspace_watcher);
    stop_watcher(previous).await;
    Ok(())
}

#[crate::command]
pub async fn unwatch_workspace(window: Window, state: State<'_, AppState>, workspace_root: String) -> AppResult<()> {
    let previous = state
        .watchers
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .remove(&(window.label().to_string(), workspace_root));
    stop_watcher(previous).await;
    Ok(())
}

/// The files open in the asking window's tabs: the watcher reports a change to one of them
/// even when git ignores it, so an open log file follows what another app writes.
#[crate::command]
pub fn watch_open_files(window: Window, state: State<'_, AppState>, file_paths: Vec<String>) {
    state.open_files.set(window.label(), &file_paths);
}

/// Takes every watcher of a window out of the map (it closed); the caller drops them off the main thread.
pub fn take_window_watchers(state: &AppState, window_label: &str) -> Vec<crate::state::RepoWatcher> {
    let mut watchers = state.watchers.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    let keys: Vec<(String, String)> = watchers.keys().filter(|(label, _)| label == window_label).cloned().collect();
    keys.iter().filter_map(|key| watchers.remove(key)).collect()
}

/// Stopping a watcher waits for its threads, so it happens off the main thread too.
async fn stop_watcher(previous: Option<crate::state::RepoWatcher>) {
    if let Some(previous) = previous {
        let _ = blocking(move || {
            drop(previous);
            Ok(())
        })
        .await;
    }
}

/// Reads a `.nibtree-workspace` or `.code-workspace` file.
#[crate::command]
pub async fn read_workspace_file(file_path: String) -> AppResult<crate::workspace_file::WorkspaceFile> {
    blocking(move || crate::workspace_file::read(std::path::Path::new(&file_path))).await
}

/// Saves the workspace folders into `file_path`, keeping its other settings.
#[crate::command]
pub async fn write_workspace_file(file_path: String, folders: Vec<String>) -> AppResult<()> {
    blocking(move || crate::workspace_file::write(std::path::Path::new(&file_path), &folders)).await
}
