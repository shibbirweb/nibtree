use crate::paths::RealPath;
use std::collections::HashMap;
use std::path::PathBuf;

#[cfg(feature = "desktop")]
use tauri::State;

use super::{blocking, safe_join};
use crate::error::AppResult;
use crate::git::files::{self, FileContent, FolderListing};
use crate::git::workspace;
use crate::preview_scheme::{self, PreviewStat, Target};
use crate::state::AppState;

/// Lists several folders of one workspace folder at once (the Files panel's refresh). Each
/// `dir_paths` entry is workspace-relative with `/` separators, "" for the workspace folder.
/// `repo_roots` are the workspace repositories, used for `isRepo` and `ignored`. A folder
/// whose stamp in `known` still matches answers `unchanged` without being read; a folder that
/// cannot be read answers with its own `error`, so one deleted folder never fails the rest.
#[crate::command]
pub async fn list_directories(
    root_path: String,
    dir_paths: Vec<String>,
    repo_roots: Vec<String>,
    known: Option<HashMap<String, String>>,
) -> AppResult<Vec<FolderListing>> {
    blocking(move || {
        let root = workspace::canonical_dir(&root_path)?;
        let root_text = root.to_string_lossy().into_owned();
        let repo_roots: Vec<PathBuf> = repo_roots
            .iter()
            .filter_map(|repo_root| PathBuf::from(repo_root).real_path().ok())
            .collect();
        let known = known.unwrap_or_default();
        let mut lister = files::FolderLister::new(&repo_roots);
        let listings = dir_paths
            .into_iter()
            .map(|dir_path| {
                let full_dir = if dir_path.is_empty() {
                    Ok(root.clone())
                } else {
                    safe_join(&root_text, &dir_path)
                };
                let known_stamp = known.get(&dir_path).map(String::as_str);
                lister.list(dir_path, full_dir, known_stamp)
            })
            .collect();
        Ok(listings)
    })
    .await
}

/// Reads a file for the editor; with the `known_version` of the text it has, an unchanged
/// file answers `unchanged` without its text.
#[crate::command]
pub async fn read_worktree_file(
    repo_path: String,
    file_path: String,
    known_version: Option<String>,
) -> AppResult<FileContent> {
    blocking(move || {
        let full_path = safe_join(&repo_path, &file_path)?;
        files::read_file(&full_path, &file_path, known_version.as_deref())
    })
    .await
}

/// What the preview needs before it loads a `gmpreview` URL: whether the file is there, its
/// size and, when it is too big, the limit. A work tree file (absolute `file_path`) without
/// `repo_root`, else a repo-relative `file_path` of `repo_root` at `revision`.
#[crate::command]
pub async fn preview_stat(
    window: tauri::Window,
    state: State<'_, AppState>,
    file_path: String,
    repo_root: Option<String>,
    revision: Option<String>,
) -> AppResult<PreviewStat> {
    let folders = state.preview_folders.get(window.label());
    blocking(move || {
        let target = Target::from_parts(file_path, repo_root, revision)?;
        preview_scheme::stat(&folders, &target)
    })
    .await
}
