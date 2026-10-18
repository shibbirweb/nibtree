use std::path::Path;

use super::{blocking, run_op, OpOutcome};
use crate::error::AppResult;
use crate::git::cli;
use crate::git::log;
use crate::git::refs::{self, Refs};
use crate::git::repo as git_repo;

#[crate::command]
pub async fn get_refs(repo_path: String) -> AppResult<Refs> {
    blocking(move || refs::read(&git_repo::open(&repo_path)?)).await
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RefsSnapshot {
    /// `refs::fingerprint`: also covers the stashes, remotes and work trees.
    pub fingerprint: String,
    /// `log::tips_hash`: changes exactly when the Log may show something else.
    pub tips: String,
    /// None when `known_fingerprint` still matched: nothing the sidebar shows changed.
    pub refs: Option<Refs>,
}

/// The branches of `repo_path` for a refresh: with the fingerprint the caller
/// holds, unchanged refs are not read again (ahead/behind walks every branch).
#[crate::command]
pub async fn get_refs_snapshot(repo_path: String, known_fingerprint: Option<String>) -> AppResult<RefsSnapshot> {
    blocking(move || {
        let repo = git_repo::open(&repo_path)?;
        let fingerprint = refs::fingerprint(&repo);
        let tips = log::tips_hash(&repo);
        if known_fingerprint.as_deref() == Some(fingerprint.as_str()) {
            return Ok(RefsSnapshot { fingerprint, tips, refs: None });
        }
        Ok(RefsSnapshot { fingerprint, tips, refs: Some(refs::read(&repo)?) })
    })
    .await
}

#[crate::command]
pub async fn checkout_branch(repo_path: String, branch_name: String) -> AppResult<()> {
    blocking(move || {
        cli::run(Path::new(&repo_path), &["switch", &branch_name])?;
        Ok(())
    })
    .await
}

/// Checks out a remote branch as a new tracking branch, or switches to the
/// existing local branch of the same name.
#[crate::command]
pub async fn checkout_remote_branch(repo_path: String, remote_branch: String, local_name: String) -> AppResult<()> {
    blocking(move || {
        let root = Path::new(&repo_path);
        let repo = git_repo::open(&repo_path)?;
        if repo.find_branch(&local_name, git2::BranchType::Local).is_ok() {
            cli::run(root, &["switch", &local_name])?;
        } else {
            cli::run(root, &["switch", "-c", &local_name, "--track", &remote_branch])?;
        }
        Ok(())
    })
    .await
}

#[crate::command]
pub async fn create_branch(
    repo_path: String,
    branch_name: String,
    start_point: Option<String>,
    checkout: bool,
) -> AppResult<()> {
    blocking(move || {
        let root = Path::new(&repo_path);
        let mut args = if checkout {
            vec!["switch", "-c", branch_name.as_str()]
        } else {
            vec!["branch", branch_name.as_str()]
        };
        if let Some(start) = start_point.as_deref() {
            args.push(start);
        }
        cli::run(root, &args)?;
        Ok(())
    })
    .await
}

#[crate::command]
pub async fn rename_branch(repo_path: String, branch_name: String, new_name: String) -> AppResult<()> {
    blocking(move || {
        cli::run(Path::new(&repo_path), &["branch", "-m", &branch_name, &new_name])?;
        Ok(())
    })
    .await
}

/// Deletes a local branch and returns the commit it pointed at, so the UI can offer Restore.
pub(crate) fn run_delete_branch(repo_path: &str, branch_name: &str, force: bool) -> AppResult<String> {
    let tip = {
        let repo = git_repo::open(repo_path)?;
        let branch = repo.find_branch(branch_name, git2::BranchType::Local)?;
        branch.get().target().map(|oid| oid.to_string()).unwrap_or_default()
    };
    let flag = if force { "-D" } else { "-d" };
    cli::run(Path::new(repo_path), &["branch", flag, branch_name])?;
    Ok(tip)
}

#[crate::command]
pub async fn delete_branch(repo_path: String, branch_name: String, force: bool) -> AppResult<String> {
    blocking(move || run_delete_branch(&repo_path, &branch_name, force)).await
}

#[crate::command]
pub async fn merge_branch(repo_path: String, branch_name: String) -> AppResult<OpOutcome> {
    blocking(move || run_op(&repo_path, &["merge", "--no-edit", &branch_name])).await
}

#[crate::command]
pub async fn rebase_onto(repo_path: String, branch_name: String) -> AppResult<OpOutcome> {
    blocking(move || run_op(&repo_path, &["rebase", &branch_name])).await
}
