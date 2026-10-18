//! Commit identity and commit message helpers for the commit box and Settings > Git.

use super::blocking;
use crate::error::AppResult;
use crate::git::identity::{self, GlobalConfig, Identity, IdentityScope};
use crate::git::messages::{self, RecentMessage};

/// Global and repository user.name and user.email; `repo_path` None reads only the global ones.
#[crate::command]
pub async fn get_identity(repo_path: Option<String>) -> AppResult<Identity> {
    blocking(move || identity::read_identity(repo_path.as_deref(), &GlobalConfig::from_env())).await
}

/// Writes the name and email with `git config --global` or `--local`; empty values are unset.
#[crate::command]
pub async fn set_identity(
    repo_path: Option<String>,
    scope: IdentityScope,
    name: String,
    email: String,
) -> AppResult<Identity> {
    blocking(move || identity::write_identity(repo_path.as_deref(), scope, &name, &email, &GlobalConfig::from_env())).await
}

/// The current user's recent commit messages from HEAD, newest first.
#[crate::command]
pub async fn recent_commit_messages(repo_path: String, limit: usize) -> AppResult<Vec<RecentMessage>> {
    blocking(move || messages::recent_messages(&repo_path, limit.min(100))).await
}

/// The `commit.template` file's text, or None.
#[crate::command]
pub async fn get_commit_template(repo_path: String) -> AppResult<Option<String>> {
    blocking(move || messages::commit_template(&repo_path)).await
}
