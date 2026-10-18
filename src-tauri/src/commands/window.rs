//! More than one window (File > New Window): opening, focusing and restoring windows,
//! and the per-window services they own (watchers, terminals, search indexes, the preview
//! allow-list). The bookkeeping lives in windows.rs; this applies it to the real windows.

use std::path::Path;
use std::sync::atomic::Ordering;

use serde::Serialize;
use serde_json::Value;
use tauri::{
    AppHandle, LogicalPosition, LogicalSize, Manager, PhysicalPosition, PhysicalSize, State,
    WebviewUrl, WebviewWindow, WebviewWindowBuilder, Window, WindowEvent,
};

use super::blocking;
use crate::config::{self, ConfigPatch, PatchSet};
use crate::error::{AppError, AppResult};
use crate::host::HostApp;
use crate::mcp::McpWindow;
use crate::state::AppState;
use crate::windows::{self, Bounds, SessionEntry, Shown, WindowOpen, WindowStart};

/// The size and limits of tauri.conf.json's window, for windows made here.
const DEFAULT_SIZE: (f64, f64) = (1400.0, 880.0);
const MIN_SIZE: (f64, f64) = (960.0, 600.0);
/// Where the window buttons go (macOS), the same as `trafficLightPosition` in tauri.conf.json.
#[cfg(target_os = "macos")]
const TRAFFIC_LIGHTS: (f64, f64) = (14.0, 23.5);
const DEFAULT_TITLE: &str = "Nibtree";

/// A logical (x, y) position or (width, height) size.
type Pair = (f64, f64);

/// What happened when a page asked for a window.
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

/// Windows: a second start of the app hands its arguments here and exits (tauri-plugin-single-instance).
/// A folder or workspace file opens like Open Folder in New Window, or focuses the window showing it;
/// with nothing to open, the last focused window comes to the front.
#[cfg(windows)]
pub fn on_second_launch(app: &AppHandle, args: &[String], cwd: &str) {
    let state = app.state::<AppState>();
    let Some(open) = windows::open_for_arguments(args.get(1..).unwrap_or_default(), Path::new(cwd)) else {
        let window_label = state.window_book().focused().unwrap_or_else(|| windows::MAIN_LABEL.to_string());
        focus_window(app, &window_label);
        return;
    };
    let wanted = Shown::resolve(open.clone());
    if let Some(window_label) = state.window_book().owner(&wanted, None) {
        focus_window(app, &window_label);
        return;
    }
    let window_label = state.window_book().new_label();
    if create_window(app, &window_label, Some(open), None, None).is_ok() {
        focus_window(app, &window_label);
    }
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

/// Opens a new window. `intent` is what its page opens; None lets the page decide.
fn create_window(
    app: &AppHandle,
    window_label: &str,
    intent: Option<WindowOpen>,
    position: Option<Pair>,
    size: Option<Pair>,
) -> AppResult<WebviewWindow> {
    let (width, height) = size.unwrap_or(DEFAULT_SIZE);
    app.state::<AppState>().window_book().add(
        window_label,
        intent,
        position.map(|(x, y)| Bounds { x, y, width, height }),
    );
    let mut builder = WebviewWindowBuilder::new(app, window_label, WebviewUrl::default())
        .title(DEFAULT_TITLE)
        .inner_size(width, height)
        .min_inner_size(MIN_SIZE.0, MIN_SIZE.1);
    builder = match position {
        Some((x, y)) => builder.position(x, y),
        None => builder.center(),
    };
    builder = mac_title_bar(builder);
    builder.build().map_err(|err| {
        app.state::<AppState>().window_book().remove(window_label);
        AppError::invalid(format!("Could not open a window: {err}"))
    })
}

/// Like the main window in tauri.conf.json: no system title strip on macOS, so the close, minimize and zoom buttons
/// sit at the left of the app's own top bar, centered on its back arrow.
#[cfg(target_os = "macos")]
fn mac_title_bar<'a, R: tauri::Runtime, M: tauri::Manager<R>>(
    builder: WebviewWindowBuilder<'a, R, M>,
) -> WebviewWindowBuilder<'a, R, M> {
    builder
        .title_bar_style(tauri::TitleBarStyle::Overlay)
        .hidden_title(true)
        .traffic_light_position(tauri::LogicalPosition::new(TRAFFIC_LIGHTS.0, TRAFFIC_LIGHTS.1))
}

#[cfg(not(target_os = "macos"))]
fn mac_title_bar<'a, R: tauri::Runtime, M: tauri::Manager<R>>(
    builder: WebviewWindowBuilder<'a, R, M>,
) -> WebviewWindowBuilder<'a, R, M> {
    builder
}

fn focus_window(app: &AppHandle, window_label: &str) {
    if let Some(window) = app.get_webview_window(window_label) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn current_bounds(window: &Window) -> Option<Bounds> {
    logical_bounds(window.scale_factor().ok()?, window.outer_position().ok()?, window.inner_size().ok()?)
}

fn webview_bounds(window: &WebviewWindow) -> Option<Bounds> {
    logical_bounds(window.scale_factor().ok()?, window.outer_position().ok()?, window.inner_size().ok()?)
}

fn logical_bounds(scale: f64, position: PhysicalPosition<i32>, size: PhysicalSize<u32>) -> Option<Bounds> {
    let position = position.to_logical::<f64>(scale);
    let size = size.to_logical::<f64>(scale);
    Some(Bounds {
        x: position.x,
        y: position.y,
        width: size.width,
        height: size.height,
    })
}

/// The screens now, in logical pixels, to check saved positions against.
fn screens(app: &AppHandle) -> Vec<Bounds> {
    app.available_monitors()
        .unwrap_or_default()
        .iter()
        .map(|monitor| {
            let scale = monitor.scale_factor();
            let position = monitor.position().to_logical::<f64>(scale);
            let size = monitor.size().to_logical::<f64>(scale);
            Bounds {
                x: position.x,
                y: position.y,
                width: size.width,
                height: size.height,
            }
        })
        .collect()
}

/// Tells the MCP server which windows are open and which was focused last.
fn publish(app: &AppHandle) {
    let state = app.state::<AppState>();
    let (summaries, focused) = {
        let book = state.window_book();
        (book.summaries(), book.focused())
    };
    let windows = summaries
        .into_iter()
        .map(|summary| McpWindow {
            label: summary.label,
            title: summary.title,
            folders: summary.folders,
        })
        .collect();
    state.mcp.set_windows(windows, focused);
}

/// Writes the window session into state.json. Never in git mergetool mode, and never over a
/// state.json that does not parse (the patch refuses).
fn save_session(app: &AppHandle) {
    let state = app.state::<AppState>();
    if state.launch.is_mergetool() {
        return;
    }
    // Read and written under one lock, so an older session never lands after a newer one.
    static SESSION_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());
    let _guard = SESSION_LOCK.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    let session = state.window_book().session();
    write_session(&session);
}

fn write_session(session: &[SessionEntry]) {
    let Ok(home) = config::home_dir() else {
        return;
    };
    let patch = ConfigPatch {
        set: vec![PatchSet {
            path: vec![windows::SESSION_KEY.to_string()],
            value: windows::session_to_json(session),
        }],
        remove: Vec::new(),
    };
    let _ = config::update_in(&config::config_dir_in(&home), "state", &patch);
}

/// At start: registers the main window and reopens the other windows of the last session
/// ("Reopen windows on start"). A folder on the command line opens only that folder.
pub fn restore_at_start(app: &AppHandle) {
    let state = app.state::<AppState>();
    state.window_book().add(windows::MAIN_LABEL, None, None);
    let launch_folder = match &state.launch {
        crate::state::LaunchMode::App { repo_path } => repo_path.is_some(),
        crate::state::LaunchMode::MergeTool { .. } => return,
    };
    let dir = config::home_dir().map(|home| config::config_dir_in(&home));
    let read = |config_name: &str| -> Option<Value> {
        dir.as_ref().ok().and_then(|dir| config::load_in(dir, config_name).ok().flatten())
    };
    let plan = windows::restore_plan(read("settings").as_ref(), read("state").as_ref(), launch_folder);
    let screens = screens(app);
    let placed = |entry: &SessionEntry| -> (Option<Pair>, Option<Pair>) {
        match entry.bounds {
            Some(bounds) => {
                let size = Some((bounds.width.max(MIN_SIZE.0), bounds.height.max(MIN_SIZE.1)));
                let position = windows::on_screen(&bounds, &screens).then_some((bounds.x, bounds.y));
                (position, size)
            }
            None => (None, None),
        }
    };
    let mut entries = plan.into_iter();
    if let Some(first) = entries.next() {
        state.window_book().add(windows::MAIN_LABEL, Some(first.open.clone()), first.bounds);
        if let Some(main) = app.get_webview_window(windows::MAIN_LABEL) {
            let (position, size) = placed(&first);
            if let Some((width, height)) = size {
                let _ = main.set_size(LogicalSize::new(width, height));
            }
            if let Some((x, y)) = position {
                let _ = main.set_position(LogicalPosition::new(x, y));
            }
        }
    }
    for entry in entries {
        let window_label = state.window_book().new_label();
        let (position, size) = placed(&entry);
        let _ = create_window(app, &window_label, Some(entry.open), position, size);
    }
    publish(app);
}

/// Window events from the app loop: focus (for the MCP tools and the menu), position and
/// size (for the session) and closing (frees what the window owned).
pub fn on_window_event(app: &AppHandle, window_label: &str, event: &WindowEvent) {
    let state = app.state::<AppState>();
    match event {
        WindowEvent::Focused(true) => {
            state.window_book().focus(window_label);
            publish(app);
        }
        WindowEvent::Moved(_) | WindowEvent::Resized(_) => {
            let bounds = app.get_webview_window(window_label).and_then(|window| webview_bounds(&window));
            if let Some(bounds) = bounds {
                state.window_book().set_bounds(window_label, bounds);
            }
        }
        WindowEvent::Destroyed => {
            if state.quitting.load(Ordering::SeqCst) {
                return;
            }
            state.window_book().remove(window_label);
            publish(app);
            release_window(app, window_label);
        }
        _ => {}
    }
}

/// Frees what a closed window owned, off the main thread: stopping watchers and shells waits for threads.
fn release_window(app: &AppHandle, window_label: &str) {
    let state = app.state::<AppState>();
    state.preview_folders.remove(window_label);
    state.keep_awake.release(window_label);
    state.open_files.remove(window_label);
    let watchers = super::workspace::take_window_watchers(&state, window_label);
    let terminals = state.terminals.clone();
    state.terminal_links.forget_window(window_label);
    let searches = state.file_search.clone();
    let label = window_label.to_string();
    let app = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        drop(watchers);
        terminals.close_window(&label);
        searches.remove(&label);
        save_session(&app);
    });
}

/// The app is about to quit: every window stays in the session (Cmd+Q closes them all at once).
pub fn on_quit(app: &AppHandle) {
    let state = app.state::<AppState>();
    if state.quitting.swap(true, Ordering::SeqCst) {
        return;
    }
    save_session(app);
}
