//! Watches a workspace folder (including every `.git` inside it) and emits
//! debounced `repo-changed` and `workspace-changed` events so the UI
//! refreshes without polling. Each event says what kind of change happened
//! (refs, config, index, operation state, work tree contents or structure),
//! so the frontend reads only what may be out of date: the Log and branches
//! only on refs changes, the Files panel only when entries come and go.
//! Bursts (npm install, a big checkout) are held and merged so they cost one
//! refresh every second or two instead of one every 300 ms.

use crate::paths::RealPath;
use std::collections::HashMap;
use std::path::{Component, Path, PathBuf};
use std::sync::mpsc::{self, RecvTimeoutError};
use std::time::{Duration, Instant};

use git2::Repository;
use notify_debouncer_full::notify::event::{EventKind, ModifyKind};
use notify_debouncer_full::{new_debouncer_opt, notify, notify::RecursiveMode, DebounceEventResult, NoCache};
use serde::Serialize;
use crate::host::HostApp;

use crate::error::{AppError, AppResult};
use crate::git::workspace::{deepest_repo_index, SKIPPED_DIRS};
use crate::state::RepoWatcher;
use crate::symbols::language_for;

/// What changed in one repository during a batch.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoChange {
    /// HEAD, a branch, tag, remote branch or the stash moved, or a linked work tree changed.
    pub refs: bool,
    /// The repository config changed (remotes, upstreams).
    pub config: bool,
    /// The index changed, or something else in `.git` that status reads.
    pub index: bool,
    /// A merge, rebase, cherry-pick, revert or bisect started, moved on or ended.
    pub op_state: bool,
    /// A visible (not ignored) work tree path changed.
    pub work_tree: bool,
    /// Entries were created, deleted or renamed, or ignore rules changed.
    pub structure: bool,
    /// A `.gitattributes` file in the work tree changed (what Git LFS stores, among others).
    pub attributes: bool,
}

impl RepoChange {
    fn merge(&mut self, other: RepoChange) {
        self.refs |= other.refs;
        self.config |= other.config;
        self.index |= other.index;
        self.op_state |= other.op_state;
        self.work_tree |= other.work_tree;
        self.structure |= other.structure;
        self.attributes |= other.attributes;
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RepoChanged {
    repo_path: String,
    #[serde(flatten)]
    change: RepoChange,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceChanged {
    workspace_root: String,
    /// A repository may have appeared or disappeared: the frontend rescans.
    repos_changed: bool,
    /// Entries were created, deleted or renamed (or ignore rules changed): listings are out of date.
    structure: bool,
    /// Files outside every repository changed; they have no status to follow.
    outside_repos: bool,
}

/// Open files that changed where no status follows them (git ignores them).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct OpenFilesChanged {
    file_paths: Vec<String>,
}

/// What one debounced batch changed.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Attribution {
    /// `(index into repo_roots, change)`, in `repo_roots` order.
    pub repos: Vec<(usize, RepoChange)>,
    /// Visible entries were created, deleted or renamed anywhere, or ignore rules changed.
    pub structure: bool,
    /// Files outside every repository changed.
    pub outside_repos: bool,
    /// A `.git` appeared or disappeared, a repository (or a folder holding
    /// one) was removed or moved, or a folder with a `.git` was moved in.
    pub repos_changed: bool,
    /// Files open in a tab that changed while git ignores them, as the page named them.
    pub open_files: Vec<String>,
}

impl Attribution {
    /// Folds a later batch into this one.
    pub fn merge(&mut self, other: Attribution) {
        for (index, change) in other.repos {
            match self.repos.iter_mut().find(|(candidate, _)| *candidate == index) {
                Some((_, existing)) => existing.merge(change),
                None => self.repos.push((index, change)),
            }
        }
        self.repos.sort_by_key(|(index, _)| *index);
        self.structure |= other.structure;
        self.outside_repos |= other.outside_repos;
        self.repos_changed |= other.repos_changed;
        for file_path in other.open_files {
            if !self.open_files.contains(&file_path) {
                self.open_files.push(file_path);
            }
        }
    }

    fn workspace_changed(&self) -> bool {
        self.structure || self.outside_repos || self.repos_changed
    }
}

/// What a path inside `.git` means for the UI.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum GitDirChange {
    Refs,
    Config,
    Index,
    OpState,
    /// `info/exclude`: what is ignored, so status and listings.
    Ignore,
}

/// Classifies `git_relative` (a path inside `.git`); None for internals that
/// change constantly but never affect what we show (objects, logs, locks).
fn classify_git_path(git_relative: &Path, structural: bool) -> Option<GitDirChange> {
    if git_relative.extension().is_some_and(|ext| ext == "lock") {
        return None;
    }
    let names: Vec<&str> = git_relative
        .components()
        .filter_map(|component| match component {
            Component::Normal(name) => name.to_str(),
            _ => None,
        })
        .collect();
    let first = *names.first()?;
    match first {
        "objects" | "lfs" | "hooks" | "description" | "COMMIT_EDITMSG" | "FETCH_HEAD" | "ORIG_HEAD" | "gc.pid" | "gc.log" => None,
        // Dropping a stash other than the newest only rewrites its reflog.
        "logs" => (names[1..] == ["refs", "stash"]).then_some(GitDirChange::Refs),
        "HEAD" | "packed-refs" | "refs" | "shallow" => Some(GitDirChange::Refs),
        "config" | "config.worktree" => Some(GitDirChange::Config),
        "MERGE_HEAD" | "MERGE_MSG" | "MERGE_MODE" | "AUTO_MERGE" | "CHERRY_PICK_HEAD" | "REVERT_HEAD" | "REBASE_HEAD"
        | "rebase-merge" | "rebase-apply" | "sequencer" => Some(GitDirChange::OpState),
        name if name.starts_with("BISECT_") => Some(GitDirChange::OpState),
        "info" if names.get(1) == Some(&"exclude") => Some(GitDirChange::Ignore),
        // Linked work trees (the Branches sidebar lists them): added, removed, switched or (un)locked.
        "worktrees" => match names.get(2) {
            None if names.len() == 2 && structural => Some(GitDirChange::Refs),
            Some(&("HEAD" | "locked" | "gitdir")) => Some(GitDirChange::Refs),
            _ => None,
        },
        // The git dirs of absorbed submodules: their HEAD shows in this status.
        "modules" if names.iter().any(|name| matches!(*name, "objects" | "logs" | "lfs")) => None,
        _ => Some(GitDirChange::Index),
    }
}

fn is_structural(kind: &EventKind) -> bool {
    matches!(
        kind,
        EventKind::Create(_) | EventKind::Remove(_) | EventKind::Modify(ModifyKind::Name(_))
    )
}

fn has_git_component(path: &Path) -> bool {
    path.components().any(|component| component == Component::Normal(".git".as_ref()))
}

/// `<dir>/.git/HEAD`: written once a new repository is usable, often after its
/// `.git` directory was already reported.
fn is_git_head(path: &Path) -> bool {
    path.file_name().map(|name| name == "HEAD").unwrap_or(false)
        && path
            .parent()
            .and_then(Path::file_name)
            .map(|name| name == ".git")
            .unwrap_or(false)
}

fn is_gitignore(path: &Path) -> bool {
    path.file_name().is_some_and(|name| name == ".gitignore")
}

fn is_gitattributes(path: &Path) -> bool {
    path.file_name().is_some_and(|name| name == ".gitattributes")
}

/// Attributes every event path to the deepest of `repo_roots` containing it.
/// `is_ignored(repo_index, repo_relative_path)` asks that repository's
/// .gitignore; ignored work tree paths are dropped. Created, deleted or
/// renamed visible entries, `.gitignore` edits and any `.git` appearing or
/// disappearing change the structure; content edits outside every repository
/// are `outside_repos`. `has_git_entry(path)` is asked only for renamed paths,
/// to notice a repository moved into the workspace. `open_file(path)` gives the
/// page's path of a file open in a tab; an ignored one is still reported in
/// `open_files`, since no status change brings it up to date.
pub fn attribute<'a>(
    repo_roots: &[PathBuf],
    events: impl IntoIterator<Item = (&'a EventKind, &'a [PathBuf])>,
    mut is_ignored: impl FnMut(usize, &Path) -> bool,
    mut has_git_entry: impl FnMut(&Path) -> bool,
    mut open_file: impl FnMut(&Path) -> Option<String>,
) -> Attribution {
    let mut changes = vec![RepoChange::default(); repo_roots.len()];
    let mut attribution = Attribution::default();
    for (kind, paths) in events {
        let structural = is_structural(kind);
        for path in paths {
            let is_git_entry = path.file_name().map(|name| name == ".git").unwrap_or(false);
            if is_git_entry && structural {
                attribution.structure = true;
                attribution.repos_changed = true;
                continue;
            }
            if structural && !attribution.repos_changed {
                let holds_known_repo = repo_roots.iter().any(|repo_root| repo_root.starts_with(path));
                let moved_in_repo = matches!(kind, EventKind::Modify(ModifyKind::Name(_)))
                    && !has_git_component(path)
                    && has_git_entry(path);
                attribution.repos_changed = holds_known_repo || moved_in_repo;
            }
            let Some(index) = deepest_repo_index(repo_roots, path) else {
                // A `.git` of a repository not in the list: only its creation matters.
                if !has_git_component(path) {
                    attribution.outside_repos = true;
                    attribution.structure |= structural || is_gitignore(path);
                } else if structural && is_git_head(path) {
                    attribution.repos_changed = true;
                }
                continue;
            };
            let Ok(relative) = path.strip_prefix(&repo_roots[index]) else {
                continue;
            };
            let change = &mut changes[index];
            if let Ok(git_relative) = relative.strip_prefix(".git") {
                match classify_git_path(git_relative, structural) {
                    Some(GitDirChange::Refs) => change.refs = true,
                    Some(GitDirChange::Config) => change.config = true,
                    Some(GitDirChange::Index) => change.index = true,
                    Some(GitDirChange::OpState) => change.op_state = true,
                    Some(GitDirChange::Ignore) => {
                        change.index = true;
                        change.structure = true;
                        attribution.structure = true;
                    }
                    None => {}
                }
            } else if has_git_component(relative) {
                // Inside the `.git` of a nested repository that is not in the list yet.
                if structural && is_git_head(relative) {
                    attribution.repos_changed = true;
                }
                continue;
            } else if relative.as_os_str().is_empty() || !is_ignored(index, relative) {
                change.work_tree = true;
                change.attributes |= is_gitattributes(relative);
                if structural || is_gitignore(relative) {
                    change.structure = true;
                    attribution.structure = true;
                }
            } else if let Some(file_path) = open_file(path) {
                if !attribution.open_files.contains(&file_path) {
                    attribution.open_files.push(file_path);
                }
            }
        }
    }
    attribution.repos = changes
        .into_iter()
        .enumerate()
        .filter(|(_, change)| *change != RepoChange::default())
        .collect();
    attribution
}

/// Asks one repository whether a work tree path is ignored, for one batch of events.
pub struct IgnoreCheck {
    repo: Repository,
    /// Read on the first ignored path only: most batches never need it.
    index: Option<Option<git2::Index>>,
}

impl IgnoreCheck {
    pub fn open(repo_root: &Path) -> Option<IgnoreCheck> {
        Repository::open(repo_root).ok().map(|repo| IgnoreCheck { repo, index: None })
    }

    /// Ignored and untracked: git keeps following a tracked file that an ignore rule
    /// matches (a log committed before it was ignored), so its status and diffs must too.
    pub fn is_ignored(&mut self, relative: &Path) -> bool {
        if !self.repo.status_should_ignore(relative).unwrap_or(false) {
            return false;
        }
        let index = self.index.get_or_insert_with(|| self.repo.index().ok());
        !index.as_ref().is_some_and(|index| index.get_path(relative, 0).is_some())
    }
}

/// A batch with more paths than this is a burst (npm install, a big checkout).
pub const BURST_PATHS: usize = 1000;
/// A burst is over after this long without events.
const BURST_QUIET: Duration = Duration::from_secs(1);
/// A held burst is sent at least this often, so a long one still shows progress.
const BURST_MAX_HOLD: Duration = Duration::from_secs(2);

/// Holds and merges the batches of a burst: once a batch has more than
/// `BURST_PATHS` paths, every batch is held until events stop for
/// `BURST_QUIET` or the first held one is `BURST_MAX_HOLD` old. Small batches
/// outside a burst pass straight through. Pure, so it is tested without threads.
#[derive(Debug, Default)]
pub struct BurstGate {
    pending: Option<Attribution>,
    held_since: Option<Instant>,
    last_batch: Option<Instant>,
}

impl BurstGate {
    fn bursting(&self, now: Instant) -> bool {
        self.last_batch.is_some_and(|last| now.saturating_duration_since(last) < BURST_QUIET)
    }

    /// A batch of `path_count` paths arrived: returns what to send now, if anything.
    pub fn push(&mut self, batch: Attribution, path_count: usize, now: Instant) -> Option<Attribution> {
        let bursting = self.pending.is_some() || self.bursting(now);
        if !bursting && path_count <= BURST_PATHS {
            return Some(batch);
        }
        match &mut self.pending {
            Some(pending) => pending.merge(batch),
            None => {
                self.pending = Some(batch);
                self.held_since = Some(now);
            }
        }
        self.last_batch = Some(now);
        None
    }

    /// When the held batch is due; None when nothing is held.
    pub fn deadline(&self) -> Option<Instant> {
        self.pending.as_ref()?;
        let quiet = self.last_batch? + BURST_QUIET;
        let max_hold = self.held_since? + BURST_MAX_HOLD;
        Some(quiet.min(max_hold))
    }

    /// The held batch once it is due.
    pub fn poll(&mut self, now: Instant) -> Option<Attribution> {
        if self.deadline().is_some_and(|deadline| now >= deadline) {
            self.held_since = None;
            return self.pending.take();
        }
        None
    }

    /// Whatever is held, for a watcher that stops.
    pub fn take(&mut self) -> Option<Attribution> {
        self.held_since = None;
        self.pending.take()
    }
}

/// Whether a batch created, deleted or renamed anything below `workspace_root`
/// outside `.git` and the dependency and build folders, so the Go to File
/// index is out of date. Content changes alone keep it.
pub fn adds_or_removes_files<'a>(
    workspace_root: &Path,
    events: impl IntoIterator<Item = (&'a EventKind, &'a [PathBuf])>,
) -> bool {
    events
        .into_iter()
        .any(|(kind, paths)| is_structural(kind) && paths.iter().any(|path| is_indexed(workspace_root, path)))
}

/// Whether a batch changed the contents of a source file the symbol index
/// reads (Classes and Symbols). Creations and removals are `adds_or_removes_files`.
pub fn edits_source_files<'a>(
    workspace_root: &Path,
    events: impl IntoIterator<Item = (&'a EventKind, &'a [PathBuf])>,
) -> bool {
    events.into_iter().any(|(kind, paths)| {
        matches!(kind, EventKind::Modify(ModifyKind::Data(_) | ModifyKind::Any))
            && paths
                .iter()
                .any(|path| is_indexed(workspace_root, path) && path.to_str().is_some_and(|text| language_for(text).is_some()))
    })
}

/// Below `workspace_root`, outside `.git` and the dependency and build folders.
fn is_indexed(workspace_root: &Path, path: &Path) -> bool {
    let Ok(relative) = path.strip_prefix(workspace_root) else {
        return false;
    };
    !relative.components().any(|component| {
        matches!(component, Component::Normal(name) if name.to_str().is_some_and(|name| SKIPPED_DIRS.contains(&name)))
    })
}

/// A folder with a `.git` directory or file directly inside, i.e. a repository root.
fn has_git_entry(path: &Path) -> bool {
    path.join(".git").exists()
}

fn canonical_or_given(path: &str) -> PathBuf {
    Path::new(path).real_path().unwrap_or_else(|_| PathBuf::from(path))
}

/// A repository whose git dir is not `<root>/.git`: a linked work tree (its
/// git dir is in the main repository) or an absorbed submodule (in the
/// parent's `.git/modules`). `(git dir, <root>/.git)`.
pub type GitDirLink = (PathBuf, PathBuf);

fn git_dir_links(repo_roots: &[PathBuf]) -> Vec<GitDirLink> {
    repo_roots
        .iter()
        .filter_map(|repo_root| {
            let repo = Repository::open(repo_root).ok()?;
            let git_dir = repo.path().real_path().ok()?;
            let own = repo_root.join(".git");
            (git_dir != own).then_some((git_dir, own))
        })
        .collect()
}

/// `path` inside a linked git dir, rewritten as the same path below its
/// repository's `.git`, so `attribute` gives the change to that repository.
pub fn relink(path: &Path, links: &[GitDirLink]) -> Option<PathBuf> {
    links
        .iter()
        .filter(|(git_dir, _)| path.starts_with(git_dir))
        .max_by_key(|(git_dir, _)| git_dir.components().count())
        .and_then(|(git_dir, own)| path.strip_prefix(git_dir).ok().map(|rest| own.join(rest)))
}

/// The repository each submodule-like repository sits in, when that one has a
/// `.gitmodules`: its status shows the submodule, so it refreshes with it.
fn submodule_parents(repo_roots: &[PathBuf]) -> Vec<Option<usize>> {
    repo_roots
        .iter()
        .map(|repo_root| {
            repo_roots
                .iter()
                .enumerate()
                .filter(|(_, candidate)| *candidate != repo_root && repo_root.starts_with(candidate))
                .max_by_key(|(_, candidate)| candidate.components().count())
                .map(|(index, _)| index)
                .filter(|&index| repo_roots[index].join(".gitmodules").is_file())
        })
        .collect()
}

/// Adds a work tree change for the parent of every changed submodule.
pub fn with_submodule_parents(mut repos: Vec<(usize, RepoChange)>, parents: &[Option<usize>]) -> Vec<(usize, RepoChange)> {
    let changed: Vec<usize> = repos.iter().map(|(index, _)| *index).collect();
    for index in changed {
        let Some(parent) = parents.get(index).copied().flatten() else {
            continue;
        };
        match repos.iter_mut().find(|(candidate, _)| *candidate == parent) {
            Some((_, change)) => change.work_tree = true,
            None => repos.push((parent, RepoChange { work_tree: true, ..RepoChange::default() })),
        }
    }
    repos.sort_by_key(|(index, _)| *index);
    repos
}

/// Starts the thread that passes batches through a `BurstGate` to `emit`. It
/// ends when the returned sender is dropped (the watcher stopped), sending
/// what it still holds.
fn spawn_burst_gate(emit: impl Fn(Attribution) + Send + 'static) -> AppResult<mpsc::Sender<(Attribution, usize)>> {
    let (sender, receiver) = mpsc::channel::<(Attribution, usize)>();
    std::thread::Builder::new()
        .name("watch-bursts".into())
        .spawn(move || {
            let mut gate = BurstGate::default();
            loop {
                let received = match gate.deadline() {
                    Some(deadline) => receiver.recv_timeout(deadline.saturating_duration_since(Instant::now())),
                    None => receiver.recv().map_err(|_| RecvTimeoutError::Disconnected),
                };
                match received {
                    Ok((batch, path_count)) => {
                        if let Some(ready) = gate.push(batch, path_count, Instant::now()) {
                            emit(ready);
                        }
                    }
                    Err(RecvTimeoutError::Timeout) => {}
                    Err(RecvTimeoutError::Disconnected) => {
                        if let Some(rest) = gate.take() {
                            emit(rest);
                        }
                        return;
                    }
                }
                if let Some(ready) = gate.poll(Instant::now()) {
                    emit(ready);
                }
            }
        })
        .map_err(watch_error)?;
    Ok(sender)
}

fn watch_error(err: impl std::fmt::Display) -> AppError {
    AppError::invalid(format!("Could not watch workspace: {err}"))
}

/// One recursive watcher on the workspace root, plus the `.git` directory of
/// any repository outside it (a repository enclosing the workspace) and the
/// git dir of a linked work tree whose main repository is elsewhere. Its events
/// go only to the window that watches (`window_label`).
pub fn watch(app: HostApp, window_label: &str, workspace_root: &str, repo_roots: &[String]) -> AppResult<RepoWatcher> {
    let app_for_emit = app.clone();
    let target = window_label.to_string();
    let search_label = window_label.to_string();
    let root = canonical_or_given(workspace_root);
    let canonical_roots: Vec<PathBuf> = repo_roots.iter().map(|repo_root| canonical_or_given(repo_root)).collect();
    let outside_git_dirs: Vec<PathBuf> = canonical_roots
        .iter()
        .filter(|repo_root| !repo_root.starts_with(&root))
        .map(|repo_root| repo_root.join(".git"))
        .filter(|git_dir| git_dir.is_dir())
        .collect();
    let links = git_dir_links(&canonical_roots);
    let parents = submodule_parents(&canonical_roots);
    // Linked git dirs outside everything else watched (a work tree of a repository elsewhere).
    let linked_git_dirs: Vec<PathBuf> = links
        .iter()
        .map(|(git_dir, _)| git_dir.clone())
        .filter(|git_dir| !git_dir.starts_with(&root) && !outside_git_dirs.iter().any(|outside| git_dir.starts_with(outside)))
        .collect();

    let workspace_root_owned = workspace_root.to_string();
    let repo_paths = repo_roots.to_vec();
    let emit = move |attribution: Attribution| {
        for (index, change) in &attribution.repos {
            let _ = app_for_emit.emit_to(
                &target,
                "repo-changed",
                RepoChanged {
                    repo_path: repo_paths[*index].clone(),
                    change: *change,
                },
            );
        }
        if attribution.workspace_changed() {
            let _ = app_for_emit.emit_to(
                &target,
                "workspace-changed",
                WorkspaceChanged {
                    workspace_root: workspace_root_owned.clone(),
                    repos_changed: attribution.repos_changed,
                    structure: attribution.structure,
                    outside_repos: attribution.outside_repos,
                },
            );
        }
        if !attribution.open_files.is_empty() {
            let _ = app_for_emit.emit_to(
                &target,
                "open-files-changed",
                OpenFilesChanged {
                    file_paths: attribution.open_files,
                },
            );
        }
    };
    let batches = spawn_burst_gate(emit)?;
    let roots = canonical_roots.clone();
    let watched_root = root.clone();
    let handler = move |result: DebounceEventResult| {
        let Ok(events) = result else {
            return;
        };
        let changes = || events.iter().map(|event| (&event.kind, event.paths.as_slice()));
        // Only this window's search indexes this folder.
        let search = app.state().file_search.existing(&search_label);
        if let Some(search) = search {
            if adds_or_removes_files(&watched_root, changes()) {
                search.mark_stale();
            } else if edits_source_files(&watched_root, changes()) {
                search.mark_contents_changed();
            }
        }
        let relinked: Vec<(EventKind, Vec<PathBuf>)> = events
            .iter()
            .map(|event| {
                let paths = event.paths.iter().map(|path| relink(path, &links).unwrap_or_else(|| path.clone())).collect();
                (event.kind, paths)
            })
            .collect();
        let path_count = relinked.iter().map(|(_, paths)| paths.len()).sum();
        // Opened lazily for this batch only.
        let mut repos: HashMap<usize, Option<IgnoreCheck>> = HashMap::new();
        let open_files = app.state().open_files.get(&search_label);
        let mut attribution = attribute(
            &roots,
            relinked.iter().map(|(kind, paths)| (kind, paths.as_slice())),
            |index, relative| {
                repos
                    .entry(index)
                    .or_insert_with(|| IgnoreCheck::open(&roots[index]))
                    .as_mut()
                    .is_some_and(|check| check.is_ignored(relative))
            },
            has_git_entry,
            |path| open_files.get(path).cloned(),
        );
        attribution.repos = with_submodule_parents(attribution.repos, &parents);
        if attribution != Attribution::default() {
            let _ = batches.send((attribution, path_count));
        }
    };
    let mut debouncer =
        new_debouncer_opt(Duration::from_millis(300), None, handler, NoCache, notify::Config::default()).map_err(watch_error)?;

    debouncer.watch(&root, RecursiveMode::Recursive).map_err(watch_error)?;
    for git_dir in outside_git_dirs.iter().chain(&linked_git_dirs) {
        debouncer.watch(git_dir, RecursiveMode::Recursive).map_err(watch_error)?;
    }
    Ok(debouncer)
}

#[cfg(test)]
mod tests {
    use crate::test_support::UiText;
    use std::path::{Path, PathBuf};

    use notify_debouncer_full::notify::event::{CreateKind, DataChange, EventKind, ModifyKind, RemoveKind, RenameMode};

    use std::time::{Duration, Instant};

    use super::{
        adds_or_removes_files, attribute, edits_source_files, git_dir_links, has_git_entry, relink, submodule_parents,
        with_submodule_parents, Attribution, BurstGate, IgnoreCheck, RepoChange, BURST_PATHS,
    };
    use crate::test_support::{TestDir, TestRepo};

    fn content() -> RepoChange {
        RepoChange { work_tree: true, ..RepoChange::default() }
    }

    fn structure() -> RepoChange {
        RepoChange { work_tree: true, structure: true, ..RepoChange::default() }
    }

    fn refs() -> RepoChange {
        RepoChange { refs: true, ..RepoChange::default() }
    }

    fn index() -> RepoChange {
        RepoChange { index: true, ..RepoChange::default() }
    }

    const MODIFY: EventKind = EventKind::Modify(ModifyKind::Data(DataChange::Content));
    const CREATE_DIR: EventKind = EventKind::Create(CreateKind::Folder);
    const REMOVE_DIR: EventKind = EventKind::Remove(RemoveKind::Folder);
    const RENAME: EventKind = EventKind::Modify(ModifyKind::Name(RenameMode::Both));
    const CREATE_FILE: EventKind = EventKind::Create(CreateKind::File);

    fn paths(values: &[&str]) -> Vec<PathBuf> {
        values.iter().map(PathBuf::from).collect()
    }

    /// Attributes `events` with every `*.log` path treated as ignored and
    /// every folder named `*-repo` treated as holding a `.git`.
    fn run(repo_roots: &[&str], events: &[(EventKind, Vec<PathBuf>)]) -> Attribution {
        let roots = paths(repo_roots);
        attribute(
            &roots,
            events.iter().map(|(kind, paths)| (kind, paths.as_slice())),
            |_, relative: &Path| relative.extension().map(|ext| ext == "log").unwrap_or(false),
            |path: &Path| path.to_string_lossy().ends_with("-repo"),
            |path: &Path| path.file_name().is_some_and(|name| name.to_string_lossy().starts_with("open")).then(|| path.to_string_lossy().to_string()),
        )
    }

    const NESTED: &[&str] = &["/w", "/w/apps/web"];

    #[test]
    fn work_tree_changes_go_to_the_deepest_repository() {
        // Content edits in a repository leave the workspace listing alone.
        let result = run(NESTED, &[(MODIFY, paths(&["/w/apps/web/src/a.ts"]))]);
        assert_eq!(result, Attribution { repos: vec![(1, content())], ..Attribution::default() });

        let result = run(NESTED, &[(MODIFY, paths(&["/w/README.md", "/w/apps/web/b.ts"]))]);
        assert_eq!(result, Attribution { repos: vec![(0, content()), (1, content())], ..Attribution::default() });

        // A .gitattributes edit is flagged, so the Git LFS state is read again.
        let result = run(NESTED, &[(MODIFY, paths(&["/w/apps/web/art/.gitattributes"]))]);
        let expected = RepoChange { work_tree: true, attributes: true, ..RepoChange::default() };
        assert_eq!(result, Attribution { repos: vec![(1, expected)], ..Attribution::default() });
    }

    #[test]
    fn created_deleted_or_renamed_entries_and_gitignore_edits_change_the_structure() {
        for kind in [CREATE_FILE, REMOVE_DIR, RENAME] {
            let result = run(NESTED, &[(kind, paths(&["/w/apps/web/src/new.ts"]))]);
            assert_eq!(result, Attribution { repos: vec![(1, structure())], structure: true, ..Attribution::default() });
        }
        // What is ignored decides the greyed rows of the Files panel.
        let result = run(NESTED, &[(MODIFY, paths(&["/w/.gitignore"]))]);
        assert_eq!(result, Attribution { repos: vec![(0, structure())], structure: true, ..Attribution::default() });
        let exclude = run(NESTED, &[(MODIFY, paths(&["/w/.git/info/exclude"]))]);
        let expected = RepoChange { index: true, structure: true, ..RepoChange::default() };
        assert_eq!(exclude, Attribution { repos: vec![(0, expected)], structure: true, ..Attribution::default() });
    }

    #[test]
    fn git_dir_changes_skip_noise_and_do_not_touch_the_workspace() {
        let result = run(NESTED, &[(MODIFY, paths(&["/w/apps/web/.git/index", "/w/.git/refs/heads/main"]))]);
        assert_eq!(result, Attribution { repos: vec![(0, refs()), (1, index())], ..Attribution::default() });

        let noise = paths(&[
            "/w/apps/web/.git/objects/ab/cdef",
            "/w/.git/logs/HEAD",
            "/w/.git/logs/refs/heads/main",
            "/w/.git/lfs/tmp",
            "/w/.git/index.lock",
            "/w/.git/refs/heads/main.lock",
            "/w/.git/FETCH_HEAD",
            "/w/.git/ORIG_HEAD",
            "/w/.git/COMMIT_EDITMSG",
            "/w/.git/hooks/pre-commit",
            "/w/.git/worktrees/wt/index",
            "/w/.git/worktrees/wt/logs/HEAD",
            "/w/.git/modules/lib/objects/ab/cdef",
            "/w/.git",
        ]);
        assert_eq!(run(NESTED, &[(MODIFY, noise)]), Attribution::default());
    }

    #[test]
    fn git_dir_changes_are_told_apart() {
        let kind_of = |git_path: &str| {
            let result = run(&["/w"], &[(MODIFY, paths(&[&format!("/w/.git/{git_path}")]))]);
            result.repos.first().map(|(_, change)| *change).unwrap_or_default()
        };
        for refs_path in ["HEAD", "packed-refs", "refs/heads/main", "refs/remotes/origin/main", "refs/tags/v1", "refs/stash", "logs/refs/stash", "shallow"] {
            assert_eq!(kind_of(refs_path), refs(), "{refs_path}");
        }
        for linked in ["worktrees/wt/HEAD", "worktrees/wt/locked", "worktrees/wt/gitdir"] {
            assert_eq!(kind_of(linked), refs(), "{linked}");
        }
        let removed = run(&["/w"], &[(REMOVE_DIR, paths(&["/w/.git/worktrees/wt"]))]);
        assert_eq!(removed.repos, vec![(0, refs())]);
        assert_eq!(kind_of("config"), RepoChange { config: true, ..RepoChange::default() });
        let op_state = RepoChange { op_state: true, ..RepoChange::default() };
        for op_path in ["MERGE_HEAD", "MERGE_MSG", "CHERRY_PICK_HEAD", "REVERT_HEAD", "rebase-merge/done", "rebase-apply/next", "sequencer/todo", "BISECT_LOG"] {
            assert_eq!(kind_of(op_path), op_state, "{op_path}");
        }
        for status_path in ["index", "sharedindex.abc", "modules/lib/HEAD", "info/sparse-checkout"] {
            assert_eq!(kind_of(status_path), index(), "{status_path}");
        }
    }

    #[test]
    fn ignored_work_tree_paths_are_dropped() {
        let roots = paths(NESTED);
        let mut asked = Vec::new();
        let events = [(MODIFY, paths(&["/w/apps/web/debug.log", "/w/target/out.log"]))];
        let result = attribute(&roots, events.iter().map(|(kind, paths)| (kind, paths.as_slice())), |index, relative| {
            asked.push((index, relative.to_path_buf()));
            true
        }, |_| false, |_| None);
        assert_eq!(result, Attribution::default());
        assert_eq!(asked, vec![(1, PathBuf::from("debug.log")), (0, PathBuf::from("target/out.log"))]);
    }

    #[test]
    fn ignored_files_open_in_a_tab_are_still_reported() {
        // An open log that git ignores has no status to follow, so the page is told directly.
        let events = [(MODIFY, paths(&["/w/apps/web/open.log", "/w/apps/web/debug.log", "/w/apps/web/open.log"]))];
        let result = run(NESTED, &events);
        assert_eq!(result, Attribution { open_files: vec!["/w/apps/web/open.log".into()], ..Attribution::default() });

        // An open file git sees follows its status instead, without a second reload.
        let result = run(NESTED, &[(MODIFY, paths(&["/w/apps/web/open.ts"]))]);
        assert_eq!(result, Attribution { repos: vec![(1, content())], ..Attribution::default() });

        // Held bursts keep every open file once.
        let mut held = Attribution { open_files: vec!["/w/a/open.log".into()], ..Attribution::default() };
        held.merge(Attribution { open_files: vec!["/w/a/open.log".into(), "/w/b/open.log".into()], ..Attribution::default() });
        assert_eq!(held.open_files, vec!["/w/a/open.log".to_string(), "/w/b/open.log".to_string()]);
    }

    #[test]
    fn paths_outside_every_repository_change_the_workspace() {
        let result = run(&["/w/apps/web"], &[(MODIFY, paths(&["/w/notes.txt", "/w/other/x.log"]))]);
        assert_eq!(result, Attribution { outside_repos: true, ..Attribution::default() });
        assert!(run(&[], &[(MODIFY, paths(&["/w/a.txt"]))]).outside_repos);
        let created = run(&[], &[(CREATE_FILE, paths(&["/w/a.txt"]))]);
        assert_eq!(created, Attribution { structure: true, outside_repos: true, ..Attribution::default() });
    }

    #[test]
    fn git_directories_appearing_or_disappearing_change_the_workspace() {
        let created = run(
            NESTED,
            &[
                (CREATE_DIR, paths(&["/w/libs/new/.git"])),
                (EventKind::Create(CreateKind::File), paths(&["/w/libs/new/.git/HEAD"])),
            ],
        );
        assert_eq!(created, Attribution { structure: true, repos_changed: true, ..Attribution::default() });

        let removed = run(NESTED, &[(REMOVE_DIR, paths(&["/w/apps/web/.git"]))]);
        assert_eq!(removed, Attribution { structure: true, repos_changed: true, ..Attribution::default() });

        let renamed = run(&[], &[(RENAME, paths(&["/w/x/.git", "/w/x/.git-old"]))]);
        assert!(renamed.structure);
        assert!(renamed.repos_changed);

        // Internals of a repository that is not in the list are ignored.
        let unknown = run(NESTED, &[(MODIFY, paths(&["/w/libs/new/.git/index"]))]);
        assert_eq!(unknown, Attribution::default());
        assert_eq!(run(&[], &[(MODIFY, paths(&["/w/new/.git/index"]))]), Attribution::default());
    }

    #[test]
    fn enclosing_repository_outside_the_workspace() {
        let result = run(&["/e"], &[(MODIFY, paths(&["/e/.git/HEAD", "/e/sub/file.txt"]))]);
        let expected = RepoChange { refs: true, work_tree: true, ..RepoChange::default() };
        assert_eq!(result, Attribution { repos: vec![(0, expected)], ..Attribution::default() });
    }

    #[test]
    fn a_new_head_in_an_unknown_git_dir_asks_for_a_rescan() {
        // `git init` and `git clone` write HEAD through a lock file and a rename.
        let top = run(&[], &[(RENAME, paths(&["/w/new/.git/HEAD.lock", "/w/new/.git/HEAD"]))]);
        assert_eq!(top, Attribution { repos_changed: true, ..Attribution::default() });

        let nested = run(NESTED, &[(CREATE_FILE, paths(&["/w/libs/new/.git/HEAD"]))]);
        assert_eq!(nested, Attribution { repos_changed: true, ..Attribution::default() });

        // Checking out a branch in a known repository rewrites HEAD too: no rescan.
        let checkout = run(NESTED, &[(RENAME, paths(&["/w/apps/web/.git/HEAD"]))]);
        assert_eq!(checkout, Attribution { repos: vec![(1, refs())], ..Attribution::default() });

        // Content changes inside an unknown `.git` are still ignored.
        assert_eq!(run(&[], &[(MODIFY, paths(&["/w/new/.git/HEAD"]))]), Attribution::default());
    }

    #[test]
    fn removing_or_moving_a_repository_or_its_parent_asks_for_a_rescan() {
        assert!(run(NESTED, &[(REMOVE_DIR, paths(&["/w/apps"]))]).repos_changed);
        assert!(run(NESTED, &[(RENAME, paths(&["/w/apps/web"]))]).repos_changed);
        assert!(!run(NESTED, &[(REMOVE_DIR, paths(&["/w/apps/web/src"]))]).repos_changed);
    }

    #[test]
    fn a_repository_moved_into_the_workspace_asks_for_a_rescan() {
        assert!(run(NESTED, &[(RENAME, paths(&["/w/libs/incoming-repo"]))]).repos_changed);
        assert!(!run(NESTED, &[(RENAME, paths(&["/w/libs/plain-folder"]))]).repos_changed);
        // Only renames are checked on disk; ordinary creations stay cheap.
        assert!(!run(NESTED, &[(CREATE_DIR, paths(&["/w/libs/new-repo"]))]).repos_changed);
        assert!(!run(NESTED, &[(CREATE_FILE, paths(&["/w/apps/web/src/a.ts"]))]).repos_changed);
    }

    #[test]
    fn only_created_removed_or_renamed_files_outdate_the_file_index() {
        let check = |events: &[(EventKind, Vec<PathBuf>)]| {
            adds_or_removes_files(Path::new("/w/build/app"), events.iter().map(|(kind, paths)| (kind, paths.as_slice())))
        };
        // The workspace itself may live below a folder named like a skipped one.
        assert!(check(&[(CREATE_FILE, paths(&["/w/build/app/src/new.ts"]))]));
        assert!(check(&[(REMOVE_DIR, paths(&["/w/build/app/src"]))]));
        assert!(check(&[(RENAME, paths(&["/w/build/app/a.ts", "/w/build/app/b.ts"]))]));
        assert!(!check(&[(MODIFY, paths(&["/w/build/app/src/a.ts"]))]));
        assert!(!check(&[(CREATE_FILE, paths(&["/w/build/app/.git/index.lock"]))]));
        assert!(!check(&[(CREATE_FILE, paths(&["/w/build/app/node_modules/x/index.js"]))]));
        assert!(!check(&[(CREATE_FILE, paths(&["/w/build/app/target/debug/out"]))]));
        assert!(!check(&[(CREATE_FILE, paths(&["/elsewhere/.git/HEAD"]))]));
    }

    #[test]
    fn only_edited_source_files_outdate_the_symbol_index() {
        let check = |events: &[(EventKind, Vec<PathBuf>)]| {
            edits_source_files(Path::new("/w"), events.iter().map(|(kind, paths)| (kind, paths.as_slice())))
        };
        assert!(check(&[(MODIFY, paths(&["/w/src/cart.ts"]))]));
        assert!(check(&[(MODIFY, paths(&["/w/README.md", "/w/lib/Cart.PHP"]))]));
        assert!(!check(&[(MODIFY, paths(&["/w/README.md"]))]));
        assert!(!check(&[(MODIFY, paths(&["/w/node_modules/x/index.js"]))]));
        assert!(!check(&[(MODIFY, paths(&["/w/.git/index"]))]));
        assert!(!check(&[(MODIFY, paths(&["/elsewhere/a.ts"]))]));
        assert!(!check(&[(CREATE_FILE, paths(&["/w/src/new.ts"]))]));
    }

    #[test]
    fn linked_git_dirs_are_read_as_their_repository_git_dir() {
        let links = vec![
            (PathBuf::from("/main/.git/worktrees/wt"), PathBuf::from("/w/wt/.git")),
            (PathBuf::from("/w/app/.git/modules/lib"), PathBuf::from("/w/app/lib/.git")),
        ];
        assert_eq!(relink(Path::new("/main/.git/worktrees/wt/index"), &links), Some(PathBuf::from("/w/wt/.git/index")));
        assert_eq!(relink(Path::new("/w/app/.git/modules/lib/HEAD"), &links), Some(PathBuf::from("/w/app/lib/.git/HEAD")));
        assert_eq!(relink(Path::new("/w/app/.git/index"), &links), None);
        assert_eq!(relink(Path::new("/main/.git/worktrees/other/HEAD"), &links), None);

        // Relinked, a work tree commit refreshes the work tree, not the main repository.
        let roots = paths(&["/w/app", "/w/app/lib", "/w/wt"]);
        let relinked = [relink(Path::new("/main/.git/worktrees/wt/index"), &links).unwrap()];
        let result = attribute(&roots, [(&MODIFY, &relinked[..])], |_, _| false, |_| false, |_| None);
        assert_eq!(result.repos, vec![(2, index())]);
    }

    #[test]
    fn a_changed_submodule_refreshes_its_parent() {
        let parents = [None, Some(0), None];
        assert_eq!(with_submodule_parents(vec![(1, content())], &parents), vec![(0, content()), (1, content())]);
        let refs_and_content = RepoChange { refs: true, work_tree: true, ..RepoChange::default() };
        assert_eq!(with_submodule_parents(vec![(0, refs()), (1, refs())], &parents), vec![(0, refs_and_content), (1, refs())]);
        assert_eq!(with_submodule_parents(vec![(2, refs_and_content)], &parents), vec![(2, refs_and_content)]);
    }

    #[test]
    fn merged_batches_keep_every_change() {
        let mut first = Attribution { repos: vec![(1, refs())], structure: true, ..Attribution::default() };
        first.merge(Attribution { repos: vec![(0, content()), (1, index())], outside_repos: true, ..Attribution::default() });
        let both = RepoChange { refs: true, index: true, ..RepoChange::default() };
        assert_eq!(
            first,
            Attribution { repos: vec![(0, content()), (1, both)], structure: true, outside_repos: true, repos_changed: false, open_files: vec![] },
        );
    }

    fn batch(repo_index: usize) -> Attribution {
        Attribution { repos: vec![(repo_index, content())], ..Attribution::default() }
    }

    #[test]
    fn small_batches_pass_straight_through_the_burst_gate() {
        let mut gate = BurstGate::default();
        let start = Instant::now();
        assert_eq!(gate.push(batch(0), 3, start), Some(batch(0)));
        assert_eq!(gate.push(batch(1), BURST_PATHS, start + Duration::from_millis(300)), Some(batch(1)));
        assert_eq!(gate.deadline(), None);
    }

    #[test]
    fn a_burst_is_held_merged_and_sent_once_it_settles() {
        let mut gate = BurstGate::default();
        let start = Instant::now();
        let at = |millis: u64| start + Duration::from_millis(millis);
        assert_eq!(gate.push(batch(0), BURST_PATHS + 1, start), None);
        // Small batches during the burst are held with it.
        assert_eq!(gate.push(batch(1), 2, at(300)), None);
        assert_eq!(gate.deadline(), Some(at(1300)));
        assert_eq!(gate.poll(at(1000)), None);
        let mut expected = batch(0);
        expected.merge(batch(1));
        assert_eq!(gate.poll(at(1300)), Some(expected));
        assert_eq!(gate.deadline(), None);
        // Quiet again: the next small batch goes out at once.
        assert_eq!(gate.push(batch(2), 2, at(2400)), Some(batch(2)));
    }

    #[test]
    fn a_long_burst_is_sent_every_two_seconds_at_most() {
        let mut gate = BurstGate::default();
        let start = Instant::now();
        let at = |millis: u64| start + Duration::from_millis(millis);
        let mut sent = Vec::new();
        // Batches every 300 ms for 6 seconds, each over the burst size.
        for step in 0..20 {
            let now = at(step * 300);
            if let Some(ready) = gate.poll(now) {
                sent.push(now);
                assert!(!ready.repos.is_empty());
            }
            assert_eq!(gate.push(batch(0), BURST_PATHS * 5, now), None);
        }
        assert_eq!(sent, vec![at(2100), at(4200)]);
        // Small batches right after a sent burst are still held: it has not settled.
        assert_eq!(gate.push(batch(1), 1, at(5800)), None);
        assert_eq!(gate.poll(at(6800)).map(|held| held.repos.len()), Some(2));
        assert_eq!(gate.take(), None);
    }

    #[test]
    fn finds_links_and_parents_on_disk() {
        let dir = TestDir::new();
        let main = dir.init_repo("main");
        dir.write("main/.gitmodules", "");
        let plain = dir.init_repo("main/plain");
        crate::test_support::git_in(&main, &["-c", "user.name=T", "-c", "user.email=t@e", "commit", "-q", "--allow-empty", "-m", "base"]);
        let worktree = dir.file("wt");
        crate::test_support::git_in(&main, &["worktree", "add", "-q", "-b", "wt", &worktree.ui()]);
        let roots = vec![main.clone(), plain.clone(), worktree.clone()];
        let links = git_dir_links(&roots);
        assert_eq!(links.len(), 1, "{links:?}");
        assert_eq!(links[0].1, worktree.join(".git"));
        assert!(links[0].0.ends_with(".git/worktrees/wt"));
        assert_eq!(submodule_parents(&roots), vec![None, Some(0), None]);
    }

    #[test]
    fn tracked_files_matching_an_ignore_rule_are_not_ignored() {
        let repo = TestRepo::new();
        repo.write("app.log", "one\n");
        repo.commit_all("track the log");
        repo.write(".gitignore", "*.log\n");
        repo.write("debug.log", "new\n");
        let mut check = IgnoreCheck::open(&repo.path).unwrap();
        assert!(!check.is_ignored(Path::new("app.log")));
        assert!(check.is_ignored(Path::new("debug.log")));
        assert!(!check.is_ignored(Path::new("readme.md")));
    }

    #[test]
    fn has_git_entry_finds_repository_roots_on_disk() {
        let dir = TestDir::new();
        let repo = dir.init_repo("libs/new");
        dir.write("libs/plain/readme.md", "hi");
        assert!(has_git_entry(&repo));
        assert!(!has_git_entry(&dir.file("libs/plain")));
        assert!(!has_git_entry(&dir.file("libs/plain/readme.md")));
        assert!(!has_git_entry(&dir.file("libs/missing")));
    }
}
