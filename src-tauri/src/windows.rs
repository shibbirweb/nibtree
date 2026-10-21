//! The app's windows (File > New Window): which workspace each one shows, which one was
//! focused last, where it sits on screen, and the window session kept in state.json so a
//! restart reopens them. Everything here is plain bookkeeping (tested below); lib.rs and
//! commands/window.rs apply it to the real windows.
//!
//! A folder belongs to one window at a time: opening a folder that another window already
//! shows focuses that window instead. Ownership compares canonical paths (symlinks and `..`
//! resolved), so two spellings of one folder count as the same folder.

use crate::paths::RealPath;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

/// The window tauri.conf.json creates at start.
pub const MAIN_LABEL: &str = "main";
/// Every other window is `window-<n>`; the capability in capabilities/default.json covers them.
pub const LABEL_PREFIX: &str = "window-";
/// The state.json key holding the window session (written by the backend only).
pub const SESSION_KEY: &str = "windows";
/// The settings.json key of "Reopen windows on start".
pub const REOPEN_SETTING: &str = "reopenWindows";
/// More windows than this in a saved session are dropped (a hand edit, or a runaway loop).
pub const MAX_SESSION_WINDOWS: usize = 20;
const MAX_FOLDERS_PER_WINDOW: usize = 64;
/// How far a new window sits from the one it was opened from, like macOS document windows.
pub const CASCADE_OFFSET: f64 = 28.0;
const MIN_SIZE: (f64, f64) = (400.0, 300.0);
const MAX_SIZE: f64 = 20000.0;
/// Enough of a window's top edge must be on a screen to grab it, or the saved position is dropped.
const GRAB_WIDTH: f64 = 100.0;
const GRAB_HEIGHT: f64 = 30.0;

/// A window's outer position and inner size, in logical pixels.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Bounds {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

/// What a window shows: folders, or a workspace file and its folders. No folders: the welcome screen.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowOpen {
    pub folder_paths: Vec<String>,
    pub workspace_file: Option<String>,
}

impl WindowOpen {
    pub fn is_empty(&self) -> bool {
        self.folder_paths.is_empty() && self.workspace_file.is_none()
    }
}

/// What a window's page should do when it starts (or reloads).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub enum WindowStart {
    /// Open this (a restored window, Open Folder in New Window, or a reload of what it showed).
    #[serde(rename_all = "camelCase")]
    Open { label: String, open: WindowOpen },
    /// The page decides: the folder from the command line, else the last session (the main window at start).
    #[serde(rename_all = "camelCase")]
    Default { label: String },
}

/// What a second start of the app asks for (Windows and Linux hand its arguments to the running app): its
/// first argument, resolved against the folder it was started in, as a folder or a workspace file.
/// None when it names nothing, like `LaunchMode::from_args` (an option, or the merge tool).
#[cfg(any(windows, target_os = "linux", test))]
pub fn open_for_arguments(args: &[String], cwd: &Path) -> Option<WindowOpen> {
    let arg = args.first().filter(|arg| !arg.starts_with('-') && arg.as_str() != "merge")?;
    let path = cwd.join(arg);
    let shown = crate::paths::real(&path).map(crate::paths::to_ui).unwrap_or_else(|_| crate::paths::to_ui(&path));
    let is_workspace_file = crate::workspace_file::WORKSPACE_SUFFIXES.iter().any(|suffix| shown.ends_with(suffix));
    Some(if is_workspace_file {
        WindowOpen {
            folder_paths: Vec::new(),
            workspace_file: Some(shown),
        }
    } else {
        WindowOpen {
            folder_paths: vec![shown],
            workspace_file: None,
        }
    })
}

/// One window of a saved session.
#[derive(Debug, Clone, PartialEq)]
pub struct SessionEntry {
    pub open: WindowOpen,
    pub bounds: Option<Bounds>,
}

/// What a window shows, with the canonical paths ownership compares.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct Shown {
    pub open: WindowOpen,
    pub folders: Vec<PathBuf>,
    pub workspace_file: Option<PathBuf>,
}

impl Shown {
    /// Canonicalizes what the page reported; folders that do not exist keep their spelling.
    pub fn resolve(open: WindowOpen) -> Shown {
        let mut folders: Vec<PathBuf> = Vec::new();
        for folder_path in &open.folder_paths {
            let folder = canonical(folder_path);
            if !folders.contains(&folder) {
                folders.push(folder);
            }
        }
        let workspace_file = open.workspace_file.as_deref().map(canonical);
        Shown {
            open,
            folders,
            workspace_file,
        }
    }
}

/// The canonical form of a path, or the path itself when it cannot be resolved.
pub fn canonical(path: &str) -> PathBuf {
    Path::new(path).real_path().unwrap_or_else(|_| PathBuf::from(path))
}

#[derive(Debug, Clone)]
struct Entry {
    label: String,
    /// What the page opens when it starts; None lets the page decide.
    intent: Option<WindowOpen>,
    /// The intent resolved, so a window still loading already owns its folders.
    expected: Option<Shown>,
    /// What it shows now; None until the page first reports.
    shown: Option<Shown>,
    title: String,
    bounds: Option<Bounds>,
}

/// A window as the MCP tools see it.
#[derive(Debug, Clone, PartialEq)]
pub struct WindowSummary {
    pub label: String,
    pub title: String,
    pub folders: Vec<PathBuf>,
}

/// Every open window, in the order they were opened.
#[derive(Debug, Default)]
pub struct WindowBook {
    windows: Vec<Entry>,
    /// Labels by focus, most recent last.
    focus_order: Vec<String>,
    last_number: u32,
    /// The last window closed on its own, kept for the session: closing it quits the app,
    /// and the next start should bring it back.
    last_closed: Option<SessionEntry>,
}

impl WindowBook {
    /// A label never used before in this run: `window-2`, `window-3`, ...
    pub fn new_label(&mut self) -> String {
        loop {
            self.last_number = self.last_number.max(1) + 1;
            let label = format!("{LABEL_PREFIX}{}", self.last_number);
            if !self.contains(&label) {
                return label;
            }
        }
    }

    pub fn contains(&self, label: &str) -> bool {
        self.windows.iter().any(|entry| entry.label == label)
    }

    #[cfg(test)]
    pub fn len(&self) -> usize {
        self.windows.len()
    }

    /// Registers a window; adding a known label only replaces its intent.
    pub fn add(&mut self, label: &str, intent: Option<WindowOpen>, bounds: Option<Bounds>) {
        let expected = intent.clone().filter(|open| !open.is_empty()).map(Shown::resolve);
        if let Some(entry) = self.entry_mut(label) {
            entry.intent = intent;
            entry.expected = expected;
            return;
        }
        self.last_closed = None;
        self.windows.push(Entry {
            label: label.to_string(),
            intent,
            expected,
            shown: None,
            title: String::new(),
            bounds,
        });
    }

    fn entry(&self, label: &str) -> Option<&Entry> {
        self.windows.iter().find(|entry| entry.label == label)
    }

    fn entry_mut(&mut self, label: &str) -> Option<&mut Entry> {
        self.windows.iter_mut().find(|entry| entry.label == label)
    }

    /// What the page of `label` should open: what it showed before a reload, else its intent.
    pub fn start(&mut self, label: &str) -> WindowStart {
        if !self.contains(label) {
            self.add(label, None, None);
        }
        let entry = self.entry(label);
        let open = entry
            .and_then(|entry| entry.shown.as_ref().map(|shown| shown.open.clone()))
            .or_else(|| entry.and_then(|entry| entry.intent.clone()));
        match open {
            Some(open) => WindowStart::Open {
                label: label.to_string(),
                open,
            },
            None => WindowStart::Default { label: label.to_string() },
        }
    }

    /// The page reported what it shows now. False when the window is unknown (closed meanwhile).
    pub fn set_shown(&mut self, label: &str, shown: Shown, title: &str) -> bool {
        match self.entry_mut(label) {
            Some(entry) => {
                entry.shown = Some(shown);
                entry.title = title.to_string();
                true
            }
            None => false,
        }
    }

    #[cfg(test)]
    pub fn folders(&self, label: &str) -> Vec<PathBuf> {
        self.entry(label)
            .and_then(|entry| entry.shown.as_ref())
            .map(|shown| shown.folders.clone())
            .unwrap_or_default()
    }

    pub fn set_bounds(&mut self, label: &str, bounds: Bounds) {
        if let Some(entry) = self.entry_mut(label) {
            entry.bounds = Some(bounds);
        }
    }

    pub fn bounds(&self, label: &str) -> Option<Bounds> {
        self.entry(label).and_then(|entry| entry.bounds)
    }

    pub fn focus(&mut self, label: &str) {
        if !self.contains(label) {
            return;
        }
        self.focus_order.retain(|candidate| candidate != label);
        self.focus_order.push(label.to_string());
    }

    /// The window focused last (Nibtree is usually not the active app while an agent
    /// calls it, so "focused now" would be nobody); the first window when none was focused yet.
    pub fn focused(&self) -> Option<String> {
        self.focus_order
            .iter()
            .rev()
            .find(|label| self.contains(label))
            .cloned()
            .or_else(|| self.windows.first().map(|entry| entry.label.clone()))
    }

    /// The other window that already shows `wanted`, to focus instead of opening it again:
    /// - a workspace file: the window showing that file;
    /// - one folder: a window with that folder among its folders;
    /// - several folders: a window with exactly those folders.
    pub fn owner(&self, wanted: &Shown, except: Option<&str>) -> Option<String> {
        // A window that has not reported yet owns what it was opened for.
        let candidates = self
            .windows
            .iter()
            .filter(|entry| Some(entry.label.as_str()) != except)
            .filter_map(|entry| entry.shown.as_ref().or(entry.expected.as_ref()).map(|shown| (entry, shown)));
        let found = match (&wanted.workspace_file, wanted.folders.as_slice()) {
            (Some(file), _) => candidates
                .filter(|(_, shown)| shown.workspace_file.as_ref() == Some(file))
                .map(|(entry, _)| entry)
                .next(),
            (None, []) => None,
            (None, [folder]) => candidates
                .filter(|(_, shown)| shown.folders.contains(folder))
                .map(|(entry, _)| entry)
                .next(),
            (None, folders) => candidates
                .filter(|(_, shown)| same_set(&shown.folders, folders))
                .map(|(entry, _)| entry)
                .next(),
        };
        found.map(|entry| entry.label.clone())
    }

    /// The windows a path concerns: those with a folder holding it, or a folder inside it (a
    /// repository enclosing the workspace folder). Events about the path go only to these.
    pub fn windows_for_path(&self, path: &Path) -> Vec<String> {
        self.windows
            .iter()
            .filter(|entry| {
                entry.shown.as_ref().is_some_and(|shown| {
                    shown
                        .folders
                        .iter()
                        .any(|folder| path.starts_with(folder) || folder.starts_with(path))
                })
            })
            .map(|entry| entry.label.clone())
            .collect()
    }

    /// Every window's folders, for the MCP tools.
    pub fn summaries(&self) -> Vec<WindowSummary> {
        self.windows
            .iter()
            .map(|entry| WindowSummary {
                label: entry.label.clone(),
                title: entry.title.clone(),
                folders: entry.shown.as_ref().map(|shown| shown.folders.clone()).unwrap_or_default(),
            })
            .collect()
    }

    /// The window closed. The last one stays in the session: closing it quits the app.
    /// Returns whether it was known.
    pub fn remove(&mut self, label: &str) -> bool {
        let Some(index) = self.windows.iter().position(|entry| entry.label == label) else {
            return false;
        };
        let entry = self.windows.remove(index);
        self.focus_order.retain(|candidate| candidate != label);
        if self.windows.is_empty() {
            self.last_closed = Some(session_entry(&entry));
        }
        true
    }

    /// The windows to reopen at the next start, in the order they were opened.
    pub fn session(&self) -> Vec<SessionEntry> {
        if self.windows.is_empty() {
            return self.last_closed.iter().cloned().collect();
        }
        self.windows.iter().map(session_entry).collect()
    }
}

fn session_entry(entry: &Entry) -> SessionEntry {
    let open = entry
        .shown
        .as_ref()
        .map(|shown| shown.open.clone())
        .or_else(|| entry.intent.clone())
        .unwrap_or_default();
    SessionEntry {
        open,
        bounds: entry.bounds,
    }
}

fn same_set(left: &[PathBuf], right: &[PathBuf]) -> bool {
    left.len() == right.len() && left.iter().all(|folder| right.contains(folder))
}

// ---------------------------------------------------------------------------
// The saved session

/// The session as state.json stores it.
pub fn session_to_json(entries: &[SessionEntry]) -> Value {
    Value::Array(
        entries
            .iter()
            .map(|entry| {
                json!({
                    "folders": entry.open.folder_paths,
                    "workspaceFile": entry.open.workspace_file,
                    "bounds": entry.bounds,
                })
            })
            .collect(),
    )
}

fn parse_bounds(value: &Value) -> Option<Bounds> {
    let number = |key: &str| value.get(key).and_then(Value::as_f64).filter(|number| number.is_finite());
    let bounds = Bounds {
        x: number("x")?,
        y: number("y")?,
        width: number("width")?,
        height: number("height")?,
    };
    let size_ok = (MIN_SIZE.0..=MAX_SIZE).contains(&bounds.width) && (MIN_SIZE.1..=MAX_SIZE).contains(&bounds.height);
    let position_ok = bounds.x.abs() <= MAX_SIZE * 4.0 && bounds.y.abs() <= MAX_SIZE * 4.0;
    (size_ok && position_ok).then_some(bounds)
}

/// Reads a saved session, dropping whatever is malformed: a hand edit never breaks the start.
pub fn parse_session(value: Option<&Value>) -> Vec<SessionEntry> {
    let Some(Value::Array(items)) = value else {
        return Vec::new();
    };
    let mut entries: Vec<SessionEntry> = Vec::new();
    for item in items {
        let Value::Object(object) = item else {
            continue;
        };
        let folder_paths: Vec<String> = match object.get("folders") {
            Some(Value::Array(folders)) => folders
                .iter()
                .filter_map(Value::as_str)
                .filter(|folder| !folder.trim().is_empty())
                .take(MAX_FOLDERS_PER_WINDOW)
                .map(str::to_string)
                .collect(),
            _ => Vec::new(),
        };
        let workspace_file = object
            .get("workspaceFile")
            .and_then(Value::as_str)
            .filter(|file| !file.trim().is_empty())
            .map(str::to_string);
        let open = WindowOpen {
            folder_paths,
            workspace_file,
        };
        // The same workspace twice would only be focused, not opened twice.
        if !open.is_empty() && entries.iter().any(|entry| entry.open == open) {
            continue;
        }
        entries.push(SessionEntry {
            open,
            bounds: object.get("bounds").and_then(parse_bounds),
        });
        if entries.len() >= MAX_SESSION_WINDOWS {
            break;
        }
    }
    entries
}

/// "Reopen windows on start"; on unless settings.json turns it off.
pub fn reopen_windows(settings: Option<&Value>) -> bool {
    settings
        .and_then(|settings| settings.get(REOPEN_SETTING))
        .and_then(Value::as_bool)
        .unwrap_or(true)
}

/// The windows to open at start. Empty: only the main window, which then restores the last
/// folders itself (no saved window list yet, the setting is off, or a folder came on the
/// command line, which opens only that folder).
pub fn restore_plan(settings: Option<&Value>, state: Option<&Value>, launch_folder: bool) -> Vec<SessionEntry> {
    if launch_folder || !reopen_windows(settings) {
        return Vec::new();
    }
    parse_session(state.and_then(|state| state.get(SESSION_KEY)))
}

/// Whether a window at `bounds` can be grabbed on one of `screens`: monitors change between runs.
pub fn on_screen(bounds: &Bounds, screens: &[Bounds]) -> bool {
    screens.iter().any(|screen| {
        let left = bounds.x.max(screen.x);
        let right = (bounds.x + bounds.width).min(screen.x + screen.width);
        let top = bounds.y.max(screen.y);
        let bottom = (bounds.y + GRAB_HEIGHT).min(screen.y + screen.height);
        right - left >= GRAB_WIDTH && bottom - top >= GRAB_HEIGHT / 2.0
    })
}

/// Where a new window goes: down and right of the window it was opened from.
pub fn cascade(from: &Bounds) -> (f64, f64) {
    (from.x + CASCADE_OFFSET, from.y + CASCADE_OFFSET)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::UiText;

    fn shown(folders: &[&str], file: Option<&str>) -> Shown {
        Shown {
            open: WindowOpen {
                folder_paths: folders.iter().map(|folder| folder.to_string()).collect(),
                workspace_file: file.map(str::to_string),
            },
            folders: folders.iter().map(PathBuf::from).collect(),
            workspace_file: file.map(PathBuf::from),
        }
    }

    fn book_with(windows: &[(&str, &[&str])]) -> WindowBook {
        let mut book = WindowBook::default();
        for (label, folders) in windows {
            book.add(label, None, None);
            book.set_shown(label, shown(folders, None), label);
        }
        book
    }

    #[test]
    fn labels_are_unique_and_never_reused() {
        let mut book = WindowBook::default();
        book.add(MAIN_LABEL, None, None);
        let second = book.new_label();
        assert_eq!(second, "window-2");
        book.add(&second, None, None);
        let third = book.new_label();
        assert_eq!(third, "window-3");
        book.add(&third, None, None);
        assert!(book.remove(&third));
        assert_eq!(book.new_label(), "window-4", "a closed window's label is not handed out again");
        // A label someone else took (a restored window) is skipped.
        book.add("window-5", None, None);
        assert_eq!(book.new_label(), "window-6");
        assert!(book.new_label().starts_with(LABEL_PREFIX));
    }

    #[test]
    fn start_prefers_what_the_window_shows_then_its_intent() {
        let mut book = WindowBook::default();
        assert_eq!(book.start(MAIN_LABEL), WindowStart::Default { label: MAIN_LABEL.into() });
        let intent = WindowOpen {
            folder_paths: vec!["/work/app".into()],
            workspace_file: None,
        };
        book.add("window-2", Some(intent.clone()), None);
        assert_eq!(
            book.start("window-2"),
            WindowStart::Open {
                label: "window-2".into(),
                open: intent
            }
        );
        // A reload reopens what it showed, also an empty welcome screen.
        book.set_shown("window-2", shown(&[], None), "Nibtree");
        assert_eq!(
            book.start("window-2"),
            WindowStart::Open {
                label: "window-2".into(),
                open: WindowOpen::default()
            }
        );
        assert!(!book.set_shown("window-9", shown(&["/x"], None), "x"), "an unknown window is ignored");
    }

    #[test]
    fn the_owner_of_a_folder_is_found_and_the_asking_window_is_skipped() {
        let book = book_with(&[(MAIN_LABEL, &["/work/app"]), ("window-2", &["/work/api", "/work/web"])]);
        assert_eq!(book.owner(&shown(&["/work/app"], None), None).as_deref(), Some(MAIN_LABEL));
        assert_eq!(book.owner(&shown(&["/work/app"], None), Some(MAIN_LABEL)), None);
        // One folder of a multi-folder window counts; a set must match exactly (any order).
        assert_eq!(book.owner(&shown(&["/work/web"], None), None).as_deref(), Some("window-2"));
        assert_eq!(book.owner(&shown(&["/work/web", "/work/api"], None), None).as_deref(), Some("window-2"));
        assert_eq!(book.owner(&shown(&["/work/web", "/work/app"], None), None), None);
        // A folder inside an open one is not the same folder.
        assert_eq!(book.owner(&shown(&["/work/app/sub"], None), None), None);
        assert_eq!(book.owner(&shown(&[], None), None), None);
    }

    #[test]
    fn a_window_still_loading_owns_what_it_was_opened_for() {
        let mut book = WindowBook::default();
        book.add(MAIN_LABEL, None, None);
        let intent = WindowOpen {
            folder_paths: vec!["/work/app".into()],
            workspace_file: None,
        };
        book.add("window-2", Some(intent), None);
        // A second Open Folder in New Window right away focuses the first one.
        assert_eq!(book.owner(&shown(&["/work/app"], None), None).as_deref(), Some("window-2"));
        // Once it reports, what it shows counts instead.
        book.set_shown("window-2", shown(&["/work/other"], None), "other");
        assert_eq!(book.owner(&shown(&["/work/app"], None), None), None);
        // An empty New Window owns nothing.
        book.add("window-3", Some(WindowOpen::default()), None);
        assert_eq!(book.owner(&shown(&[], None), None), None);
    }

    #[test]
    fn workspace_files_are_owned_by_file() {
        let mut book = WindowBook::default();
        book.add(MAIN_LABEL, None, None);
        book.set_shown(MAIN_LABEL, shown(&["/work/a", "/work/b"], Some("/work/team.code-workspace")), "team");
        assert_eq!(
            book.owner(&shown(&[], Some("/work/team.code-workspace")), None).as_deref(),
            Some(MAIN_LABEL)
        );
        assert_eq!(book.owner(&shown(&[], Some("/work/other.code-workspace")), None), None);
    }

    #[test]
    fn a_second_start_opens_its_folder_or_workspace_file() {
        let dir = tempfile::TempDir::new().unwrap();
        std::fs::create_dir_all(dir.path().join("repo")).unwrap();
        std::fs::write(dir.path().join("team.code-workspace"), "{}").unwrap();
        let cwd = dir.path();
        let args = |values: &[&str]| values.iter().map(|value| value.to_string()).collect::<Vec<_>>();
        let repo = crate::paths::real(cwd.join("repo")).unwrap().ui();

        let relative = open_for_arguments(&args(&["repo"]), cwd).unwrap();
        assert_eq!(relative.folder_paths, vec![repo.clone()]);
        assert_eq!(relative.workspace_file, None);
        let absolute = open_for_arguments(&args(&[&repo]), Path::new("/elsewhere")).unwrap();
        assert_eq!(absolute.folder_paths, vec![repo]);

        let file = open_for_arguments(&args(&["team.code-workspace"]), cwd).unwrap();
        assert!(file.folder_paths.is_empty());
        assert!(file.workspace_file.unwrap().ends_with("/team.code-workspace"));

        assert_eq!(open_for_arguments(&args(&[]), cwd), None);
        assert_eq!(open_for_arguments(&args(&["--flag"]), cwd), None);
        assert_eq!(open_for_arguments(&args(&["merge", "a", "b", "c", "d"]), cwd), None);
    }

    #[test]
    fn resolving_canonicalizes_so_two_spellings_match() {
        let dir = tempfile::TempDir::new().unwrap();
        let real = dir.path().join("repo");
        std::fs::create_dir_all(real.join("sub")).unwrap();
        let plain = real.ui();
        let roundabout = format!("{}/sub/..", plain);
        let mut book = WindowBook::default();
        book.add(MAIN_LABEL, None, None);
        book.set_shown(
            MAIN_LABEL,
            Shown::resolve(WindowOpen {
                folder_paths: vec![plain.clone(), plain.clone()],
                workspace_file: None,
            }),
            "repo",
        );
        assert_eq!(book.folders(MAIN_LABEL).len(), 1, "duplicates are dropped");
        let wanted = Shown::resolve(WindowOpen {
            folder_paths: vec![roundabout],
            workspace_file: None,
        });
        assert_eq!(book.owner(&wanted, None).as_deref(), Some(MAIN_LABEL));
        // A missing folder keeps its spelling instead of failing.
        assert_eq!(canonical("/definitely/missing/folder"), PathBuf::from("/definitely/missing/folder"));
    }

    #[test]
    fn events_about_a_path_go_to_the_windows_it_concerns() {
        let book = book_with(&[
            (MAIN_LABEL, &["/work/mono"]),
            ("window-2", &["/work/mono/packages/web"]),
            ("window-3", &["/other"]),
        ]);
        let mut both = book.windows_for_path(Path::new("/work/mono/packages/web/src"));
        both.sort();
        assert_eq!(both, vec!["main".to_string(), "window-2".to_string()]);
        assert_eq!(book.windows_for_path(Path::new("/work/mono/README.md")), vec!["main".to_string()]);
        // A repository enclosing a workspace folder concerns that window too.
        assert_eq!(book.windows_for_path(Path::new("/")).len(), 3);
        assert!(book.windows_for_path(Path::new("/elsewhere")).is_empty());

    }

    #[test]
    fn focus_follows_the_last_focused_window_and_survives_closing() {
        let mut book = book_with(&[(MAIN_LABEL, &["/a"]), ("window-2", &["/b"]), ("window-3", &["/c"])]);
        assert_eq!(book.focused().as_deref(), Some(MAIN_LABEL), "nothing focused yet: the first window");
        book.focus("window-3");
        book.focus("window-2");
        assert_eq!(book.focused().as_deref(), Some("window-2"));
        book.remove("window-2");
        assert_eq!(book.focused().as_deref(), Some("window-3"));
        book.focus("window-9");
        assert_eq!(book.focused().as_deref(), Some("window-3"), "unknown labels are ignored");
    }

    #[test]
    fn closing_windows_cleans_up_and_the_last_one_stays_in_the_session() {
        let mut book = book_with(&[(MAIN_LABEL, &["/a"]), ("window-2", &["/b"])]);
        book.set_bounds(
            "window-2",
            Bounds {
                x: 10.0,
                y: 20.0,
                width: 1200.0,
                height: 800.0,
            },
        );
        assert_eq!(book.session().len(), 2);
        assert!(book.remove(MAIN_LABEL));
        assert!(!book.remove(MAIN_LABEL), "closing twice is harmless");
        assert_eq!(book.len(), 1);
        assert!(book.windows_for_path(Path::new("/a/x")).is_empty(), "a closed window owns nothing");
        assert_eq!(book.session().len(), 1, "a window closed while others stay is forgotten");
        assert!(book.remove("window-2"));
        let session = book.session();
        assert_eq!(session.len(), 1, "the last window closed quits the app and comes back next time");
        assert_eq!(session[0].open.folder_paths, vec!["/b".to_string()]);
        assert_eq!(session[0].bounds.map(|bounds| bounds.width), Some(1200.0));
        assert_eq!(book.focused(), None);
        // A new window after that starts a fresh session.
        book.add("window-4", None, None);
        assert_eq!(book.session(), vec![SessionEntry { open: WindowOpen::default(), bounds: None }]);
    }

    #[test]
    fn the_session_round_trips_through_json() {
        let entries = vec![
            SessionEntry {
                open: WindowOpen {
                    folder_paths: vec!["/a".into(), "/b".into()],
                    workspace_file: Some("/w.code-workspace".into()),
                },
                bounds: Some(Bounds {
                    x: -1200.0,
                    y: 40.0,
                    width: 1400.0,
                    height: 880.0,
                }),
            },
            SessionEntry {
                open: WindowOpen::default(),
                bounds: None,
            },
        ];
        assert_eq!(parse_session(Some(&session_to_json(&entries))), entries);
    }

    #[test]
    fn a_malformed_session_is_dropped_piece_by_piece() {
        let value = json!([
            "not an object",
            { "folders": ["/a", 3, "", "/b"], "workspaceFile": 7, "bounds": { "x": 0, "y": 0, "width": 50, "height": 900 } },
            { "folders": ["/a", "/b"] },
            { "folders": "nope", "bounds": { "x": 1, "y": 2, "width": 1000, "height": 700 } },
            null,
        ]);
        let entries = parse_session(Some(&value));
        assert_eq!(entries.len(), 2, "the duplicate of /a and /b is dropped");
        assert_eq!(entries[0].open.folder_paths, vec!["/a".to_string(), "/b".to_string()]);
        assert_eq!(entries[0].open.workspace_file, None);
        assert_eq!(entries[0].bounds, None, "a 50 pixel wide window is not restored");
        assert!(entries[1].open.is_empty());
        assert_eq!(entries[1].bounds.map(|bounds| bounds.height), Some(700.0));
        assert!(parse_session(Some(&json!({ "folders": [] }))).is_empty());
        assert!(parse_session(None).is_empty());

        let many: Vec<Value> = (0..50).map(|index| json!({ "folders": [format!("/f{index}")] })).collect();
        assert_eq!(parse_session(Some(&Value::Array(many))).len(), MAX_SESSION_WINDOWS);
    }

    #[test]
    fn the_restore_plan_follows_the_setting_and_the_command_line() {
        let state = json!({ "windows": [{ "folders": ["/a"] }, { "folders": ["/b"] }] });
        assert_eq!(restore_plan(None, Some(&state), false).len(), 2, "on by default");
        assert_eq!(restore_plan(Some(&json!({ "reopenWindows": "yes" })), Some(&state), false).len(), 2);
        assert!(restore_plan(Some(&json!({ "reopenWindows": false })), Some(&state), false).is_empty());
        assert!(restore_plan(None, Some(&state), true).is_empty(), "a folder argument opens only that folder");
        assert!(restore_plan(None, Some(&json!({})), false).is_empty(), "no window list yet");
        assert!(restore_plan(None, None, false).is_empty());
    }

    #[test]
    fn saved_positions_must_be_on_a_screen() {
        let screen = Bounds {
            x: 0.0,
            y: 0.0,
            width: 1440.0,
            height: 900.0,
        };
        let window = |x: f64, y: f64| Bounds {
            x,
            y,
            width: 1000.0,
            height: 700.0,
        };
        assert!(on_screen(&window(100.0, 50.0), &[screen]));
        assert!(on_screen(&window(-900.0, 50.0), &[screen]), "mostly off to the left, the title bar still shows");
        assert!(!on_screen(&window(-1400.0, 50.0), &[screen]));
        assert!(!on_screen(&window(100.0, 2000.0), &[screen]), "on a screen that is gone");
        assert!(!on_screen(&window(100.0, 50.0), &[]));
        assert_eq!(cascade(&window(100.0, 50.0)), (128.0, 78.0));
    }
}
