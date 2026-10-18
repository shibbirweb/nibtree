use serde::Serialize;
#[cfg(feature = "desktop")]
use tauri::AppHandle;

use crate::host::HostApp;

use super::blocking;
use crate::error::AppResult;
use crate::git::submodule::{self, SubmoduleInfo};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Progress<'a> {
    repo_path: &'a str,
    line: &'a str,
}

/// Progress lines go out as "git-progress", like fetch and pull.
pub fn progress_emitter(app: HostApp, repo_path: String) -> impl FnMut(&str) {
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

#[crate::command]
pub async fn list_submodules(repo_path: String) -> AppResult<Vec<SubmoduleInfo>> {
    blocking(move || submodule::list(&repo_path)).await
}

/// `git submodule init` for `submodule_paths`, or every submodule when empty.
#[crate::command]
pub async fn init_submodules(repo_path: String, submodule_paths: Vec<String>) -> AppResult<String> {
    blocking(move || submodule::init(&repo_path, &submodule_paths, &[])).await
}

/// `git submodule update --init --recursive`, with `--remote` when `remote`.
#[crate::command]
pub async fn update_submodules(
    app: AppHandle,
    repo_path: String,
    remote: bool,
    submodule_paths: Vec<String>,
) -> AppResult<String> {
    blocking(move || {
        let on_progress = progress_emitter(app, repo_path.clone());
        submodule::update(&repo_path, remote, &submodule_paths, &[], on_progress)
    })
    .await
}

#[crate::command]
pub async fn sync_submodules(repo_path: String) -> AppResult<String> {
    blocking(move || submodule::sync(&repo_path, &[])).await
}

#[crate::command]
pub async fn add_submodule(
    repo_path: String,
    url: String,
    submodule_path: String,
    branch_name: Option<String>,
) -> AppResult<String> {
    blocking(move || submodule::add(&repo_path, &url, &submodule_path, branch_name.as_deref(), &[])).await
}

#[crate::command]
pub async fn remove_submodule(repo_path: String, submodule_path: String) -> AppResult<()> {
    blocking(move || submodule::remove(&repo_path, &submodule_path, &[])).await
}
