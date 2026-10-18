//! Files panel writes: create, rename, copy, move and Move to Trash. The checks and
//! file system work live in `crate::file_ops`; these only move it off the main thread.

use serde::Serialize;

use super::blocking;
use crate::error::AppResult;
use crate::file_ops::{self, FileMove};

/// Creates a file or folder; `name` may hold "/" to create nested folders.
#[crate::command]
pub async fn file_create(
    workspace_roots: Vec<String>,
    parent_dir: String,
    name: String,
    is_dir: bool,
) -> AppResult<String> {
    blocking(move || file_ops::create_entry(&workspace_roots, &parent_dir, &name, is_dir)).await
}

#[crate::command]
pub async fn file_rename(workspace_roots: Vec<String>, entry_path: String, new_name: String) -> AppResult<String> {
    blocking(move || file_ops::rename_entry(&workspace_roots, &entry_path, &new_name)).await
}

#[crate::command]
pub async fn file_copy(
    workspace_roots: Vec<String>,
    source_paths: Vec<String>,
    target_dir: String,
) -> AppResult<Vec<String>> {
    blocking(move || file_ops::copy_entries(&workspace_roots, &source_paths, &target_dir)).await
}

/// What `file_move` answers: the moves made, or with `dry_run` only the first name the
/// target folder already has (null when the move can go ahead).
#[derive(Debug, Serialize)]
#[serde(untagged)]
pub enum MoveAnswer {
    Moved(Vec<FileMove>),
    Clash(Option<String>),
}

/// Moves into `target_dir`; `dry_run` runs every check and moves nothing.
#[crate::command]
pub async fn file_move(
    workspace_roots: Vec<String>,
    source_paths: Vec<String>,
    target_dir: String,
    dry_run: Option<bool>,
) -> AppResult<MoveAnswer> {
    blocking(move || {
        if dry_run.unwrap_or_default() {
            return file_ops::move_clash(&workspace_roots, &source_paths, &target_dir).map(MoveAnswer::Clash);
        }
        file_ops::move_entries(&workspace_roots, &source_paths, &target_dir).map(MoveAnswer::Moved)
    })
    .await
}

#[crate::command]
pub async fn file_trash(workspace_roots: Vec<String>, entry_paths: Vec<String>) -> AppResult<()> {
    blocking(move || file_ops::trash_entries(&workspace_roots, &entry_paths, file_ops::move_to_trash)).await
}

/// Which of the absolute `file_paths` are files inside the workspace.
#[crate::command]
pub async fn files_exist(workspace_roots: Vec<String>, file_paths: Vec<String>) -> AppResult<Vec<bool>> {
    blocking(move || Ok(file_ops::existing_files(&workspace_roots, &file_paths))).await
}

/// The real path of each of the absolute `file_paths` that is a file inside the workspace,
/// else null (the terminal's file links).
#[crate::command]
pub async fn real_files(workspace_roots: Vec<String>, file_paths: Vec<String>) -> AppResult<Vec<Option<String>>> {
    blocking(move || Ok(file_ops::real_files(&workspace_roots, &file_paths))).await
}
