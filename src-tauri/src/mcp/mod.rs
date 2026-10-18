//! The MCP (Model Context Protocol) server: lets AI harnesses and the `nibtree cli`
//! command line tool use the app's features over HTTP on 127.0.0.1. Off by default; while
//! both switches are off nothing listens and no thread runs.

mod activity;
mod bridge;
/// The command line tool lives in its own crate (src-tauri/cli); `mcp::cli` keeps its old path.
#[cfg(any(feature = "desktop", test))]
pub use nibtree_cli as cli;
pub mod dto;
mod host;
mod http;
mod install;
pub(crate) mod paths;
mod protocol;
mod registry;
pub(crate) mod token;
mod tools;

#[cfg(test)]
mod tests;

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, RwLock};
use std::time::Duration;

use serde_json::json;

use crate::config;
use crate::error::{AppError, AppResult};
use crate::file_search::lock;
use activity::ActivityLog;
use bridge::Bridge;
use dto::{McpActivity, McpStatus, McpToolInfo, McpUiResult, McpUiToolDef};
pub use host::Host;
#[cfg(feature = "desktop")]
pub use host::TauriHost;
use token::McpFile;

pub const DEFAULT_PORT: u16 = 48731;

fn read<T>(lock: &RwLock<T>) -> std::sync::RwLockReadGuard<'_, T> {
    lock.read().unwrap_or_else(|poisoned| poisoned.into_inner())
}

fn write<T>(lock: &RwLock<T>) -> std::sync::RwLockWriteGuard<'_, T> {
    lock.write().unwrap_or_else(|poisoned| poisoned.into_inner())
}

#[derive(Debug, Clone, Default)]
pub struct Switches {
    pub mcp: bool,
    pub cli: bool,
    /// Only the tools whose state differs from the default.
    pub tool_states: HashMap<String, bool>,
}

/// An app window as the tools see it: its label, title and canonical workspace folders.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct McpWindow {
    pub label: String,
    pub title: String,
    pub folders: Vec<PathBuf>,
}

/// The window a UI tool acts on: the one holding a path argument (the deepest folder wins),
/// else the window focused last, else the first one.
pub fn pick_window(windows: &[McpWindow], focused: Option<&str>, paths: &[PathBuf]) -> Option<String> {
    let mut best: Option<(&str, usize)> = None;
    for path in paths {
        for window in windows {
            for folder in &window.folders {
                let depth = folder.components().count();
                if path.starts_with(folder) && best.is_none_or(|(_, best_depth)| depth > best_depth) {
                    best = Some((window.label.as_str(), depth));
                }
            }
        }
    }
    best.map(|(label, _)| label.to_string())
        .or_else(|| focused.filter(|label| windows.iter().any(|window| window.label == *label)).map(str::to_string))
        .or_else(|| windows.first().map(|window| window.label.clone()))
}

/// Arguments that name a file or folder; a UI tool goes to the window holding it.
const PATH_ARGUMENTS: [&str; 4] = ["filePath", "path", "folderPath", "repoPath"];

/// What the request threads share with the commands.
pub struct Shared {
    host: RwLock<Option<Arc<dyn Host>>>,
    switches: RwLock<Switches>,
    ui_tools: RwLock<Vec<McpUiToolDef>>,
    /// Every open window, in the order they were opened.
    windows: RwLock<Vec<McpWindow>>,
    /// The window focused last (the app is rarely the active one while an agent calls it).
    focused: RwLock<Option<String>>,
    token: RwLock<Option<String>>,
    activity: ActivityLog,
    bridge: Bridge,
    ui_timeout: Duration,
}

impl Shared {
    fn new(ui_timeout: Duration) -> Shared {
        Shared {
            host: RwLock::new(None),
            switches: RwLock::new(Switches::default()),
            ui_tools: RwLock::new(Vec::new()),
            windows: RwLock::new(Vec::new()),
            focused: RwLock::new(None),
            token: RwLock::new(None),
            activity: ActivityLog::default(),
            bridge: Bridge::default(),
            ui_timeout,
        }
    }

    pub fn host(&self) -> Option<Arc<dyn Host>> {
        read(&self.host).clone()
    }

    pub fn switches(&self) -> Switches {
        read(&self.switches).clone()
    }

    /// The folders of every window: tools may reach any folder open in the app.
    pub fn folders(&self) -> Vec<PathBuf> {
        let mut folders: Vec<PathBuf> = Vec::new();
        for window in read(&self.windows).iter() {
            for folder in &window.folders {
                if !folders.contains(folder) {
                    folders.push(folder.clone());
                }
            }
        }
        folders
    }

    pub fn windows(&self) -> Vec<McpWindow> {
        read(&self.windows).clone()
    }

    pub fn focused_window(&self) -> Option<String> {
        read(&self.focused).clone()
    }

    /// The window a UI tool call goes to (see `pick_window`).
    pub fn target_window(&self, arguments: &serde_json::Map<String, serde_json::Value>) -> Option<String> {
        let paths: Vec<PathBuf> = PATH_ARGUMENTS
            .iter()
            .filter_map(|key| arguments.get(*key).and_then(serde_json::Value::as_str))
            .filter_map(|path| paths::resolve(path).ok())
            .collect();
        pick_window(&self.windows(), self.focused_window().as_deref(), &paths)
    }

    pub fn ui_tools(&self) -> Vec<McpUiToolDef> {
        read(&self.ui_tools).clone()
    }

    pub fn token(&self) -> Option<String> {
        read(&self.token).clone()
    }

    pub fn ui_timeout(&self) -> Duration {
        self.ui_timeout
    }

    /// Destructive tools, and tools that reach outside the workspace, start off; the user's
    /// choices override.
    pub fn tool_enabled(&self, tool_name: &str, destructive: bool) -> bool {
        read(&self.switches)
            .tool_states
            .get(tool_name)
            .copied()
            .unwrap_or_else(|| tools::starts_on(tool_name, destructive))
    }

    pub fn record(&self, entry: McpActivity) {
        if let Some(host) = self.host() {
            host.emit("mcp-activity", json!(entry));
        }
        self.activity.push(entry);
    }
}

struct ServerSlot {
    running: Option<http::Running>,
    port: u16,
    error: Option<String>,
}

struct Inner {
    shared: Arc<Shared>,
    server: Mutex<ServerSlot>,
    /// None: `~/.nibtree`. Tests use a temporary folder.
    config_dir: Option<PathBuf>,
}

/// The app's one MCP server (cheap to clone, like the other shared services).
#[derive(Clone)]
pub struct Mcp {
    inner: Arc<Inner>,
}

impl Default for Mcp {
    fn default() -> Self {
        Mcp::with(None, bridge::UI_TIMEOUT)
    }
}

fn port_allowed(port: u16) -> bool {
    port >= 1024 || (cfg!(test) && port == 0)
}

impl Mcp {
    fn with(config_dir: Option<PathBuf>, ui_timeout: Duration) -> Mcp {
        Mcp {
            inner: Arc::new(Inner {
                shared: Arc::new(Shared::new(ui_timeout)),
                server: Mutex::new(ServerSlot {
                    running: None,
                    port: DEFAULT_PORT,
                    error: None,
                }),
                config_dir,
            }),
        }
    }

    #[cfg(test)]
    pub fn for_test(config_dir: PathBuf, ui_timeout: Duration) -> Mcp {
        Mcp::with(Some(config_dir), ui_timeout)
    }

    #[cfg(test)]
    pub fn shared(&self) -> &Shared {
        &self.inner.shared
    }

    #[cfg(test)]
    pub fn open_connections(&self) -> usize {
        lock(&self.inner.server).running.as_ref().map(http::Running::open_connections).unwrap_or(0)
    }

    #[cfg(test)]
    pub fn pending_ui_calls(&self) -> usize {
        self.inner.shared.bridge.pending_count()
    }

    fn config_dir(&self) -> AppResult<PathBuf> {
        match &self.inner.config_dir {
            Some(dir) => Ok(dir.clone()),
            None => Ok(config::config_dir_in(&config::home_dir()?)),
        }
    }

    fn home_dir(&self) -> Option<PathBuf> {
        match &self.inner.config_dir {
            Some(dir) => dir.parent().map(PathBuf::from),
            None => config::home_dir().ok(),
        }
    }

    pub fn attach_host(&self, host: Arc<dyn Host>) {
        *write(&self.inner.shared.host) = Some(host);
    }

    /// Loads the token from mcp.json, or makes one on first use.
    fn ensure_token(&self) -> AppResult<String> {
        if let Some(token) = self.inner.shared.token() {
            return Ok(token);
        }
        let dir = self.config_dir()?;
        let token = match token::read_in(&dir) {
            Some(file) => file.token,
            None => {
                let token = token::new_token()?;
                token::write_in(&dir, &McpFile { token: token.clone(), ..McpFile::default() })?;
                token
            }
        };
        *write(&self.inner.shared.token) = Some(token.clone());
        Ok(token)
    }

    /// mcp.json with the port and pid while running, the token alone otherwise.
    fn write_file(&self, running_port: Option<u16>) -> AppResult<()> {
        let Some(token) = self.inner.shared.token() else {
            return Ok(());
        };
        let file = McpFile {
            token,
            port: running_port,
            pid: running_port.map(|_| std::process::id()),
        };
        token::write_in(&self.config_dir()?, &file)
    }

    fn stop_locked(&self, slot: &mut ServerSlot) {
        if let Some(running) = slot.running.take() {
            self.inner.shared.bridge.cancel_all();
            // Nobody can read a recording any more. Tests run many servers at once and test
            // the recorder on its own, so it is not tied to their servers.
            #[cfg(not(test))]
            tools::recorder_stop();
            running.stop();
            let _ = self.write_file(None);
        }
    }

    /// Applies both switches, the port and the tool states; starts, restarts or stops the server.
    pub fn configure(&self, enabled: bool, cli_enabled: bool, port: u16, tool_states: HashMap<String, bool>) -> McpStatus {
        {
            let mut switches = write(&self.inner.shared.switches);
            switches.mcp = enabled;
            switches.cli = cli_enabled;
            switches.tool_states = tool_states;
        }
        let mut slot = lock(&self.inner.server);
        slot.port = port;
        slot.error = None;
        if !enabled && !cli_enabled {
            self.stop_locked(&mut slot);
            self.inner.shared.activity.clear();
            *write(&self.inner.shared.token) = None;
            drop(slot);
            return self.status();
        }
        if !port_allowed(port) {
            self.stop_locked(&mut slot);
            slot.error = Some("Choose a port from 1024 to 65535".to_string());
            drop(slot);
            return self.status();
        }
        if let Err(err) = self.ensure_token() {
            self.stop_locked(&mut slot);
            slot.error = Some(format!("Could not save the MCP token: {err}"));
            drop(slot);
            return self.status();
        }
        let same_port = slot.running.as_ref().is_some_and(|running| running.requested_port == port);
        if !same_port {
            self.stop_locked(&mut slot);
            match http::start(self.inner.shared.clone(), port) {
                Ok(running) => {
                    let bound = running.port;
                    slot.running = Some(running);
                    if let Err(err) = self.write_file(Some(bound)) {
                        slot.error = Some(format!("Could not write {}: {err}", token::FILE_NAME));
                    }
                }
                Err(message) => slot.error = Some(message),
            }
        }
        drop(slot);
        self.status()
    }

    pub fn status(&self) -> McpStatus {
        let switches = self.inner.shared.switches();
        let (running, port, error) = {
            let slot = lock(&self.inner.server);
            let running_port = slot.running.as_ref().map(|running| running.port);
            (running_port.is_some(), running_port.unwrap_or(slot.port), slot.error.clone())
        };
        let exe = install::current_exe();
        let home = self.home_dir();
        let installed = home.as_deref().and_then(|home| install::installed_link(home, &exe));
        let on_path = home.as_deref().is_some_and(|home| install::on_path(home, &login_path()));
        McpStatus {
            enabled: switches.mcp,
            cli_enabled: switches.cli,
            running,
            port,
            url: format!("http://127.0.0.1:{port}/mcp"),
            token: self.inner.shared.token(),
            error,
            cli_command: format!("{} cli", install::cli_program(&exe).display()),
            cli_installed_path: installed.map(crate::paths::to_ui),
            cli_folder: home.as_deref().map(|home| crate::paths::to_ui(install::bin_dir_in(home))).unwrap_or_default(),
            cli_on_path: on_path,
        }
    }

    pub fn tools(&self) -> Vec<McpToolInfo> {
        registry::infos(&self.inner.shared)
    }

    /// Keeps the valid tools; Err names the refused ones (bad name, or a clash with another tool).
    pub fn register_ui_tools(&self, defs: Vec<McpUiToolDef>) -> AppResult<()> {
        let (accepted, refused) = registry::accepted_ui_tools(defs);
        *write(&self.inner.shared.ui_tools) = accepted;
        if refused.is_empty() {
            Ok(())
        } else {
            Err(AppError::invalid(format!("Some UI tools were not registered: {}", refused.join("; "))))
        }
    }

    /// One window with these folders (the tests).
    #[cfg(test)]
    pub fn set_workspace(&self, folder_paths: &[String]) {
        let window = McpWindow {
            label: crate::windows::MAIN_LABEL.to_string(),
            title: String::new(),
            folders: paths::canonical_folders(folder_paths),
        };
        self.set_windows(vec![window], None);
    }

    /// The open windows and the one focused last, after any of them changed.
    pub fn set_windows(&self, windows: Vec<McpWindow>, focused: Option<String>) {
        *write(&self.inner.shared.windows) = windows;
        *write(&self.inner.shared.focused) = focused;
    }

    /// False when the request is unknown (already answered or timed out).
    pub fn ui_respond(&self, request_id: u64, result: McpUiResult) -> bool {
        self.inner.shared.bridge.respond(request_id, result)
    }

    pub fn regenerate_token(&self) -> AppResult<McpStatus> {
        let token = token::new_token()?;
        *write(&self.inner.shared.token) = Some(token);
        let running_port = lock(&self.inner.server).running.as_ref().map(|running| running.port);
        self.write_file(running_port)
            .map_err(|err| AppError::invalid(format!("Could not save the MCP token: {err}")))?;
        Ok(self.status())
    }

    pub fn activity(&self) -> Vec<McpActivity> {
        self.inner.shared.activity.entries()
    }

    pub fn install_cli(&self) -> AppResult<McpStatus> {
        let home = self.home_dir().ok_or_else(|| AppError::invalid("Could not find your home folder"))?;
        install::install_in(&home, &install::current_exe())?;
        Ok(self.status())
    }

    pub fn uninstall_cli(&self) -> AppResult<McpStatus> {
        let home = self.home_dir().ok_or_else(|| AppError::invalid("Could not find your home folder"))?;
        install::uninstall_in(&home, &install::current_exe())?;
        Ok(self.status())
    }

    /// App exit: stop listening and take the port out of mcp.json.
    pub fn shutdown(&self) {
        let mut slot = lock(&self.inner.server);
        self.stop_locked(&mut slot);
    }
}

/// The login shell's PATH: the app's own environment is minimal when started from Finder.
fn login_path() -> String {
    if cfg!(test) {
        return std::env::var("PATH").unwrap_or_default();
    }
    crate::git::cli::user_path().clone()
}

#[cfg(test)]
mod window_tests {
    use std::path::PathBuf;
    use std::time::Duration;

    use serde_json::{json, Map, Value};

    use super::{pick_window, Mcp, McpWindow};
    use crate::test_support::TestDir;

    fn window(label: &str, folders: &[&str]) -> McpWindow {
        McpWindow {
            label: label.to_string(),
            title: label.to_string(),
            folders: folders.iter().map(PathBuf::from).collect(),
        }
    }

    #[test]
    fn a_ui_tool_goes_to_the_window_holding_its_path_else_the_last_focused() {
        let windows = vec![window("main", &["/work/mono"]), window("window-2", &["/work/mono/web", "/other"])];
        let pick = |focused: Option<&str>, paths: &[&str]| {
            let paths: Vec<PathBuf> = paths.iter().map(PathBuf::from).collect();
            pick_window(&windows, focused, &paths)
        };
        assert_eq!(pick(None, &["/work/mono/web/a.ts"]).as_deref(), Some("window-2"), "the deepest folder wins");
        assert_eq!(pick(Some("window-2"), &["/work/mono/b.ts"]).as_deref(), Some("main"));
        assert_eq!(pick(Some("window-2"), &["/elsewhere"]).as_deref(), Some("window-2"));
        assert_eq!(pick(Some("window-2"), &[]).as_deref(), Some("window-2"));
        assert_eq!(pick(Some("gone"), &[]).as_deref(), Some("main"), "a closed window falls back to the first");
        assert_eq!(pick_window(&[], Some("main"), &[]), None);
    }

    #[test]
    fn tools_reach_the_folders_of_every_window_and_name_their_target() {
        let config = TestDir::new();
        let first = TestDir::new();
        let second = TestDir::new();
        let mcp = Mcp::for_test(config.path.join(".nibtree"), Duration::from_secs(1));
        mcp.set_windows(
            vec![
                McpWindow {
                    label: "main".into(),
                    title: "first".into(),
                    folders: vec![first.path.clone()],
                },
                McpWindow {
                    label: "window-2".into(),
                    title: "second".into(),
                    folders: vec![second.path.clone(), first.path.clone()],
                },
            ],
            Some("main".into()),
        );
        assert_eq!(mcp.shared().folders(), vec![first.path.clone(), second.path.clone()], "the union, once each");
        let arguments = |value: Value| -> Map<String, Value> { value.as_object().cloned().unwrap_or_default() };
        let in_second = arguments(json!({ "filePath": second.file_string("new.txt") }));
        assert_eq!(mcp.shared().target_window(&in_second).as_deref(), Some("window-2"));
        assert_eq!(mcp.shared().target_window(&arguments(json!({ "line": 3 }))).as_deref(), Some("main"));
        assert_eq!(
            mcp.shared().target_window(&arguments(json!({ "filePath": "relative/path.txt" }))).as_deref(),
            Some("main"),
            "a relative path names no window"
        );
        mcp.set_windows(Vec::new(), None);
        assert!(mcp.shared().folders().is_empty());
        assert_eq!(mcp.shared().target_window(&in_second), None);
    }
}
