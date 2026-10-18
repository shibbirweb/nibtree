use tauri::State;

use super::blocking;
use crate::error::AppResult;
use crate::git::repo::{self as git_repo, RepoInfo};
use crate::state::{AppState, LaunchMode};

#[crate::command]
pub fn get_launch_mode(state: State<'_, AppState>) -> LaunchMode {
    state.launch.clone()
}

#[crate::command]
pub async fn open_repo(repo_path: String) -> AppResult<RepoInfo> {
    blocking(move || git_repo::discover(&repo_path)).await
}
