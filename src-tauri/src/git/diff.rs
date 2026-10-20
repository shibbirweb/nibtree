//! Loads the two sides of a 2-way diff, with their line hunks. The frontend
//! draws the diff with CodeMirror and refines each hunk to characters there.

use git2::{Oid, Repository, Tree};
use serde::{Deserialize, Serialize};

use super::files::stat_version;
use super::lfs::{self, LfsPointer};
use super::repo::{bytes_to_text, resolve_commit, workdir};
use crate::error::{AppError, AppResult};
use crate::merge::line_diff::{text_hunks, LineHunk};
use crate::merge::model::{into_lf, Eol};

/// Files above this size are not diffed in the UI.
pub(crate) const MAX_DIFF_BYTES: usize = 4 * 1024 * 1024;

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum DiffArea {
    /// HEAD vs index.
    Staged,
    /// Index vs work tree.
    Unstaged,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileDiff {
    pub path: String,
    pub original: String,
    pub modified: String,
    pub original_eol: Eol,
    pub modified_eol: Eol,
    pub binary: bool,
    pub too_large: bool,
    /// Set when either side is a Git LFS pointer: the sizes to show instead of the pointer text.
    pub lfs: Option<LfsDiff>,
    /// The changed lines, `[oldStart, oldEnd, newStart, newEnd]` (0-based, half-open).
    pub hunks: Vec<LineHunk>,
    /// Staged and unstaged diffs only: which versions of the sides these are, so a refresh
    /// can ask whether anything changed (see `working_file_if_changed`).
    pub version: Option<String>,
}

/// One side's real content: from the pointer, or the bytes when that side is
/// the checked-out file itself.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LfsDiff {
    pub original_size: Option<u64>,
    pub modified_size: Option<u64>,
    pub original_oid: Option<String>,
    pub modified_oid: Option<String>,
}

enum Side {
    Missing,
    Bytes(Vec<u8>),
}

fn blob_side(repo: &Repository, oid: Oid) -> AppResult<Side> {
    Ok(Side::Bytes(repo.find_blob(oid)?.content().to_vec()))
}

const GITLINK_MODE: u32 = 0o160000;

/// A submodule side reads like `git diff` shows it.
fn gitlink_side(oid: Oid) -> Side {
    Side::Bytes(format!("Subproject commit {oid}\n").into_bytes())
}

fn tree_side(repo: &Repository, tree: Option<&Tree>, path: &str) -> AppResult<Side> {
    let Some(tree) = tree else {
        return Ok(Side::Missing);
    };
    match tree.get_path(std::path::Path::new(path)) {
        Ok(entry) if entry.filemode() as u32 == GITLINK_MODE => Ok(gitlink_side(entry.id())),
        Ok(entry) => blob_side(repo, entry.id()),
        Err(_) => Ok(Side::Missing),
    }
}

fn index_side(repo: &Repository, path: &str) -> AppResult<Side> {
    let index = repo.index()?;
    match index.get_path(std::path::Path::new(path), 0) {
        Some(entry) if entry.mode == GITLINK_MODE => Ok(gitlink_side(entry.id)),
        Some(entry) => blob_side(repo, entry.id),
        None => Ok(Side::Missing),
    }
}

fn workdir_side(repo: &Repository, path: &str) -> AppResult<Side> {
    let full = workdir(repo)?.join(path);
    if full.is_dir() {
        // A submodule: the commit checked out in it.
        let head = Repository::open(&full).ok().and_then(|submodule| submodule.head().ok()?.target());
        return Ok(head.map(gitlink_side).unwrap_or(Side::Missing));
    }
    match std::fs::read(&full) {
        Ok(bytes) => Ok(Side::Bytes(bytes)),
        Err(_) => Ok(Side::Missing),
    }
}

fn build(path: &str, original: Side, modified: Side) -> FileDiff {
    let size = |side: &Side| match side {
        Side::Missing => 0,
        Side::Bytes(bytes) => bytes.len(),
    };
    let mut diff = FileDiff {
        path: path.to_string(),
        original: String::new(),
        modified: String::new(),
        original_eol: Eol::Lf,
        modified_eol: Eol::Lf,
        binary: false,
        too_large: size(&original) > MAX_DIFF_BYTES || size(&modified) > MAX_DIFF_BYTES,
        lfs: lfs_diff(&original, &modified),
        hunks: Vec::new(),
        version: None,
    };
    if diff.too_large {
        return diff;
    }
    let to_text = |side: Side| -> Option<String> {
        match side {
            Side::Missing => Some(String::new()),
            Side::Bytes(bytes) => bytes_to_text(bytes),
        }
    };
    match (to_text(original), to_text(modified)) {
        (Some(original), Some(modified)) => {
            diff.original_eol = Eol::detect(&original);
            diff.modified_eol = Eol::detect(&modified);
            diff.original = into_lf(original);
            diff.modified = into_lf(modified);
            diff.hunks = text_hunks(&diff.original, &diff.modified);
        }
        _ => diff.binary = true,
    }
    diff
}

fn pointer_of(side: &Side) -> Option<LfsPointer> {
    match side {
        Side::Bytes(bytes) => lfs::parse_pointer(bytes),
        Side::Missing => None,
    }
}

/// LFS sizes when either side is a pointer; the other side, if present, is
/// the real (smudged) content of the work tree.
fn lfs_diff(original: &Side, modified: &Side) -> Option<LfsDiff> {
    let (original_pointer, modified_pointer) = (pointer_of(original), pointer_of(modified));
    if original_pointer.is_none() && modified_pointer.is_none() {
        return None;
    }
    let size_of = |side: &Side, pointer: &Option<LfsPointer>| match (pointer, side) {
        (Some(pointer), _) => Some(pointer.size),
        (None, Side::Bytes(bytes)) => Some(bytes.len() as u64),
        (None, Side::Missing) => None,
    };
    Some(LfsDiff {
        original_size: size_of(original, &original_pointer),
        modified_size: size_of(modified, &modified_pointer),
        original_oid: original_pointer.map(|pointer| pointer.oid),
        modified_oid: modified_pointer.map(|pointer| pointer.oid),
    })
}

fn head_tree(repo: &Repository) -> Option<Tree<'_>> {
    repo.head().ok().and_then(|head| head.peel_to_tree().ok())
}

/// A side's identity without reading it: the object id (and mode) for HEAD and index sides.
fn tree_token(tree: Option<&Tree>, path: &str) -> String {
    tree.and_then(|tree| tree.get_path(std::path::Path::new(path)).ok())
        .map(|entry| format!("{:o}:{}", entry.filemode(), entry.id()))
        .unwrap_or_else(|| "-".to_string())
}

fn index_token(repo: &Repository, path: &str) -> AppResult<String> {
    Ok(repo
        .index()?
        .get_path(std::path::Path::new(path), 0)
        .map(|entry| format!("{:o}:{}", entry.mode, entry.id))
        .unwrap_or_else(|| "-".to_string()))
}

/// The work tree side: the file's size, times and inode, or a submodule's checked-out commit.
fn workdir_token(repo: &Repository, path: &str) -> AppResult<String> {
    let full = workdir(repo)?.join(path);
    if full.is_dir() {
        let head = Repository::open(&full).ok().and_then(|submodule| submodule.head().ok()?.target());
        return Ok(head.map(|oid| format!("dir:{oid}")).unwrap_or_else(|| "-".to_string()));
    }
    Ok(std::fs::metadata(&full)
        .map(|meta| stat_version(&meta))
        .unwrap_or_else(|_| "-".to_string()))
}

/// Which versions of the two sides a staged or unstaged diff shows.
pub fn working_file_version(repo: &Repository, path: &str, orig_path: Option<&str>, area: DiffArea) -> AppResult<String> {
    Ok(match area {
        DiffArea::Unstaged => format!("u|{}|{}", index_token(repo, path)?, workdir_token(repo, path)?),
        DiffArea::Staged => format!(
            "s|{}|{}",
            tree_token(head_tree(repo).as_ref(), orig_path.unwrap_or(path)),
            index_token(repo, path)?
        ),
    })
}

pub fn working_file(repo: &Repository, path: &str, orig_path: Option<&str>, area: DiffArea) -> AppResult<FileDiff> {
    // The version is taken before the sides are read: a change in between shows up next time.
    let version = working_file_version(repo, path, orig_path, area)?;
    let mut diff = match area {
        DiffArea::Unstaged => {
            let original = index_side(repo, path)?;
            let modified = workdir_side(repo, path)?;
            build(path, original, modified)
        }
        DiffArea::Staged => {
            let original = tree_side(repo, head_tree(repo).as_ref(), orig_path.unwrap_or(path))?;
            let modified = index_side(repo, path)?;
            build(path, original, modified)
        }
    };
    diff.version = Some(version);
    Ok(diff)
}

/// The diff, or None when its sides still have `known_version` (nothing is read then).
pub fn working_file_if_changed(
    repo: &Repository,
    path: &str,
    orig_path: Option<&str>,
    area: DiffArea,
    known_version: Option<&str>,
) -> AppResult<Option<FileDiff>> {
    if let Some(known) = known_version {
        if working_file_version(repo, path, orig_path, area)? == known {
            return Ok(None);
        }
    }
    working_file(repo, path, orig_path, area).map(Some)
}

/// The committed version of a file the editor compares against: the HEAD commit and the
/// file's object in it (at `orig_path` for a staged rename), both None when absent.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HeadVersion {
    pub commit_id: Option<String>,
    pub blob_id: Option<String>,
}

pub fn head_version(repo: &Repository, path: &str, orig_path: Option<&str>) -> HeadVersion {
    let Some(commit) = repo.head().ok().and_then(|head| head.peel_to_commit().ok()) else {
        return HeadVersion::default();
    };
    let blob_id = commit
        .tree()
        .ok()
        .and_then(|tree| tree.get_path(std::path::Path::new(orig_path.unwrap_or(path))).ok())
        .map(|entry| entry.id().to_string());
    HeadVersion {
        commit_id: Some(commit.id().to_string()),
        blob_id,
    }
}

/// The file as of HEAD, LF-normalized; a file HEAD does not have reads as empty text.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HeadFile {
    pub content: String,
    pub binary: bool,
    pub too_large: bool,
    pub version: HeadVersion,
}

pub fn head_file(repo: &Repository, path: &str, orig_path: Option<&str>) -> AppResult<HeadFile> {
    let version = head_version(repo, path, orig_path);
    let side = tree_side(repo, head_tree(repo).as_ref(), orig_path.unwrap_or(path))?;
    let mut file = HeadFile {
        content: String::new(),
        binary: false,
        too_large: false,
        version,
    };
    let Side::Bytes(bytes) = side else {
        return Ok(file);
    };
    if bytes.len() > MAX_DIFF_BYTES {
        file.too_large = true;
        return Ok(file);
    }
    match bytes_to_text(bytes) {
        Some(text) => file.content = into_lf(text),
        None => file.binary = true,
    }
    Ok(file)
}

/// A diff of two sides given as bytes (None: the side does not exist), e.g. a shelved file.
pub fn from_bytes(path: &str, original: Option<Vec<u8>>, modified: Option<Vec<u8>>) -> FileDiff {
    let side = |bytes: Option<Vec<u8>>| bytes.map(Side::Bytes).unwrap_or(Side::Missing);
    build(path, side(original), side(modified))
}

/// Diff of one file in a commit against one of its parents (0 is the first; a root commit has none).
pub fn commit_file(
    repo: &Repository,
    commit_id: &str,
    path: &str,
    orig_path: Option<&str>,
    parent_index: usize,
) -> AppResult<FileDiff> {
    let commit = repo.find_commit(Oid::from_str(commit_id)?)?;
    let tree = commit.tree()?;
    if parent_index > 0 && parent_index >= commit.parent_count() {
        return Err(AppError::invalid(format!("The commit has no parent {}", parent_index + 1)));
    }
    let parent_tree = commit.parent(parent_index).ok().and_then(|parent| parent.tree().ok());
    let original = tree_side(repo, parent_tree.as_ref(), orig_path.unwrap_or(path))?;
    let modified = tree_side(repo, Some(&tree), path)?;
    Ok(build(path, original, modified))
}

/// A file at a revision (left) against its work tree copy (right).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RevisionDiff {
    pub diff: FileDiff,
    pub exists_in_revision: bool,
    pub commit_id: String,
}

/// `orig_path` is the old name of a renamed file, read from `revision` instead of `path`.
pub fn against_revision(repo: &Repository, path: &str, orig_path: Option<&str>, revision: &str) -> AppResult<RevisionDiff> {
    let commit = resolve_commit(repo, revision)?;
    let tree = commit.tree()?;
    let original = tree_side(repo, Some(&tree), orig_path.unwrap_or(path))?;
    let exists_in_revision = matches!(original, Side::Bytes(_));
    let modified = workdir_side(repo, path)?;
    Ok(RevisionDiff {
        diff: build(path, original, modified),
        exists_in_revision,
        commit_id: commit.id().to_string(),
    })
}

/// One file between two revisions, e.g. the current branch (left) and another branch (right).
pub fn between_revisions(
    repo: &Repository,
    from_revision: &str,
    to_revision: &str,
    path: &str,
    orig_path: Option<&str>,
) -> AppResult<FileDiff> {
    let from_tree = resolve_commit(repo, from_revision)?.tree()?;
    let to_tree = resolve_commit(repo, to_revision)?.tree()?;
    let original = tree_side(repo, Some(&from_tree), orig_path.unwrap_or(path))?;
    let modified = tree_side(repo, Some(&to_tree), path)?;
    Ok(build(path, original, modified))
}
