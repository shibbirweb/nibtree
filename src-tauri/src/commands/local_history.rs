//! Local History (local_history/): settings, snapshots from the editor, the list of a file's
//! versions, a version compared with the current text, restoring deleted files and clearing.

use std::path::Path;

use serde::{Deserialize, Serialize};

use super::blocking;
use crate::config;
use crate::error::AppResult;
use crate::git::diff::{self, FileDiff};
use crate::local_history::plan::Limits;
use crate::local_history::store::{self, DeletedFile, Label, Snapshot, Store, Usage};
use crate::local_history::{self as history};
use crate::merge::model::Eol;

fn config_dir() -> AppResult<std::path::PathBuf> {
    Ok(config::config_dir_in(&config::home_dir()?))
}

fn current_store() -> AppResult<Store> {
    Ok(history::store_in(&config_dir()?))
}

/// Settings > Editor > Local History. Switching on prunes once in the background.
#[crate::command]
pub async fn local_history_configure(enabled: bool, max_days: u32, max_size_mb: u32) -> AppResult<()> {
    let root = if enabled { Some(config_dir()?.join(store::DIR_NAME)) } else { None };
    history::configure(root, Limits::new(max_days, max_size_mb));
    Ok(())
}

/// A snapshot the editor asks for: `text` as the editor has it (written with `eol`), or the
/// file on disk when `text` is null.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordRequest {
    pub file_path: String,
    #[serde(default)]
    pub text: Option<String>,
    #[serde(default)]
    pub eol: Option<Eol>,
    pub label: Label,
}

/// The bytes each request stands for; unreadable files and bad paths are left out.
pub fn request_bytes(requests: Vec<RecordRequest>) -> Vec<(String, Vec<u8>, Label)> {
    requests
        .into_iter()
        .filter(|request| store::check_file_path(&request.file_path).is_ok())
        .filter_map(|request| {
            let bytes = match request.text {
                Some(text) => request.eol.unwrap_or(Eol::Lf).apply(&text).into_bytes(),
                None => std::fs::read(&request.file_path).ok()?,
            };
            Some((request.file_path, bytes, request.label))
        })
        .collect()
}

/// External changes and Revert: one call with every snapshot, in order.
#[crate::command]
pub async fn local_history_record(records: Vec<RecordRequest>) -> AppResult<()> {
    blocking(move || history::record(&request_bytes(records))).await
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileHistory {
    pub file_path: String,
    /// False for a deleted file: the window offers Restore then.
    pub exists: bool,
    /// Newest first.
    pub snapshots: Vec<Snapshot>,
}

pub fn file_history(store: &Store, file_path: &str) -> AppResult<FileHistory> {
    let snapshots = store.list(file_path)?;
    let path = Path::new(file_path);
    Ok(FileHistory {
        file_path: file_path.to_string(),
        exists: path.exists(),
        snapshots,
    })
}

#[crate::command]
pub async fn local_history_list(file_path: String) -> AppResult<FileHistory> {
    blocking(move || file_history(&current_store()?, &file_path)).await
}

/// A version (left) against the current text (right): the editor's text when it has unsaved
/// edits, else the file on disk, or nothing for a deleted file.
pub fn snapshot_diff(store: &Store, file_path: &str, snapshot_hash: &str, current_text: Option<String>) -> AppResult<FileDiff> {
    let snapshot = store.read(file_path, snapshot_hash)?;
    let current = match current_text {
        Some(text) => Some(text.into_bytes()),
        None => std::fs::read(file_path).ok(),
    };
    Ok(diff::from_bytes(file_path, Some(snapshot), current))
}

#[crate::command]
pub async fn local_history_diff(file_path: String, snapshot_hash: String, current_text: Option<String>) -> AppResult<FileDiff> {
    blocking(move || snapshot_diff(&current_store()?, &file_path, &snapshot_hash, current_text)).await
}

/// Restore Deleted File: writes the version back; refused when a file is there again.
#[crate::command]
pub async fn local_history_restore(file_path: String, snapshot_hash: String) -> AppResult<()> {
    blocking(move || {
        let store = current_store()?;
        history::with_write_lock(|| store.restore(&file_path, &snapshot_hash))
    })
    .await
}

/// Recently Deleted: files under the workspace folders that have history but are gone.
#[crate::command]
pub async fn local_history_deleted(folder_paths: Vec<String>) -> AppResult<Vec<DeletedFile>> {
    blocking(move || current_store()?.deleted_under(&folder_paths)).await
}

#[crate::command]
pub async fn local_history_usage() -> AppResult<Usage> {
    blocking(move || current_store()?.usage()).await
}

/// Clear Local History: removes every snapshot of every file.
#[crate::command]
pub async fn local_history_clear() -> AppResult<()> {
    blocking(move || {
        let store = current_store()?;
        history::with_write_lock(|| store.clear())
    })
    .await
}
