use super::blocking;
use crate::error::AppResult;
use crate::git::worktree::{self, WorktreeBranch, WorktreeInfo};
use crate::git::worktree_prepare::{self, PrepareReport};

#[crate::command]
pub async fn list_worktrees(repo_path: String) -> AppResult<Vec<WorktreeInfo>> {
    blocking(move || worktree::list(&repo_path)).await
}

/// `git worktree add`; resolves with the new work tree's path.
#[crate::command]
pub async fn add_worktree(repo_path: String, worktree_path: String, branch: WorktreeBranch) -> AppResult<String> {
    blocking(move || worktree::add(&repo_path, &worktree_path, &branch)).await
}

#[crate::command]
pub async fn remove_worktree(repo_path: String, worktree_path: String, force: bool) -> AppResult<()> {
    blocking(move || worktree::remove(&repo_path, &worktree_path, force)).await
}

#[crate::command]
pub async fn lock_worktree(repo_path: String, worktree_path: String, reason: Option<String>) -> AppResult<()> {
    blocking(move || worktree::lock(&repo_path, &worktree_path, reason.as_deref())).await
}

#[crate::command]
pub async fn unlock_worktree(repo_path: String, worktree_path: String) -> AppResult<()> {
    blocking(move || worktree::unlock(&repo_path, &worktree_path)).await
}

#[crate::command]
pub async fn prune_worktrees(repo_path: String) -> AppResult<String> {
    blocking(move || worktree::prune(&repo_path)).await
}

/// Whether removing the work tree would throw away changes (it then needs force).
#[crate::command]
pub async fn worktree_has_changes(worktree_path: String) -> AppResult<bool> {
    blocking(move || worktree::has_changes(&worktree_path)).await
}

/// What a new task branches from: `origin/HEAD`'s branch, else the current branch (see worktree_prepare.rs).
#[crate::command]
pub async fn worktree_default_base(repo_path: String) -> AppResult<String> {
    blocking(move || worktree_prepare::default_base(&repo_path)).await
}

/// Copies the `.worktreeinclude` paths and links `link_dirs` from the main checkout into a new worktree.
#[crate::command]
pub async fn prepare_worktree(main_root: String, worktree_path: String, link_dirs: Vec<String>) -> AppResult<PrepareReport> {
    blocking(move || worktree_prepare::prepare(&main_root, &worktree_path, &link_dirs)).await
}
