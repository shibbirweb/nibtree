//! The per-branch actions of the Branches popup that the plain branch commands lack:
//! Update and Push for a branch that is not checked out, Track / Unset upstream, Compare
//! with Current and Show Diff with Working Tree.

use std::path::Path;

use git2::{BranchType, DiffFindOptions, DiffOptions, Repository, Sort};
use serde::Serialize;
use tauri::AppHandle;

use super::remote::{default_remote, emitter};
use super::{blocking, reject_option, OpOutcome};
use crate::error::{AppError, AppResult};
use crate::git::cli;
use crate::git::diff::{self, FileDiff};
use crate::git::log::{delta_status, summarize, ChangedFile, CommitSummary};
use crate::git::repo::{self as git_repo, path_text, resolve_commit};

/// Commits listed per side of a comparison; more is cut off with `truncated`.
const MAX_COMPARED: usize = 1000;

fn checked_branch(branch_name: &str) -> AppResult<&str> {
    let branch_name = branch_name.trim();
    if branch_name.is_empty() {
        return Err(AppError::invalid("Choose a branch"));
    }
    reject_option(branch_name, "A branch name")?;
    Ok(branch_name)
}

/// The remote and remote ref (refs/heads/...) a local branch tracks; None without an upstream.
fn upstream_of(repo: &Repository, branch_name: &str) -> Option<(String, String)> {
    let refname = format!("refs/heads/{branch_name}");
    let remote = repo.branch_upstream_remote(&refname).ok()?.as_str().ok()?.to_string();
    let merge = repo.branch_upstream_merge(&refname).ok()?.as_str().ok()?.to_string();
    Some((remote, merge))
}

fn finished(output: cli::GitOutput) -> OpOutcome {
    OpOutcome {
        output: output.text(),
        conflicts: false,
    }
}

/// `git fetch <remote> <upstream>:<branch>`: fast-forwards a branch that is not checked out
/// from its upstream; git refuses anything that is not a fast-forward.
fn run_update_branch(repo_path: &str, branch_name: &str, on_progress: &mut dyn FnMut(&str)) -> AppResult<OpOutcome> {
    let branch_name = checked_branch(branch_name)?;
    let (remote, merge) = {
        let repo = git_repo::open(repo_path)?;
        let branch = repo
            .find_branch(branch_name, BranchType::Local)
            .map_err(|_| AppError::invalid(format!("There is no local branch {branch_name}")))?;
        if branch.is_head() {
            return Err(AppError::invalid(format!("{branch_name} is checked out: pull to update it")));
        }
        upstream_of(&repo, branch_name)
            .ok_or_else(|| AppError::invalid(format!("{branch_name} has no upstream to update from")))?
    };
    reject_option(&remote, "A remote name")?;
    let refspec = format!("{merge}:refs/heads/{branch_name}");
    let output = cli::run_streaming(Path::new(repo_path), &["fetch", "--progress", &remote, &refspec], on_progress)?;
    Ok(finished(output))
}

/// Pushes a local branch (checked out or not) to its upstream, or publishes it to the
/// default remote under the same name and tracks it.
fn run_push_branch(repo_path: &str, branch_name: &str, on_progress: &mut dyn FnMut(&str)) -> AppResult<OpOutcome> {
    let branch_name = checked_branch(branch_name)?;
    let (remote, target, set_upstream) = {
        let repo = git_repo::open(repo_path)?;
        repo.find_branch(branch_name, BranchType::Local)
            .map_err(|_| AppError::invalid(format!("There is no local branch {branch_name}")))?;
        match upstream_of(&repo, branch_name).filter(|(remote, _)| remote != ".") {
            Some((remote, merge)) => (remote, merge, false),
            None => (default_remote(&repo)?, format!("refs/heads/{branch_name}"), true),
        }
    };
    reject_option(&remote, "A remote name")?;
    let refspec = format!("refs/heads/{branch_name}:{target}");
    let mut args = vec!["push", "--progress"];
    if set_upstream {
        args.push("-u");
    }
    args.push(&remote);
    args.push(&refspec);
    let output = cli::run_streaming(Path::new(repo_path), &args, on_progress)?;
    Ok(finished(output))
}

fn run_set_upstream(repo_path: &str, branch_name: &str, upstream: &str) -> AppResult<()> {
    let branch_name = checked_branch(branch_name)?;
    let upstream = upstream.trim();
    if upstream.is_empty() {
        return Err(AppError::invalid("Choose the remote branch to track"));
    }
    reject_option(upstream, "A remote branch")?;
    let flag = format!("--set-upstream-to={upstream}");
    cli::run(Path::new(repo_path), &["branch", &flag, branch_name])?;
    Ok(())
}

fn run_unset_upstream(repo_path: &str, branch_name: &str) -> AppResult<()> {
    let branch_name = checked_branch(branch_name)?;
    cli::run(Path::new(repo_path), &["branch", "--unset-upstream", branch_name])?;
    Ok(())
}

/// Compare with Current: the commits each side has that the other lacks, and the files
/// that differ between them (`base` on the left, `branch` on the right).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BranchComparison {
    pub branch_id: String,
    pub base_id: String,
    /// In `branch`, not in `base`; newest first.
    pub branch_only: Vec<CommitSummary>,
    /// In `base`, not in `branch`; newest first.
    pub base_only: Vec<CommitSummary>,
    pub files: Vec<ChangedFile>,
    pub truncated: bool,
}

fn commits_between(repo: &Repository, include: git2::Oid, exclude: git2::Oid, truncated: &mut bool) -> AppResult<Vec<CommitSummary>> {
    let mut walk = repo.revwalk()?;
    walk.set_sorting(Sort::TOPOLOGICAL | Sort::TIME)?;
    walk.push(include)?;
    walk.hide(exclude)?;
    let mut commits = Vec::new();
    for oid in walk {
        if commits.len() == MAX_COMPARED {
            *truncated = true;
            break;
        }
        commits.push(summarize(&repo.find_commit(oid?)?, Vec::new()));
    }
    Ok(commits)
}

fn changed_files(diff: &git2::Diff) -> Vec<ChangedFile> {
    diff.deltas()
        .map(|delta| {
            let new_path = delta.new_file().path_bytes().map(path_text);
            let old_path = delta.old_file().path_bytes().map(path_text);
            let path = new_path.clone().or_else(|| old_path.clone()).unwrap_or_default();
            let orig_path = if delta.status() == git2::Delta::Renamed { old_path } else { None };
            let status = match delta.status() {
                git2::Delta::Untracked => "added",
                other => delta_status(other),
            };
            ChangedFile {
                path,
                orig_path,
                status: status.to_string(),
            }
        })
        .collect()
}

fn compare(repo: &Repository, branch_name: &str, base_name: &str) -> AppResult<BranchComparison> {
    let branch = resolve_commit(repo, branch_name)?;
    let base = resolve_commit(repo, base_name)?;
    let mut truncated = false;
    let branch_only = commits_between(repo, branch.id(), base.id(), &mut truncated)?;
    let base_only = commits_between(repo, base.id(), branch.id(), &mut truncated)?;
    let mut diff = repo.diff_tree_to_tree(Some(&base.tree()?), Some(&branch.tree()?), None)?;
    diff.find_similar(Some(DiffFindOptions::new().renames(true)))?;
    Ok(BranchComparison {
        branch_id: branch.id().to_string(),
        base_id: base.id().to_string(),
        branch_only,
        base_only,
        files: changed_files(&diff),
        truncated,
    })
}

/// Show Diff with Working Tree: files that differ between a revision and the work tree
/// (untracked files count as added).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorktreeComparison {
    pub commit_id: String,
    pub files: Vec<ChangedFile>,
}

fn compare_worktree(repo: &Repository, revision: &str) -> AppResult<WorktreeComparison> {
    let commit = resolve_commit(repo, revision)?;
    let mut options = DiffOptions::new();
    options
        .include_untracked(true)
        .recurse_untracked_dirs(true)
        .ignore_submodules(true);
    let diff = repo.diff_tree_to_workdir_with_index(Some(&commit.tree()?), Some(&mut options))?;
    Ok(WorktreeComparison {
        commit_id: commit.id().to_string(),
        files: changed_files(&diff),
    })
}

/// Branch popup's Update: fetches and fast-forwards a branch that is not checked out.
#[crate::command]
pub async fn update_branch(app: AppHandle, repo_path: String, branch_name: String) -> AppResult<OpOutcome> {
    blocking(move || run_update_branch(&repo_path, &branch_name, &mut emitter(&app, &repo_path))).await
}

/// Branch popup's Push: pushes a local branch to its upstream, or publishes and tracks it.
#[crate::command]
pub async fn push_branch(app: AppHandle, repo_path: String, branch_name: String) -> AppResult<OpOutcome> {
    blocking(move || run_push_branch(&repo_path, &branch_name, &mut emitter(&app, &repo_path))).await
}

/// `git branch --set-upstream-to=<upstream> <branch>`.
#[crate::command]
pub async fn set_branch_upstream(repo_path: String, branch_name: String, upstream: String) -> AppResult<()> {
    blocking(move || run_set_upstream(&repo_path, &branch_name, &upstream)).await
}

/// `git branch --unset-upstream <branch>`.
#[crate::command]
pub async fn unset_branch_upstream(repo_path: String, branch_name: String) -> AppResult<()> {
    blocking(move || run_unset_upstream(&repo_path, &branch_name)).await
}

#[crate::command]
pub async fn compare_branches(repo_path: String, branch_name: String, base_name: String) -> AppResult<BranchComparison> {
    blocking(move || compare(&git_repo::open(&repo_path)?, &branch_name, &base_name)).await
}

#[crate::command]
pub async fn compare_with_worktree(repo_path: String, revision: String) -> AppResult<WorktreeComparison> {
    blocking(move || compare_worktree(&git_repo::open(&repo_path)?, &revision)).await
}

/// One file between two revisions (`from_revision` left, `to_revision` right).
#[crate::command]
pub async fn revisions_file_diff(
    repo_path: String,
    from_revision: String,
    to_revision: String,
    file_path: String,
    orig_path: Option<String>,
) -> AppResult<FileDiff> {
    blocking(move || {
        let repo = git_repo::open(&repo_path)?;
        diff::between_revisions(&repo, &from_revision, &to_revision, &file_path, orig_path.as_deref())
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::{git_in, BareRemote, TestRepo};

    fn quiet() -> impl FnMut(&str) {
        |_line: &str| {}
    }

    /// A remote with main and feature, a clone tracking both (main checked out), and a second clone.
    fn tracked_feature() -> (BareRemote, TestRepo, TestRepo) {
        let remote = BareRemote::new();
        let seed = TestRepo::new();
        seed.add_remote("origin", &remote);
        seed.write("f.txt", "base\n");
        seed.commit_all("base");
        seed.git(&["push", "-q", "-u", "origin", "main"]);
        seed.git(&["switch", "-q", "-c", "feature"]);
        seed.write("feature.txt", "one\n");
        seed.commit_all("feature one");
        seed.git(&["push", "-q", "-u", "origin", "feature"]);
        let local = TestRepo::clone_from(&remote);
        local.git(&["branch", "-q", "--track", "feature", "origin/feature"]);
        (remote, local, seed)
    }

    #[test]
    fn update_fast_forwards_a_branch_without_checking_it_out() {
        let (_remote, local, seed) = tracked_feature();
        seed.write("feature.txt", "two\n");
        let pushed = seed.commit_all("feature two");
        seed.git(&["push", "-q"]);
        let head = local.head();

        run_update_branch(&local.path_string(), "feature", &mut quiet()).unwrap();
        assert_eq!(local.rev_parse("feature"), pushed);
        assert_eq!(local.head(), head, "HEAD did not move");
        assert_eq!(local.git(&["branch", "--show-current"]).trim(), "main");

        // A branch with its own commits is not a fast-forward: git refuses.
        seed.write("feature.txt", "three\n");
        seed.commit_all("feature three");
        seed.git(&["push", "-q"]);
        local.git(&["switch", "-q", "feature"]);
        local.write("local.txt", "local\n");
        let local_tip = local.commit_all("local work");
        local.checkout("main");
        assert!(run_update_branch(&local.path_string(), "feature", &mut quiet()).is_err());
        assert_eq!(local.rev_parse("feature"), local_tip);

        let current = run_update_branch(&local.path_string(), "main", &mut quiet());
        assert!(matches!(current, Err(AppError::Invalid(message)) if message.contains("checked out")));
        local.git(&["branch", "-q", "lonely"]);
        let lonely = run_update_branch(&local.path_string(), "lonely", &mut quiet());
        assert!(matches!(lonely, Err(AppError::Invalid(message)) if message.contains("no upstream")));
    }

    #[test]
    fn push_branch_publishes_and_then_pushes_to_the_upstream() {
        let (remote, local, _seed) = tracked_feature();
        local.git(&["branch", "-q", "topic"]);
        run_push_branch(&local.path_string(), "topic", &mut quiet()).unwrap();
        assert!(git_in(&remote.path, &["branch"]).contains("topic"));
        assert_eq!(local.git(&["rev-parse", "--abbrev-ref", "topic@{upstream}"]).trim(), "origin/topic");

        local.git(&["switch", "-q", "feature"]);
        local.write("more.txt", "more\n");
        let tip = local.commit_all("more feature");
        local.checkout("main");
        run_push_branch(&local.path_string(), "feature", &mut quiet()).unwrap();
        assert_eq!(git_in(&remote.path, &["rev-parse", "feature"]).trim(), tip);
    }

    #[test]
    fn upstream_is_set_and_unset() {
        let (_remote, local, _seed) = tracked_feature();
        local.git(&["branch", "-q", "--no-track", "work", "main"]);
        run_set_upstream(&local.path_string(), "work", "origin/feature").unwrap();
        assert_eq!(local.git(&["rev-parse", "--abbrev-ref", "work@{upstream}"]).trim(), "origin/feature");
        run_unset_upstream(&local.path_string(), "work").unwrap();
        assert!(local.git_raw(&["rev-parse", "--abbrev-ref", "work@{upstream}"]).status.code() != Some(0));
        assert!(run_set_upstream(&local.path_string(), "work", "--evil").is_err());
        assert!(run_set_upstream(&local.path_string(), "-d", "origin/feature").is_err());
    }

    #[test]
    fn compares_commits_and_files_between_branches() {
        let repo = TestRepo::new();
        repo.write("shared.txt", "base\n");
        repo.write("old.txt", "rename me\nwith enough text to match\n");
        repo.commit_all("base");
        repo.git(&["switch", "-q", "-c", "feature"]);
        repo.write("feature.txt", "feature\n");
        repo.git(&["mv", "old.txt", "new.txt"]);
        repo.commit_all("feature one");
        repo.write("shared.txt", "feature edit\n");
        repo.commit_all("feature two");
        repo.checkout("main");
        repo.write("main.txt", "main\n");
        repo.commit_all("main only");

        let comparison = compare(&repo.open(), "feature", "main").unwrap();
        let subjects = |commits: &[CommitSummary]| commits.iter().map(|commit| commit.summary.clone()).collect::<Vec<_>>();
        assert_eq!(subjects(&comparison.branch_only), ["feature two", "feature one"]);
        assert_eq!(subjects(&comparison.base_only), ["main only"]);
        assert!(!comparison.truncated);
        let mut files: Vec<(String, String)> =
            comparison.files.iter().map(|file| (file.path.clone(), file.status.clone())).collect();
        files.sort();
        assert_eq!(
            files,
            [
                ("feature.txt".to_string(), "added".to_string()),
                ("main.txt".to_string(), "deleted".to_string()),
                ("new.txt".to_string(), "renamed".to_string()),
                ("shared.txt".to_string(), "modified".to_string()),
            ]
        );
        let renamed = comparison.files.iter().find(|file| file.path == "new.txt").unwrap();
        assert_eq!(renamed.orig_path.as_deref(), Some("old.txt"));

        let shared = diff::between_revisions(&repo.open(), &comparison.base_id, &comparison.branch_id, "shared.txt", None).unwrap();
        assert_eq!((shared.original.as_str(), shared.modified.as_str()), ("base\n", "feature edit\n"));
        let moved = diff::between_revisions(&repo.open(), "main", "feature", "new.txt", Some("old.txt")).unwrap();
        assert_eq!(moved.original, moved.modified);
    }

    #[test]
    fn compares_a_branch_with_the_working_tree() {
        let repo = TestRepo::new();
        repo.write("a.txt", "a\n");
        repo.commit_all("base");
        repo.git(&["switch", "-q", "-c", "feature"]);
        repo.write("b.txt", "b\n");
        repo.commit_all("feature");
        repo.checkout("main");
        repo.write("a.txt", "edited\n");
        repo.write("new.txt", "untracked\n");

        let comparison = compare_worktree(&repo.open(), "feature").unwrap();
        assert_eq!(comparison.commit_id, repo.rev_parse("feature"));
        let mut files: Vec<(String, String)> =
            comparison.files.iter().map(|file| (file.path.clone(), file.status.clone())).collect();
        files.sort();
        assert_eq!(
            files,
            [
                ("a.txt".to_string(), "modified".to_string()),
                ("b.txt".to_string(), "deleted".to_string()),
                ("new.txt".to_string(), "added".to_string()),
            ]
        );
    }
}
