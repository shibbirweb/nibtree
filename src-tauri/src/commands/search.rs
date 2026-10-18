use tauri::{State, Window};

use super::blocking;
use crate::error::AppResult;
use crate::file_search::{FileSearchProgress, FileSearchResults, DEFAULT_LIMIT};
use crate::state::AppState;
use crate::symbols::outline::{outline, OutlineResult};
use crate::symbols::{SymbolScope, SymbolSearchProgress, SymbolSearchResults};
use crate::text_search::replace::{ReplaceOutcome, ReplaceRequest};
use crate::text_search::{TextSearchBatch, TextSearchOptions};

/// Go to File opened: starts (or reuses) the index of the workspace folders
/// and returns right away; `progress` hears about it until the popup closes.
#[crate::command]
pub async fn file_search_open(
    window: Window,
    state: State<'_, AppState>,
    workspace_roots: Vec<String>,
    progress: Channel<FileSearchProgress>,
) -> AppResult<FileSearchProgress> {
    let search = state.file_search.window(window.label());
    blocking(move || {
        Ok(search.open(
            &workspace_roots,
            Box::new(move |update| {
                let _ = progress.send(update);
            }),
        ))
    })
    .await
}

/// Matches against whatever is indexed so far; never waits for indexing.
#[crate::command]
pub async fn file_search_query(
    window: Window,
    state: State<'_, AppState>,
    workspace_roots: Vec<String>,
    query: String,
    limit: Option<usize>,
) -> AppResult<FileSearchResults> {
    let search = state.file_search.window(window.label());
    blocking(move || Ok(search.query(&workspace_roots, &query, limit.unwrap_or(DEFAULT_LIMIT)))).await
}

/// The popup closed; the index stays a short while so reopening is instant.
#[crate::command]
pub async fn file_search_close(window: Window, state: State<'_, AppState>) -> AppResult<()> {
    let search = state.file_search.window(window.label());
    blocking(move || {
        search.close();
        Ok(())
    })
    .await
}

/// A Classes or Symbols tab showed: starts (or reuses) the symbol index and
/// returns right away; `progress` hears about it until the popup closes.
#[crate::command]
pub async fn symbol_search_open(
    window: Window,
    state: State<'_, AppState>,
    workspace_roots: Vec<String>,
    progress: Channel<SymbolSearchProgress>,
) -> AppResult<SymbolSearchProgress> {
    let search = state.file_search.window(window.label());
    blocking(move || {
        Ok(search.open_symbols(
            &workspace_roots,
            Box::new(move |update| {
                let _ = progress.send(update);
            }),
        ))
    })
    .await
}

/// Matches against whatever symbols are indexed so far; never waits for indexing.
#[crate::command]
pub async fn symbol_search_query(
    window: Window,
    state: State<'_, AppState>,
    workspace_roots: Vec<String>,
    query: String,
    scope: SymbolScope,
    limit: Option<usize>,
) -> AppResult<SymbolSearchResults> {
    let search = state.file_search.window(window.label());
    blocking(move || {
        Ok(search.query_symbols(
            &workspace_roots,
            &query,
            scope,
            limit.unwrap_or(crate::symbols::DEFAULT_LIMIT),
        ))
    })
    .await
}

/// Find in Files: streams batches to `results` and resolves when the search
/// ends; a newer `search_id` (or a cancel) stops it within a file.
#[crate::command]
pub async fn text_search(
    window: Window,
    state: State<'_, AppState>,
    workspace_roots: Vec<String>,
    search_id: u64,
    query: String,
    options: TextSearchOptions,
    results: Channel<TextSearchBatch>,
) -> AppResult<()> {
    let search = state.file_search.window(window.label());
    blocking(move || {
        search.search_text(&workspace_roots, search_id, &query, &options, &|batch| {
            let _ = results.send(batch);
        });
        Ok(())
    })
    .await
}

#[crate::command]
pub async fn text_search_cancel(window: Window, state: State<'_, AppState>, search_id: u64) -> AppResult<()> {
    let search = state.file_search.window(window.label());
    blocking(move || {
        search.cancel_text_search(search_id);
        Ok(())
    })
    .await
}

/// Replace in Files: writes every file (or `request.filePaths`) where the
/// Text tab's query matches, or only counts with `request.preview`. Files in
/// `request.skipPaths` (unsaved edits) are never written. A newer
/// `replace_id` or a cancel stops it between files.
#[crate::command]
pub async fn replace_in_files(
    window: Window,
    state: State<'_, AppState>,
    workspace_roots: Vec<String>,
    replace_id: u64,
    request: ReplaceRequest,
) -> AppResult<ReplaceOutcome> {
    let search = state.file_search.window(window.label());
    blocking(move || Ok(search.replace_text(&workspace_roots, replace_id, &request))).await
}

#[crate::command]
pub async fn replace_in_files_cancel(window: Window, state: State<'_, AppState>, replace_id: u64) -> AppResult<()> {
    let search = state.file_search.window(window.label());
    blocking(move || {
        search.cancel_replace(replace_id);
        Ok(())
    })
    .await
}

/// Quick Open's "@" mode: the symbols of the editor's text (unsaved edits
/// included), read as the language of `file_path`. Nothing is cached.
#[crate::command]
pub async fn document_symbols(file_path: String, text: String) -> AppResult<OutlineResult> {
    blocking(move || Ok(outline(&file_path, &text))).await
}
