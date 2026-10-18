//! Compare any two files: Compare Selected and Compare with Selected in the Files panel,
//! Compare with Clipboard and Compare with... on an editor tab.

use super::blocking;
use crate::error::AppResult;
use crate::git::compare::{self, CompareSide, FileCompare};

/// `left` against `right`, each an absolute file path or text. None when both sides still
/// have `known_version`, so a refresh of an unchanged pair only stats the files.
#[crate::command]
pub async fn compare_files(left: CompareSide, right: CompareSide, known_version: Option<String>) -> AppResult<Option<FileCompare>> {
    blocking(move || compare::compare_files(&left, &right, known_version.as_deref())).await
}
