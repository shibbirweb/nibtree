use crate::paths::RealPath;
use std::path::{Path, PathBuf};

use git2::{Repository, Sort};
use serde::{Deserialize, Serialize};
#[cfg(feature = "desktop")]
use tauri::AppHandle;

use crate::host::HostApp;

use super::{blocking, outcome, reject_option, OpOutcome};
use crate::error::{AppError, AppResult};
use crate::git::{cancel, cli};
use crate::git::log::{summarize, CommitSummary};
use crate::git::repo::{self as git_repo, strip_trailing_slash};
use crate::git::status::head_info;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Progress<'a> {
    repo_path: &'a str,
    line: &'a str,
}

/// Receives each progress line of a network command.
pub(crate) type OnProgress<'a> = &'a mut dyn FnMut(&str);

/// Progress lines go to the windows showing the repository (every window when none does).
pub(super) fn emitter(app: &HostApp, repo_path: &str) -> impl FnMut(&str) {
    let app = app.clone();
    let repo_path = repo_path.to_string();
    let canonical = crate::windows::canonical(&repo_path);
    move |line| {
        super::window::emit_for_path(
            &app,
            &canonical,
            "git-progress",
            Progress {
                repo_path: &repo_path,
                line,
            },
        );
    }
}

fn stream(repo_path: &str, args: &[&str], on_progress: OnProgress) -> AppResult<cli::GitOutput> {
    cli::run_streaming(Path::new(repo_path), args, on_progress)
}

fn finished(output: cli::GitOutput) -> OpOutcome {
    OpOutcome {
        output: output.text(),
        conflicts: false,
    }
}

/// The remote a branch without an upstream goes to: origin, else the first one.
pub(super) fn default_remote(repo: &git2::Repository) -> AppResult<String> {
    let remotes = repo.remotes()?;
    let names: Vec<&str> = remotes.iter().filter_map(|name| name.ok().flatten()).collect();
    if names.contains(&"origin") {
        return Ok("origin".to_string());
    }
    names
        .first()
        .map(|name| name.to_string())
        .ok_or_else(|| AppError::invalid("This repository has no remote to push to"))
}

pub(crate) fn run_fetch(repo_path: &str, all_remotes: bool, prune: bool, on_progress: OnProgress) -> AppResult<OpOutcome> {
    let mut args = vec!["fetch", "--progress"];
    if all_remotes {
        args.push("--all");
    }
    if prune {
        args.push("--prune");
    }
    stream(repo_path, &args, on_progress).map(finished)
}

pub(crate) fn run_pull(repo_path: &str, rebase: bool, on_progress: OnProgress) -> AppResult<OpOutcome> {
    let mut args = vec!["pull", "--progress"];
    // A plain pull keeps the user's pull.rebase / pull.ff config, like the terminal.
    if rebase {
        args.push("--rebase");
    }
    let result = stream(repo_path, &args, on_progress);
    outcome(repo_path, result)
}

pub(crate) fn run_push(repo_path: &str, force: bool, on_progress: OnProgress) -> AppResult<OpOutcome> {
    let repo = git_repo::open(repo_path)?;
    let head = head_info(&repo);
    let branch = head
        .branch
        .clone()
        .ok_or_else(|| AppError::invalid("Cannot push a detached HEAD"))?;
    let mut args = vec!["push", "--progress"];
    if force {
        args.push("--force-with-lease");
    }
    let remote_name;
    if head.upstream.is_none() {
        remote_name = default_remote(&repo)?;
        args.extend(["-u", remote_name.as_str(), branch.as_str()]);
    }
    stream(repo_path, &args, on_progress).map(finished)
}

pub(crate) fn run_push_tags(repo_path: &str, on_progress: OnProgress) -> AppResult<OpOutcome> {
    let repo = git_repo::open(repo_path)?;
    let mut args = vec!["push", "--progress"];
    // Without an upstream git falls back to "origin", which may not exist.
    let remote_name;
    if head_info(&repo).upstream.is_none() {
        remote_name = default_remote(&repo)?;
        args.push(remote_name.as_str());
    }
    args.push("--tags");
    stream(repo_path, &args, on_progress).map(finished)
}

/// How the Pull dialog integrates the fetched branch.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PullMode {
    Merge,
    Rebase,
    FfOnly,
}

/// Trims an optional name from the UI; an empty one counts as not given.
fn given(value: Option<&str>) -> Option<&str> {
    value.map(str::trim).filter(|text| !text.is_empty())
}

pub(crate) fn run_pull_with_options(
    repo_path: &str,
    remote_name: Option<&str>,
    branch_name: Option<&str>,
    mode: PullMode,
    no_commit: bool,
    on_progress: OnProgress,
) -> AppResult<OpOutcome> {
    let remote_name = given(remote_name);
    let branch_name = given(branch_name);
    if branch_name.is_some() && remote_name.is_none() {
        return Err(AppError::invalid("Choose the remote to pull the branch from"));
    }
    if let Some(name) = remote_name {
        reject_option(name, "A remote name")?;
    }
    if let Some(name) = branch_name {
        reject_option(name, "A branch name")?;
    }
    let mut args = vec!["pull", "--progress"];
    // Always explicit, so the user's pull.rebase / pull.ff config never overrides the dialog.
    args.push(match mode {
        PullMode::Merge => "--no-rebase",
        PullMode::Rebase => "--rebase",
        PullMode::FfOnly => "--ff-only",
    });
    if no_commit && mode == PullMode::Merge {
        args.push("--no-commit");
    }
    args.extend(remote_name);
    args.extend(branch_name);
    let result = stream(repo_path, &args, on_progress);
    outcome(repo_path, result)
}

pub(crate) fn run_push_with_options(
    repo_path: &str,
    remote_name: &str,
    remote_branch: &str,
    force_with_lease: bool,
    push_tags: bool,
    on_progress: OnProgress,
) -> AppResult<OpOutcome> {
    let remote_name = remote_name.trim();
    let remote_branch = remote_branch.trim();
    let remote_branch = remote_branch.strip_prefix("refs/heads/").unwrap_or(remote_branch);
    if remote_name.is_empty() {
        return Err(AppError::invalid("Choose a remote to push to"));
    }
    if remote_branch.is_empty() {
        return Err(AppError::invalid("Enter the remote branch name"));
    }
    reject_option(remote_name, "A remote name")?;
    reject_option(remote_branch, "A branch name")?;
    let repo = git_repo::open(repo_path)?;
    let head = head_info(&repo);
    let branch = head
        .branch
        .clone()
        .ok_or_else(|| AppError::invalid("Cannot push a detached HEAD"))?;
    let mut args = vec!["push", "--progress"];
    if force_with_lease {
        args.push("--force-with-lease");
    }
    if push_tags {
        args.push("--tags");
    }
    if head.upstream.is_none() {
        args.push("-u");
    }
    let refspec = format!("refs/heads/{branch}:refs/heads/{remote_branch}");
    args.push(remote_name);
    args.push(&refspec);
    stream(repo_path, &args, on_progress).map(finished)
}

const MAX_OUTGOING: usize = 500;

/// Commits the Push dialog lists.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OutgoingCommits {
    pub commits: Vec<CommitSummary>,
    /// "remote/branch" the commits are counted against; None when that branch does not exist yet.
    pub base: Option<String>,
    pub truncated: bool,
}

fn outgoing(repo: &Repository, remote_name: &str, remote_branch: &str) -> AppResult<OutgoingCommits> {
    let mut result = OutgoingCommits {
        commits: Vec::new(),
        base: None,
        truncated: false,
    };
    if repo.head().ok().and_then(|head| head.target()).is_none() {
        return Ok(result);
    }
    let mut walk = repo.revwalk()?;
    walk.set_sorting(Sort::TOPOLOGICAL | Sort::TIME)?;
    walk.push_head()?;
    let target = if remote_name.is_empty() || remote_branch.is_empty() {
        None
    } else {
        repo.refname_to_id(&format!("refs/remotes/{remote_name}/{remote_branch}")).ok()
    };
    if let Some(oid) = target {
        walk.hide(oid)?;
        result.base = Some(format!("{remote_name}/{remote_branch}"));
    } else {
        // An unpublished branch: everything no remote has yet.
        walk.hide_glob("refs/remotes")?;
    }
    for oid in walk {
        if result.commits.len() == MAX_OUTGOING {
            result.truncated = true;
            break;
        }
        let commit = repo.find_commit(oid?)?;
        result.commits.push(summarize(&commit, Vec::new()));
    }
    Ok(result)
}

/// A configured remote with its URLs.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteInfo {
    pub name: String,
    pub fetch_url: Option<String>,
    pub push_url: Option<String>,
    pub default_branch: Option<String>,
}

fn read_remotes(repo: &Repository) -> AppResult<Vec<RemoteInfo>> {
    let names = repo.remotes()?;
    let mut remotes = Vec::new();
    for remote_name in names.iter().flatten().flatten() {
        let Ok(remote) = repo.find_remote(remote_name) else {
            continue;
        };
        let fetch_url = remote.url().ok().map(str::to_string);
        let push_url = remote.pushurl().ok().flatten().map(str::to_string).or_else(|| fetch_url.clone());
        let prefix = format!("refs/remotes/{remote_name}/");
        let default_branch = repo
            .find_reference(&format!("{prefix}HEAD"))
            .ok()
            .and_then(|reference| reference.symbolic_target().ok().flatten().map(str::to_string))
            .and_then(|target| target.strip_prefix(&prefix).map(str::to_string));
        remotes.push(RemoteInfo {
            name: remote_name.to_string(),
            fetch_url,
            push_url,
            default_branch,
        });
    }
    Ok(remotes)
}

fn checked_remote_name(remote_name: &str) -> AppResult<&str> {
    let remote_name = remote_name.trim();
    if remote_name.is_empty() {
        return Err(AppError::invalid("Enter a remote name"));
    }
    reject_option(remote_name, "A remote name")?;
    Ok(remote_name)
}

fn checked_url(url: &str) -> AppResult<&str> {
    let url = url.trim();
    if url.is_empty() {
        return Err(AppError::invalid("Enter a URL"));
    }
    reject_option(url, "A URL")?;
    Ok(url)
}

/// Sets the push URL apart from the fetch URL, or drops a separate one so pushes use the fetch URL.
fn set_push_url(repo_path: &str, remote_name: &str, fetch_url: &str, push_url: Option<&str>) -> AppResult<()> {
    let root = Path::new(repo_path);
    let push_url = given(push_url).filter(|url| *url != fetch_url);
    if let Some(url) = push_url {
        let url = checked_url(url)?;
        cli::run(root, &["remote", "set-url", "--push", remote_name, url])?;
        return Ok(());
    }
    let has_push_url = {
        let repo = git_repo::open(repo_path)?;
        let remote = repo.find_remote(remote_name)?;
        let configured = remote.pushurl().ok().flatten().is_some();
        configured
    };
    if has_push_url {
        cli::run(root, &["config", "--unset-all", &format!("remote.{remote_name}.pushurl")])?;
    }
    Ok(())
}

fn run_add_remote(repo_path: &str, remote_name: &str, fetch_url: &str, push_url: Option<&str>) -> AppResult<()> {
    let remote_name = checked_remote_name(remote_name)?;
    let fetch_url = checked_url(fetch_url)?;
    cli::run(Path::new(repo_path), &["remote", "add", remote_name, fetch_url])?;
    set_push_url(repo_path, remote_name, fetch_url, push_url)
}

fn run_edit_remote(
    repo_path: &str,
    remote_name: &str,
    new_name: &str,
    fetch_url: &str,
    push_url: Option<&str>,
) -> AppResult<()> {
    let remote_name = checked_remote_name(remote_name)?;
    let new_name = checked_remote_name(new_name)?;
    let fetch_url = checked_url(fetch_url)?;
    let root = Path::new(repo_path);
    if new_name != remote_name {
        cli::run(root, &["remote", "rename", remote_name, new_name])?;
    }
    cli::run(root, &["remote", "set-url", new_name, fetch_url])?;
    set_push_url(repo_path, new_name, fetch_url, push_url)
}

fn run_remove_remote(repo_path: &str, remote_name: &str) -> AppResult<()> {
    let remote_name = checked_remote_name(remote_name)?;
    cli::run(Path::new(repo_path), &["remote", "remove", remote_name])?;
    Ok(())
}

/// Where a clone goes: `parent_dir`/`folder_name`, which must not exist or be an empty folder.
fn clone_target(url: &str, parent_dir: &str, folder_name: &str) -> AppResult<PathBuf> {
    checked_url(url)?;
    let folder_name = folder_name.trim();
    let unsafe_name = folder_name.is_empty()
        || folder_name == "."
        || folder_name == ".."
        || folder_name.contains(['/', '\\', '\0']);
    if unsafe_name {
        return Err(AppError::invalid(format!("Not a valid folder name: {folder_name}")));
    }
    let parent = Path::new(parent_dir);
    if !parent.is_dir() {
        return Err(AppError::invalid(format!("The folder {parent_dir} does not exist")));
    }
    let target = parent.join(folder_name);
    if target.exists() {
        let empty = target.is_dir() && std::fs::read_dir(&target)?.next().is_none();
        if !empty {
            return Err(AppError::invalid(format!(
                "{} already exists and is not an empty folder",
                target.display()
            )));
        }
    }
    Ok(target)
}

#[cfg(test)]
fn run_clone(url: &str, parent_dir: &str, folder_name: &str, on_progress: OnProgress) -> AppResult<String> {
    clone_into(url, parent_dir, folder_name, None, &[], on_progress)
}

/// What a cancelled clone leaves behind goes: the folder when the clone created it, else its contents.
fn clean_cancelled_clone(target: &Path, existed_before: bool) {
    if !target.exists() {
        return;
    }
    if !existed_before {
        let _ = std::fs::remove_dir_all(target);
        return;
    }
    // The folder was empty before the clone, so everything in it came from the clone.
    if let Ok(entries) = std::fs::read_dir(target) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() && !path.is_symlink() {
                let _ = std::fs::remove_dir_all(&path);
            } else {
                let _ = std::fs::remove_file(&path);
            }
        }
    }
}

/// `git clone`; with a `cancel_id`, `cancel_git_command` stops it. `git_config` holds
/// `-c key=value` pairs for git itself (tests use them to reach a slow transport).
fn clone_into(
    url: &str,
    parent_dir: &str,
    folder_name: &str,
    cancel_id: Option<&str>,
    git_config: &[&str],
    on_progress: OnProgress,
) -> AppResult<String> {
    let target = clone_target(url, parent_dir, folder_name)?;
    let existed_before = target.exists();
    let url = url.trim();
    let folder_name = folder_name.trim();
    let mut args: Vec<&str> = Vec::new();
    for setting in git_config {
        args.extend(["-c", setting]);
    }
    args.extend(["clone", "--progress", "--", url, folder_name]);
    let root = Path::new(parent_dir);
    match cancel_id.map(str::trim).filter(|id| !id.is_empty()) {
        Some(cancel_id) => {
            if cancel::run_streaming(root, &args, cancel_id, on_progress)?.is_none() {
                clean_cancelled_clone(&target, existed_before);
                return Err(AppError::invalid(CLONE_CANCELLED));
            }
        }
        None => {
            cli::run_streaming(root, &args, on_progress)?;
        }
    }
    let cloned = target.real_path().unwrap_or(target);
    Ok(strip_trailing_slash(&cloned))
}

/// The folder `git clone` makes for `url`: its last part without `.git` or `.bundle`, like
/// the Clone dialog's default (`cloneFolderName` in gitOptions.ts).
pub fn clone_folder_name(url: &str) -> String {
    let trimmed = url.trim().trim_end_matches(['/', '\\']);
    let lower = trimmed.to_ascii_lowercase();
    let without_git_dir = if lower.ends_with("/.git") || lower.ends_with("\\.git") {
        &trimmed[..trimmed.len() - 5]
    } else {
        trimmed
    };
    let without_git_dir = without_git_dir.trim_end_matches(['/', '\\']);
    let last = without_git_dir.rsplit(['/', '\\', ':']).next().unwrap_or_default();
    let lower_last = last.to_ascii_lowercase();
    for suffix in [".git", ".bundle"] {
        if lower_last.ends_with(suffix) {
            return last[..last.len() - suffix.len()].to_string();
        }
    }
    last.to_string()
}

/// `transport::address` URLs run a git remote helper (`ext::` can run any command), so the
/// MCP and command line clone refuses them even when the user's git config would allow one.
pub fn is_remote_helper_url(url: &str) -> bool {
    url.trim().split_once("::").is_some_and(|(transport, _)| {
        !transport.is_empty()
            && transport
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'+' | b'-' | b'.'))
    })
}

/// Clones without progress or Cancel, for the MCP tool and the command line.
pub fn clone_quietly(url: &str, parent_dir: &str, folder_name: &str) -> AppResult<String> {
    clone_into(url, parent_dir, folder_name, None, &[], &mut |_line: &str| {})
}

/// The error a cancelled clone ends with; the Clone dialog shows it as a notice, not a failure.
pub const CLONE_CANCELLED: &str = "Clone cancelled";

/// The Pull dialog: pulls the upstream, or `branch_name` from `remote_name`, as a merge, rebase or fast-forward.
#[crate::command]
pub async fn pull_with_options(
    app: AppHandle,
    repo_path: String,
    remote_name: Option<String>,
    branch_name: Option<String>,
    mode: PullMode,
    no_commit: bool,
) -> AppResult<OpOutcome> {
    blocking(move || {
        run_pull_with_options(
            &repo_path,
            remote_name.as_deref(),
            branch_name.as_deref(),
            mode,
            no_commit,
            &mut emitter(&app, &repo_path),
        )
    })
    .await
}

/// The Push dialog: pushes the current branch to `remote_name`/`remote_branch`, tracking it on first push.
#[crate::command]
pub async fn push_with_options(
    app: AppHandle,
    repo_path: String,
    remote_name: String,
    remote_branch: String,
    force_with_lease: bool,
    push_tags: bool,
) -> AppResult<OpOutcome> {
    blocking(move || {
        run_push_with_options(
            &repo_path,
            &remote_name,
            &remote_branch,
            force_with_lease,
            push_tags,
            &mut emitter(&app, &repo_path),
        )
    })
    .await
}

#[crate::command]
pub async fn outgoing_commits(repo_path: String, remote_name: String, remote_branch: String) -> AppResult<OutgoingCommits> {
    blocking(move || outgoing(&git_repo::open(&repo_path)?, remote_name.trim(), remote_branch.trim())).await
}

#[crate::command]
pub async fn list_remotes(repo_path: String) -> AppResult<Vec<RemoteInfo>> {
    blocking(move || read_remotes(&git_repo::open(&repo_path)?)).await
}

#[crate::command]
pub async fn add_remote(repo_path: String, remote_name: String, fetch_url: String, push_url: Option<String>) -> AppResult<()> {
    blocking(move || run_add_remote(&repo_path, &remote_name, &fetch_url, push_url.as_deref())).await
}

#[crate::command]
pub async fn edit_remote(
    repo_path: String,
    remote_name: String,
    new_name: String,
    fetch_url: String,
    push_url: Option<String>,
) -> AppResult<()> {
    blocking(move || run_edit_remote(&repo_path, &remote_name, &new_name, &fetch_url, push_url.as_deref())).await
}

#[crate::command]
pub async fn remove_remote(repo_path: String, remote_name: String) -> AppResult<()> {
    blocking(move || run_remove_remote(&repo_path, &remote_name)).await
}

/// `git clone --progress` into `parent_dir`/`folder_name`, sending progress lines on `progress`.
/// With a `cancel_id`, `cancel_git_command` stops it and it fails with "Clone cancelled".
#[crate::command]
pub async fn clone_repository(
    url: String,
    parent_dir: String,
    folder_name: String,
    progress: Channel<String>,
    cancel_id: Option<String>,
) -> AppResult<String> {
    blocking(move || {
        let mut send = |line: &str| {
            let _ = progress.send(line.to_string());
        };
        clone_into(&url, &parent_dir, &folder_name, cancel_id.as_deref(), &[], &mut send)
    })
    .await
}

/// Stops a command started with `cancel_id` (the Clone dialog's Cancel); false when none runs.
#[crate::command]
pub async fn cancel_git_command(cancel_id: String) -> AppResult<bool> {
    blocking(move || Ok(cancel::cancel(&cancel_id))).await
}

/// Fetches every remote and prunes deleted branches (the Git menu's Fetch All Remotes).
#[crate::command]
pub async fn fetch_all(app: AppHandle, repo_path: String) -> AppResult<OpOutcome> {
    blocking(move || run_fetch(&repo_path, true, true, &mut emitter(&app, &repo_path))).await
}

/// Fetches the default remote, optionally pruning branches deleted there.
#[crate::command]
pub async fn fetch(app: AppHandle, repo_path: String, prune: bool) -> AppResult<OpOutcome> {
    blocking(move || run_fetch(&repo_path, false, prune, &mut emitter(&app, &repo_path))).await
}

#[crate::command]
pub async fn pull(app: AppHandle, repo_path: String, rebase: bool) -> AppResult<OpOutcome> {
    blocking(move || run_pull(&repo_path, rebase, &mut emitter(&app, &repo_path))).await
}

/// Pushes the current branch, setting its upstream on first push.
#[crate::command]
pub async fn push(app: AppHandle, repo_path: String, force: bool) -> AppResult<OpOutcome> {
    blocking(move || run_push(&repo_path, force, &mut emitter(&app, &repo_path))).await
}

/// Pushes every local tag to the branch's remote (or the default one).
#[crate::command]
pub async fn push_tags(app: AppHandle, repo_path: String) -> AppResult<OpOutcome> {
    blocking(move || run_push_tags(&repo_path, &mut emitter(&app, &repo_path))).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::{git_in, BareRemote, TestRepo};
    use crate::error::AppError;

    fn quiet() -> impl FnMut(&str) {
        |_line: &str| {}
    }

    /// A clone of a remote with one commit on main, and a second clone that pushes more.
    fn remote_with_two_clones() -> (BareRemote, TestRepo, TestRepo) {
        let remote = BareRemote::new();
        let seed = TestRepo::new();
        seed.add_remote("origin", &remote);
        seed.write("f.txt", "base\n");
        seed.commit_all("base");
        seed.git(&["push", "-q", "-u", "origin", "main"]);
        let local = TestRepo::clone_from(&remote);
        (remote, local, seed)
    }

    #[test]
    fn pull_merges_or_rebases_as_asked() {
        let (_remote, local, seed) = remote_with_two_clones();
        seed.write("remote.txt", "remote\n");
        seed.commit_all("remote change");
        seed.git(&["push", "-q"]);

        local.write("local.txt", "local\n");
        local.commit_all("local change");
        let pulled = run_pull(&local.path_string(), true, &mut quiet()).unwrap();
        assert!(!pulled.conflicts);
        // A rebase keeps history linear: the local commit sits on top of the remote one.
        assert_eq!(local.parent_count("HEAD"), 1);
        assert_eq!(local.git(&["log", "-1", "--format=%s", "HEAD~1"]).trim(), "remote change");

        seed.write("remote2.txt", "remote 2\n");
        seed.commit_all("remote change 2");
        seed.git(&["push", "-q"]);
        let merged = run_pull(&local.path_string(), false, &mut quiet()).unwrap();
        assert!(!merged.conflicts);
        assert_eq!(local.parent_count("HEAD"), 2);
    }

    #[test]
    fn pull_rebase_reports_conflicts() {
        let (_remote, local, seed) = remote_with_two_clones();
        seed.write("f.txt", "remote\n");
        seed.commit_all("remote edit");
        seed.git(&["push", "-q"]);
        local.write("f.txt", "local\n");
        local.commit_all("local edit");

        let pulled = run_pull(&local.path_string(), true, &mut quiet()).unwrap();
        assert!(pulled.conflicts);
        assert!(local.file(".git/rebase-merge").exists() || local.file(".git/rebase-apply").exists());
    }

    #[test]
    fn fetch_with_prune_drops_deleted_remote_branches() {
        let (_remote, local, seed) = remote_with_two_clones();
        seed.git(&["push", "-q", "origin", "main:gone"]);
        run_fetch(&local.path_string(), false, false, &mut quiet()).unwrap();
        assert!(local.git(&["branch", "-r"]).contains("origin/gone"));

        seed.git(&["push", "-q", "origin", "--delete", "gone"]);
        run_fetch(&local.path_string(), false, false, &mut quiet()).unwrap();
        assert!(local.git(&["branch", "-r"]).contains("origin/gone"), "a plain fetch keeps it");
        run_fetch(&local.path_string(), false, true, &mut quiet()).unwrap();
        assert!(!local.git(&["branch", "-r"]).contains("origin/gone"));
    }

    #[test]
    fn fetch_all_remotes_reads_every_remote() {
        let (_remote, local, _seed) = remote_with_two_clones();
        let other = BareRemote::new();
        local.add_remote("other", &other);
        local.git(&["push", "-q", "other", "main:elsewhere"]);
        local.git(&["update-ref", "-d", "refs/remotes/other/elsewhere"]);

        run_fetch(&local.path_string(), false, false, &mut quiet()).unwrap();
        assert!(!local.git(&["branch", "-r"]).contains("other/elsewhere"), "only origin is fetched");
        run_fetch(&local.path_string(), true, false, &mut quiet()).unwrap();
        assert!(local.git(&["branch", "-r"]).contains("other/elsewhere"));
    }

    #[test]
    fn push_tags_sends_local_tags() {
        let (remote, local, _seed) = remote_with_two_clones();
        local.git(&["tag", "v1.0"]);
        run_push_tags(&local.path_string(), &mut quiet()).unwrap();
        assert!(git_in(&remote.path, &["tag"]).contains("v1.0"));
    }

    #[test]
    fn push_tags_without_upstream_uses_the_only_remote() {
        let remote = BareRemote::new();
        let repo = TestRepo::new();
        repo.add_remote("upstream", &remote);
        repo.write("f.txt", "base\n");
        repo.commit_all("base");
        repo.git(&["tag", "-a", "v2", "-m", "two"]);
        run_push_tags(&repo.path_string(), &mut quiet()).unwrap();
        assert!(git_in(&remote.path, &["tag"]).contains("v2"));
    }

    #[test]
    fn push_publishes_a_branch_without_upstream() {
        let (remote, local, _seed) = remote_with_two_clones();
        local.git(&["switch", "-q", "-c", "topic"]);
        local.write("t.txt", "topic\n");
        local.commit_all("topic");
        run_push(&local.path_string(), false, &mut quiet()).unwrap();
        assert!(git_in(&remote.path, &["branch"]).contains("topic"));
        assert_eq!(local.git(&["rev-parse", "--abbrev-ref", "topic@{upstream}"]).trim(), "origin/topic");
    }

    fn diverge(local: &TestRepo, seed: &TestRepo) {
        seed.write("remote.txt", "remote\n");
        seed.commit_all("remote change");
        seed.git(&["push", "-q"]);
        local.write("local.txt", "local\n");
        local.commit_all("local change");
    }

    #[test]
    fn pull_with_options_ff_only_refuses_a_diverged_branch() {
        let (_remote, local, seed) = remote_with_two_clones();
        diverge(&local, &seed);
        let before = local.head();
        let refused = run_pull_with_options(&local.path_string(), None, None, PullMode::FfOnly, false, &mut quiet());
        assert!(refused.is_err());
        assert_eq!(local.head(), before);
    }

    #[test]
    fn pull_with_options_merges_rebases_and_stops_before_committing() {
        let (_remote, local, seed) = remote_with_two_clones();
        diverge(&local, &seed);
        let pulled = run_pull_with_options(
            &local.path_string(),
            Some("origin"),
            Some("main"),
            PullMode::Merge,
            true,
            &mut quiet(),
        )
        .unwrap();
        assert!(!pulled.conflicts);
        assert!(local.file(".git/MERGE_HEAD").exists(), "--no-commit leaves the merge to commit");
        local.git(&["merge", "--abort"]);

        // The dialog wins over the user's config.
        local.git(&["config", "pull.rebase", "true"]);
        run_pull_with_options(&local.path_string(), None, None, PullMode::Merge, false, &mut quiet()).unwrap();
        assert_eq!(local.parent_count("HEAD"), 2);

        seed.write("remote2.txt", "two\n");
        seed.commit_all("remote change 2");
        seed.git(&["push", "-q"]);
        local.write("local2.txt", "two\n");
        local.commit_all("local change 2");
        run_pull_with_options(&local.path_string(), None, None, PullMode::Rebase, false, &mut quiet()).unwrap();
        assert_eq!(local.parent_count("HEAD"), 1);
    }

    #[test]
    fn pull_with_options_needs_a_remote_for_a_branch() {
        let (_remote, local, _seed) = remote_with_two_clones();
        let refused = run_pull_with_options(&local.path_string(), None, Some("main"), PullMode::Merge, false, &mut quiet());
        assert!(matches!(refused, Err(AppError::Invalid(_))));
        let injected = run_pull_with_options(&local.path_string(), Some("--all"), None, PullMode::Merge, false, &mut quiet());
        assert!(matches!(injected, Err(AppError::Invalid(_))));
    }

    #[test]
    fn push_with_options_names_the_remote_branch_and_tracks_it() {
        let (remote, local, _seed) = remote_with_two_clones();
        local.git(&["switch", "-q", "-c", "topic"]);
        local.write("t.txt", "topic\n");
        local.commit_all("topic");
        local.git(&["tag", "v1"]);
        run_push_with_options(&local.path_string(), "origin", "review/topic", false, true, &mut quiet()).unwrap();
        assert!(git_in(&remote.path, &["branch"]).contains("review/topic"));
        assert!(git_in(&remote.path, &["tag"]).contains("v1"));
        assert_eq!(
            local.git(&["rev-parse", "--abbrev-ref", "topic@{upstream}"]).trim(),
            "origin/review/topic"
        );
    }

    #[test]
    fn push_with_options_force_with_lease_replaces_rewritten_history() {
        let (remote, local, _seed) = remote_with_two_clones();
        local.write("a.txt", "a\n");
        local.commit_all("first");
        run_push_with_options(&local.path_string(), "origin", "main", false, false, &mut quiet()).unwrap();
        local.git(&["commit", "-q", "--amend", "-m", "rewritten"]);
        let plain = run_push_with_options(&local.path_string(), "origin", "main", false, false, &mut quiet());
        assert!(plain.is_err(), "a rewritten branch needs a force push");
        run_push_with_options(&local.path_string(), "origin", "main", true, false, &mut quiet()).unwrap();
        assert_eq!(git_in(&remote.path, &["log", "-1", "--format=%s", "main"]).trim(), "rewritten");
    }

    #[test]
    fn push_with_options_refuses_a_detached_head() {
        let (_remote, local, _seed) = remote_with_two_clones();
        local.git(&["switch", "-q", "--detach", "HEAD"]);
        let refused = run_push_with_options(&local.path_string(), "origin", "main", false, false, &mut quiet());
        assert!(matches!(refused, Err(AppError::Invalid(message)) if message.contains("detached")));
    }

    #[test]
    fn outgoing_lists_commits_missing_on_the_remote_branch() {
        let (_remote, local, _seed) = remote_with_two_clones();
        local.write("a.txt", "a\n");
        local.commit_all("one");
        local.write("b.txt", "b\n");
        local.commit_all("two");
        let listed = outgoing(&local.open(), "origin", "main").unwrap();
        assert_eq!(listed.base.as_deref(), Some("origin/main"));
        let subjects: Vec<&str> = listed.commits.iter().map(|commit| commit.summary.as_str()).collect();
        assert_eq!(subjects, ["two", "one"]);
        assert!(!listed.truncated);

        // An unpublished branch: every commit no remote has.
        local.git(&["switch", "-q", "-c", "topic"]);
        local.write("c.txt", "c\n");
        local.commit_all("three");
        let unpublished = outgoing(&local.open(), "origin", "topic").unwrap();
        assert_eq!(unpublished.base, None);
        assert_eq!(unpublished.commits.len(), 3);
    }

    #[test]
    fn outgoing_is_empty_without_commits() {
        let repo = TestRepo::new();
        let listed = outgoing(&repo.open(), "origin", "main").unwrap();
        assert!(listed.commits.is_empty());
    }

    #[test]
    fn remotes_are_added_edited_and_removed() {
        let (remote, local, _seed) = remote_with_two_clones();
        let origin = read_remotes(&local.open()).unwrap();
        assert_eq!(origin.len(), 1);
        assert_eq!(origin[0].default_branch.as_deref(), Some("main"));
        assert_eq!(origin[0].fetch_url, origin[0].push_url);

        let repo_path = local.path_string();
        run_add_remote(&repo_path, "backup", "https://example.com/a.git", Some("https://example.com/push.git")).unwrap();
        let backup = read_remotes(&local.open())
            .unwrap()
            .into_iter()
            .find(|info| info.name == "backup")
            .unwrap();
        assert_eq!(backup.fetch_url.as_deref(), Some("https://example.com/a.git"));
        assert_eq!(backup.push_url.as_deref(), Some("https://example.com/push.git"));
        assert_eq!(backup.default_branch, None);

        run_edit_remote(&repo_path, "backup", "mirror", "https://example.com/b.git", None).unwrap();
        let remotes = read_remotes(&local.open()).unwrap();
        let mirror = remotes.iter().find(|info| info.name == "mirror").unwrap();
        assert!(!remotes.iter().any(|info| info.name == "backup"));
        assert_eq!(mirror.fetch_url.as_deref(), Some("https://example.com/b.git"));
        assert_eq!(mirror.push_url.as_deref(), Some("https://example.com/b.git"), "the separate push URL is gone");

        run_edit_remote(&repo_path, "origin", "origin", &remote.path_string(), Some("https://example.com/p.git")).unwrap();
        let edited = read_remotes(&local.open()).unwrap();
        let origin = edited.iter().find(|info| info.name == "origin").unwrap();
        assert_eq!(origin.push_url.as_deref(), Some("https://example.com/p.git"));

        run_remove_remote(&repo_path, "mirror").unwrap();
        assert!(!read_remotes(&local.open()).unwrap().iter().any(|info| info.name == "mirror"));
        assert!(matches!(run_add_remote(&repo_path, "-x", "u", None), Err(AppError::Invalid(_))));
        assert!(run_add_remote(&repo_path, "origin", "https://example.com/c.git", None).is_err());
    }

    #[test]
    fn clone_folder_names_follow_the_url_like_the_dialog() {
        for (url, expected) in [
            ("https://github.com/owner/repo.git", "repo"),
            ("https://github.com/owner/repo", "repo"),
            ("https://github.com/owner/repo/", "repo"),
            ("git@github.com:owner/Repo.GIT", "Repo"),
            ("git@host:repo.git", "repo"),
            ("/srv/git/project/.git", "project"),
            ("ssh://host/path/backup.bundle", "backup"),
            ("  https://host/x.git  ", "x"),
            ("", ""),
        ] {
            assert_eq!(clone_folder_name(url), expected, "{url}");
        }
    }

    #[test]
    fn remote_helper_urls_are_recognised() {
        for url in ["ext::sh -c touch% /tmp/x", "fd::17", "persistent-https::host/repo", " ext::x"] {
            assert!(is_remote_helper_url(url), "{url}");
        }
        for url in ["https://host/repo.git", "git@host:repo.git", "ssh://[::1]/repo.git", "/srv/repo", "file:///srv/repo"] {
            assert!(!is_remote_helper_url(url), "{url}");
        }
    }

    #[test]
    fn clone_goes_into_a_missing_or_empty_folder_only() {
        let (remote, _local, _seed) = remote_with_two_clones();
        let parent = crate::test_support::TestDir::new();
        let mut lines = Vec::new();
        let cloned = run_clone(&remote.path_string(), &parent.path_string(), "fresh", &mut |line: &str| {
            lines.push(line.to_string())
        })
        .unwrap();
        assert_eq!(cloned, parent.file_string("fresh"));
        assert!(parent.file("fresh/f.txt").exists());

        parent.mkdir("empty");
        run_clone(&remote.path_string(), &parent.path_string(), "empty", &mut quiet()).unwrap();
        assert!(parent.file("empty/f.txt").exists());

        parent.write("full/keep.txt", "keep\n");
        let refused = run_clone(&remote.path_string(), &parent.path_string(), "full", &mut quiet());
        assert!(matches!(refused, Err(AppError::Invalid(message)) if message.contains("not an empty folder")));
        for bad in ["", "..", "a/b"] {
            assert!(run_clone(&remote.path_string(), &parent.path_string(), bad, &mut quiet()).is_err());
        }
        assert!(run_clone("--upload-pack=x", &parent.path_string(), "evil", &mut quiet()).is_err());
    }

    /// Clones from `ext::sleep 30`, a transport that never answers, and cancels after a moment.
    fn cancelled_clone(parent: &crate::test_support::TestDir, folder_name: &str, cancel_id: &'static str) -> AppResult<String> {
        let canceller = std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(400));
            cancel::cancel(cancel_id)
        });
        let started = std::time::Instant::now();
        let result = clone_into(
            "ext::sleep 30",
            &parent.path_string(),
            folder_name,
            Some(cancel_id),
            &["protocol.ext.allow=always"],
            &mut quiet(),
        );
        assert!(canceller.join().unwrap(), "the clone was running when cancelled");
        assert!(started.elapsed() < std::time::Duration::from_secs(10));
        result
    }

    #[test]
    fn cancelling_a_clone_removes_only_what_it_created() {
        let parent = crate::test_support::TestDir::new();
        let refused = cancelled_clone(&parent, "fresh", "test-clone-cancel-fresh");
        assert!(matches!(refused, Err(AppError::Invalid(message)) if message == CLONE_CANCELLED));
        assert!(!parent.file("fresh").exists(), "the folder the clone created is gone");

        parent.mkdir("kept");
        let refused = cancelled_clone(&parent, "kept", "test-clone-cancel-kept");
        assert!(refused.is_err());
        assert!(parent.file("kept").is_dir(), "a folder that was there before stays");
        assert_eq!(std::fs::read_dir(parent.file("kept")).unwrap().count(), 0);
    }
}
