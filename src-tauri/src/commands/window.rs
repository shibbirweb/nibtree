//! More than one window (File > New Window): opening, focusing and restoring windows,
//! and the per-window services they own (watchers, terminals, search indexes, the preview
//! allow-list). The bookkeeping lives in windows.rs; this applies it to the real windows,
//! which window/desktop.rs makes (only in the desktop app: the browser's tabs stand in for them).

use std::path::Path;

use serde::Serialize;

use crate::host::HostApp;
use crate::state::AppState;
use crate::windows::WindowStart;

#[cfg(feature = "desktop")]
mod desktop;
#[cfg(all(feature = "desktop", windows))]
pub use desktop::on_second_launch;
#[cfg(feature = "desktop")]
pub use desktop::{on_quit, on_window_event, restore_at_start};
#[cfg(feature = "desktop")]
use {
    super::blocking,
    crate::error::{AppError, AppResult},
    crate::windows::{self, Shown, WindowOpen},
    desktop::{create_window, current_bounds, focus_window, publish, save_session, DEFAULT_TITLE},
    tauri::{AppHandle, Manager, State, Window},
};

/// What happened when a page asked for a window.
#[cfg(feature = "desktop")]
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowOpened {
    pub window_label: String,
    /// Another window already showed it and was focused instead.
    pub existing: bool,
}

/// What the asking window should open when its page starts or reloads.
#[crate::command]
pub fn window_startup(window: Window, state: State<'_, AppState>) -> WindowStart {
    state.window_book().start(window.label())
}

/// A window's page shows a new workspace (or none): it becomes the window's title, the
/// folders its previews and the MCP tools reach, its events and the saved session.
#[crate::command(desktop)]
pub async fn window_set_workspace(
    app: AppHandle,
    window: Window,
    folder_paths: Vec<String>,
    workspace_file: Option<String>,
    title: Option<String>,
) -> AppResult<()> {
    let window_label = window.label().to_string();
    let open = WindowOpen {
        folder_paths: folder_paths.clone(),
        workspace_file,
    };
    let shown = blocking(move || Ok(Shown::resolve(open))).await?;
    let title = title.filter(|title| !title.trim().is_empty()).unwrap_or_else(|| DEFAULT_TITLE.to_string());
    let state = app.state::<AppState>();
    if !state.window_book().set_shown(&window_label, shown, &title) {
        return Ok(());
    }
    state.preview_folders.set(&window_label, &folder_paths);
    // macOS lists the windows by title in the Window menu.
    let _ = window.set_title(&title);
    publish(&app);
    let app_for_save = app.clone();
    blocking(move || {
        save_session(&app_for_save);
        Ok(())
    })
    .await
}

/// Before a window replaces its workspace: focuses the other window that already shows it
/// and returns its label, or None to go on opening here.
#[crate::command(desktop)]
pub async fn window_focus_owner(
    app: AppHandle,
    window: Window,
    folder_paths: Vec<String>,
    workspace_file: Option<String>,
) -> AppResult<Option<String>> {
    let open = WindowOpen {
        folder_paths,
        workspace_file,
    };
    let wanted = blocking(move || Ok(Shown::resolve(open))).await?;
    let owner = app.state::<AppState>().window_book().owner(&wanted, Some(window.label()));
    if let Some(label) = &owner {
        focus_window(&app, label);
    }
    Ok(owner)
}

/// File > New Window (no folders) or Open Folder in New Window. A workspace another window
/// shows already is focused instead of opened twice.
#[crate::command(desktop)]
pub async fn window_open(
    app: AppHandle,
    window: Window,
    state: State<'_, AppState>,
    folder_paths: Vec<String>,
    workspace_file: Option<String>,
) -> AppResult<WindowOpened> {
    if state.launch.is_mergetool() {
        return Err(AppError::invalid("New windows are not available while merging"));
    }
    let open = WindowOpen {
        folder_paths,
        workspace_file,
    };
    if !open.is_empty() {
        let wanted_open = open.clone();
        let wanted = blocking(move || Ok(Shown::resolve(wanted_open))).await?;
        let owner = state.window_book().owner(&wanted, None);
        if let Some(label) = owner {
            focus_window(&app, &label);
            return Ok(WindowOpened {
                window_label: label,
                existing: true,
            });
        }
    }
    let from = state.window_book().bounds(window.label()).or_else(|| current_bounds(&window));
    let position = from.as_ref().map(windows::cascade);
    let window_label = state.window_book().new_label();
    create_window(&app, &window_label, Some(open), position, None)?;
    Ok(WindowOpened {
        window_label,
        existing: false,
    })
}

/// Window > Close Window, or the close button after the page checked for unsaved edits.
/// Closing the last window quits the app, and it comes back at the next start.
#[crate::command(desktop)]
pub async fn window_close(window: Window) -> AppResult<()> {
    window
        .destroy()
        .map_err(|err| AppError::invalid(format!("Could not close the window: {err}")))
}

/// Emits to the windows a path concerns (the ones showing a folder that holds it, or a folder
/// inside it), or to every window when none does (a clone into a new folder, say).
pub fn emit_for_path<S: Serialize + Clone>(app: &HostApp, path: &Path, event: &str, payload: S) {
    let labels = app.state().window_book().windows_for_path(path);
    if labels.is_empty() {
        let _ = app.emit(event, payload);
        return;
    }
    for label in labels {
        let _ = app.emit_to(&label, event, payload.clone());
    }
}

/// What a desktop window or a browser tab owned: previews, keep awake, watchers, terminals and search indexes.
/// Stopping watchers and shells waits for their threads, so it runs off the main thread.
pub fn release_window_state(state: &AppState, window_label: &str) {
    state.preview_folders.remove(window_label);
    state.keep_awake.release(window_label);
    state.open_files.remove(window_label);
    let watchers = super::workspace::take_window_watchers(state, window_label);
    state.terminal_links.forget_window(window_label);
    drop(watchers);
    state.terminals.close_window(window_label);
    state.file_search.remove(window_label);
}
