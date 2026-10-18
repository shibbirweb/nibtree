use std::path::Path;
use std::sync::atomic::Ordering;

use serde::Deserialize;
#[cfg(feature = "desktop")]
use tauri::{AppHandle, State};

use super::rebase::cleanup_rebase_files;
use super::{blocking, run_op, safe_join, with_paths, OpOutcome};
use crate::error::{AppError, AppResult};
use crate::git::cli;
use crate::git::conflicts::{self, ConflictSummary};
use crate::git::opstate;
use crate::git::repo::{self as git_repo, path_text};
use crate::merge::model::{Eol, MergeDocument};
use crate::state::{AppState, LaunchMode};

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Side {
    Ours,
    Theirs,
}

#[crate::command]
pub async fn list_conflicts(repo_path: String) -> AppResult<ConflictSummary> {
    blocking(move || conflicts::list(&git_repo::open(&repo_path)?)).await
}

#[crate::command]
pub async fn load_conflict(repo_path: String, conflict_path: String, ignore_whitespace: bool) -> AppResult<MergeDocument> {
    blocking(move || conflicts::load(&git_repo::open(&repo_path)?, &conflict_path, ignore_whitespace)).await
}

/// Writes the merged result and stages it, which marks the conflict resolved.
#[crate::command]
pub async fn save_resolution(repo_path: String, conflict_path: String, content: String, eol: Eol) -> AppResult<()> {
    blocking(move || {
        let full = safe_join(&repo_path, &conflict_path)?;
        if let Some(parent) = full.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::write(&full, eol.apply(&content))?;
        cli::run(Path::new(&repo_path), &["add", "--", &conflict_path])?;
        Ok(())
    })
    .await
}

/// Resolves whole files by taking one side. A side that deleted the file
/// resolves to a deletion.
#[crate::command]
pub async fn accept_side(repo_path: String, conflict_paths: Vec<String>, side: Side) -> AppResult<()> {
    blocking(move || {
        let repo = git_repo::open(&repo_path)?;
        let index = repo.index()?;
        let (mut take, mut remove) = (Vec::new(), Vec::new());
        for conflict in index.conflicts()?.flatten() {
            let path = [&conflict.our, &conflict.their, &conflict.ancestor]
                .iter()
                .find_map(|entry| entry.as_ref().map(|entry| path_text(&entry.path)))
                .unwrap_or_default();
            if !conflict_paths.contains(&path) {
                continue;
            }
            let chosen = match side {
                Side::Ours => &conflict.our,
                Side::Theirs => &conflict.their,
            };
            if chosen.is_some() {
                take.push(path);
            } else {
                remove.push(path);
            }
        }
        let root = Path::new(&repo_path);
        if !take.is_empty() {
            let flag = match side {
                Side::Ours => "--ours",
                Side::Theirs => "--theirs",
            };
            cli::run(root, &with_paths(&["checkout", flag], &take))?;
            cli::run(root, &with_paths(&["add"], &take))?;
        }
        if !remove.is_empty() {
            cli::run(root, &with_paths(&["rm", "-q"], &remove))?;
        }
        Ok(())
    })
    .await
}

fn operation_subcommand(repo_path: &str) -> AppResult<&'static str> {
    let repo = git_repo::open(repo_path)?;
    opstate::read(&repo)
        .kind
        .subcommand()
        .ok_or_else(|| AppError::invalid("No merge, rebase, cherry-pick or revert is in progress"))
}

#[crate::command]
pub async fn continue_operation(repo_path: String) -> AppResult<OpOutcome> {
    blocking(move || {
        let subcommand = operation_subcommand(&repo_path)?;
        let finished = run_op(&repo_path, &[subcommand, "--continue"]);
        cleanup_rebase_files(&repo_path);
        finished
    })
    .await
}

#[crate::command]
pub async fn abort_operation(repo_path: String) -> AppResult<OpOutcome> {
    blocking(move || {
        let subcommand = operation_subcommand(&repo_path)?;
        let finished = run_op(&repo_path, &[subcommand, "--abort"]);
        cleanup_rebase_files(&repo_path);
        finished
    })
    .await
}

#[crate::command]
pub async fn skip_rebase_commit(repo_path: String) -> AppResult<OpOutcome> {
    blocking(move || {
        let finished = run_op(&repo_path, &["rebase", "--skip"]);
        cleanup_rebase_files(&repo_path);
        finished
    })
    .await
}

#[crate::command]
pub async fn load_mergetool(state: State<'_, AppState>, ignore_whitespace: bool) -> AppResult<MergeDocument> {
    let LaunchMode::MergeTool { base, local, remote, merged } = state.launch.clone() else {
        return Err(AppError::invalid("Not running as a mergetool"));
    };
    blocking(move || Ok(conflicts::load_files(&base, &local, &remote, &merged, ignore_whitespace))).await
}

/// Saves MERGED and exits with status 0 so `git mergetool` marks the file resolved.
#[crate::command]
pub fn save_mergetool(app: AppHandle, state: State<'_, AppState>, content: String, eol: Eol) -> AppResult<()> {
    let LaunchMode::MergeTool { merged, .. } = &state.launch else {
        return Err(AppError::invalid("Not running as a mergetool"));
    };
    std::fs::write(merged, eol.apply(&content))?;
    state.mergetool_exit_code.store(0, Ordering::SeqCst);
    app.exit(0);
    Ok(())
}

#[crate::command]
pub fn cancel_mergetool(app: AppHandle, state: State<'_, AppState>) {
    state.mergetool_exit_code.store(1, Ordering::SeqCst);
    app.exit(1);
}
