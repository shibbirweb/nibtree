//! Tauri commands of the Git > GitHub submenu and Settings > GitHub. All async so the
//! network, the keychain and gh never run on the main thread.

use super::account::GitHubAccount;
use super::client::{user_agent, CreatedGist, RepositoryInfo, SyncForkOutcome};
use super::gh::SystemGh;
use super::http::UreqTransport;
use super::secrets::KeychainStore;
use super::service::{default_host, GhCliStatus, GistRequest, GitHub, ShareRequest, SharedRepository};
use crate::commands::blocking;
use crate::config;
use crate::error::AppResult;

/// Runs `work` with the real network, keychain, gh and ~/.nibtree.
fn with_github<T>(work: impl FnOnce(&GitHub) -> AppResult<T>) -> AppResult<T> {
    let transport = UreqTransport::new(&user_agent());
    let github = GitHub {
        transport: &transport,
        secrets: &KeychainStore,
        gh: &SystemGh,
        config_dir: config::config_dir_in(&config::home_dir()?),
        host: default_host(),
    };
    work(&github)
}

/// The signed-in account from github.json: no keychain read, no network.
#[crate::command]
pub async fn github_account() -> AppResult<Option<GitHubAccount>> {
    blocking(|| with_github(|github| Ok(github.account()))).await
}

#[crate::command]
pub async fn github_cli_status() -> AppResult<GhCliStatus> {
    blocking(|| with_github(|github| Ok(github.cli_status()))).await
}

/// Verifies `token` with GitHub and saves it in the keychain. It is never sent back.
#[crate::command]
pub async fn github_sign_in_with_token(token: String) -> AppResult<GitHubAccount> {
    blocking(move || with_github(|github| github.sign_in_with_token(&token))).await
}

#[crate::command]
pub async fn github_sign_in_with_cli() -> AppResult<GitHubAccount> {
    blocking(|| with_github(|github| github.sign_in_with_cli())).await
}

#[crate::command]
pub async fn github_sign_out() -> AppResult<()> {
    blocking(|| with_github(|github| github.sign_out())).await
}

#[crate::command]
pub async fn github_share_project(repo_path: String, request: ShareRequest) -> AppResult<SharedRepository> {
    blocking(move || with_github(|github| github.share_project(&repo_path, &request))).await
}

#[crate::command]
pub async fn github_repository(owner: String, repo: String) -> AppResult<RepositoryInfo> {
    blocking(move || with_github(|github| github.repository(&owner, &repo))).await
}

#[crate::command]
pub async fn github_sync_fork(owner: String, repo: String, branch_name: String) -> AppResult<SyncForkOutcome> {
    blocking(move || with_github(|github| github.sync_fork(&owner, &repo, &branch_name))).await
}

#[crate::command]
pub async fn github_create_gist(request: GistRequest) -> AppResult<CreatedGist> {
    blocking(move || with_github(|github| github.create_gist(&request))).await
}
