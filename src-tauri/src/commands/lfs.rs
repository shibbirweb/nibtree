use tauri::AppHandle;

use super::blocking;
use super::submodule::progress_emitter;
use crate::error::AppResult;
use crate::git::lfs::{self, LfsStatus};

/// Whether git-lfs is installed, whether the repository uses it, and its files. The install
/// check runs once per app run for repositories that use LFS, or again with `check_install`.
/// With the `known_stamp` of the last answer, an unchanged repository answers `unchanged`.
#[crate::command]
pub async fn lfs_status(
    repo_path: String,
    check_install: Option<bool>,
    known_stamp: Option<String>,
) -> AppResult<LfsStatus> {
    blocking(move || lfs::status(&repo_path, check_install.unwrap_or_default(), known_stamp.as_deref())).await
}

#[crate::command]
pub async fn lfs_track(repo_path: String, pattern: String) -> AppResult<String> {
    blocking(move || lfs::track(&repo_path, &pattern)).await
}

#[crate::command]
pub async fn lfs_untrack(repo_path: String, pattern: String) -> AppResult<String> {
    blocking(move || lfs::untrack(&repo_path, &pattern)).await
}

/// `git lfs pull` (`pull` true) or `git lfs fetch`, with progress as "git-progress" events.
#[crate::command]
pub async fn lfs_transfer(app: AppHandle, repo_path: String, pull: bool) -> AppResult<String> {
    blocking(move || {
        let on_progress = progress_emitter(app, repo_path.clone());
        lfs::transfer(&repo_path, pull, on_progress)
    })
    .await
}

#[crate::command]
pub async fn lfs_prune(repo_path: String) -> AppResult<String> {
    blocking(move || lfs::prune(&repo_path)).await
}

#[crate::command]
pub async fn lfs_install(repo_path: String) -> AppResult<String> {
    blocking(move || lfs::install(&repo_path)).await
}
