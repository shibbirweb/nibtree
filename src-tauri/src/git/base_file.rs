//! The version the file editor's change bars and change peek compare against, as in VS Code: the file in the
//! index, which is what is staged (the last commit's version when nothing is). A file with no plain index entry
//! (being merged with conflicts, or removed from the index) falls back to HEAD; an untracked file reads as empty.

use std::path::Path;

use git2::{Oid, Repository};

use super::diff::{self, HeadFile, HeadVersion, MAX_DIFF_BYTES};
use super::repo::bytes_to_text;
use crate::error::AppResult;
use crate::merge::model::into_lf;

/// The index's object for `path`, None when the index has no plain (stage 0) entry for it.
fn index_blob(repo: &Repository, path: &str) -> AppResult<Option<Oid>> {
    Ok(repo.index()?.get_path(Path::new(path), 0).map(|entry| entry.id))
}

fn version_with(repo: &Repository, path: &str, orig_path: Option<&str>, blob: Option<Oid>) -> HeadVersion {
    let head = diff::head_version(repo, path, orig_path);
    match blob {
        Some(oid) => HeadVersion {
            commit_id: head.commit_id,
            blob_id: Some(oid.to_string()),
        },
        None => head,
    }
}

/// The HEAD commit (blame follows it) and the base file's object (the marks follow it).
pub fn base_version(repo: &Repository, path: &str, orig_path: Option<&str>) -> AppResult<HeadVersion> {
    Ok(version_with(repo, path, orig_path, index_blob(repo, path)?))
}

/// The base file, LF-normalized; binary and very large files have no text, as with `diff::head_file`.
pub fn base_file(repo: &Repository, path: &str, orig_path: Option<&str>) -> AppResult<HeadFile> {
    let Some(oid) = index_blob(repo, path)? else {
        return diff::head_file(repo, path, orig_path);
    };
    let mut file = HeadFile {
        content: String::new(),
        binary: false,
        too_large: false,
        version: version_with(repo, path, orig_path, Some(oid)),
    };
    let blob = repo.find_blob(oid)?;
    if blob.content().len() > MAX_DIFF_BYTES {
        file.too_large = true;
        return Ok(file);
    }
    match bytes_to_text(blob.content().to_vec()) {
        Some(text) => file.content = into_lf(text),
        None => file.binary = true,
    }
    Ok(file)
}
