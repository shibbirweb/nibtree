//! Git info for the file editor: change marks against HEAD, blame of the text on screen and
//! the committed version. The editor's text arrives as a raw body (see `raw_parts`), so a
//! large file crosses the bridge as plain bytes instead of an escaped JSON string.

use std::path::Path;

use git2::Repository;
use serde::{Deserialize, Serialize};
use tauri::ipc::Request;

use super::{blocking, raw_parts};
use crate::error::{AppError, AppResult};
use crate::git::blame::{self, BlameRuns};
use crate::git::diff::{self, HeadFile, HeadVersion};
use crate::git::repo as git_repo;
use crate::merge::line_diff::{change_marks, ChangeMark};
use crate::merge::model::Eol;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct MarksArgs {
    repo_path: String,
    file_path: String,
    orig_path: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct BlameArgs {
    repo_path: String,
    file_path: String,
    eol: Eol,
}

/// The editor's changes since the last commit and the HEAD version they were measured against.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LineMarks {
    pub head: HeadVersion,
    pub marks: Vec<ChangeMark>,
}

fn utf8(bytes: &[u8]) -> AppResult<&str> {
    std::str::from_utf8(bytes).map_err(|_| AppError::invalid("The text is not valid UTF-8"))
}

/// Marks for `doc` (the editor's LF-normalized text) against the file in HEAD. A binary or
/// very large committed file gets none; a file HEAD does not have is all added.
pub fn marks_for(repo: &Repository, file_path: &str, orig_path: Option<&str>, doc: &str) -> AppResult<LineMarks> {
    let head = diff::head_file(repo, file_path, orig_path)?;
    let marks = if head.binary || head.too_large {
        Vec::new()
    } else {
        change_marks(&head.content, doc)
    };
    Ok(LineMarks {
        head: head.version,
        marks,
    })
}

/// Raw body: `{ repoPath, filePath, origPath }` as one JSON line, then the editor's text.
#[crate::command]
pub async fn line_change_marks(request: Request<'_>) -> AppResult<LineMarks> {
    let body = request.into_bytes();
    blocking(move || {
        let (args, doc) = raw_parts::<MarksArgs>(&body)?;
        let repo = git_repo::open(&args.repo_path)?;
        marks_for(&repo, &args.file_path, args.orig_path.as_deref(), utf8(doc)?)
    })
    .await
}

/// Blames the editor's text (`--contents -`), unsaved edits included. Raw body:
/// `{ repoPath, filePath, eol }` as one JSON line, then the LF-normalized text.
#[crate::command]
pub async fn blame_contents(request: Request<'_>) -> AppResult<BlameRuns> {
    let body = request.into_bytes();
    blocking(move || {
        let (args, text) = raw_parts::<BlameArgs>(&body)?;
        let root = Path::new(&args.repo_path);
        // git compares the text with the committed file, so it gets the file's own line endings.
        let info = match args.eol {
            Eol::Lf => blame::blame(root, &args.file_path, None, Some(text))?,
            Eol::Crlf => blame::blame(root, &args.file_path, None, Some(Eol::Crlf.apply(utf8(text)?).as_bytes()))?,
        };
        Ok(info.into_runs())
    })
    .await
}

/// Which HEAD commit and committed file the editor's marks and blame belong to, so a refresh
/// can tell whether they need to run again.
#[crate::command]
pub async fn head_file_version(repo_path: String, file_path: String, orig_path: Option<String>) -> AppResult<HeadVersion> {
    blocking(move || {
        let repo = git_repo::open(&repo_path)?;
        Ok(diff::head_version(&repo, &file_path, orig_path.as_deref()))
    })
    .await
}

/// The file as of HEAD (empty when HEAD does not have it), e.g. to number lines as git does.
#[crate::command]
pub async fn read_head_file(repo_path: String, file_path: String, orig_path: Option<String>) -> AppResult<HeadFile> {
    blocking(move || {
        let repo = git_repo::open(&repo_path)?;
        diff::head_file(&repo, &file_path, orig_path.as_deref())
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::merge::line_diff::MarkKind;
    use crate::test_support::*;

    #[test]
    fn raw_parts_split_the_arguments_from_the_text() {
        let body = b"{\"repoPath\":\"/r\",\"filePath\":\"a.txt\",\"origPath\":null}\nline 1\nline 2";
        let (args, text) = raw_parts::<MarksArgs>(body).unwrap();
        assert_eq!((args.repo_path.as_str(), args.file_path.as_str()), ("/r", "a.txt"));
        assert!(args.orig_path.is_none());
        assert_eq!(text, b"line 1\nline 2");
        assert!(raw_parts::<MarksArgs>(b"no arguments line").is_err());
        assert!(raw_parts::<MarksArgs>(b"{\"repoPath\":1}\ntext").is_err());
    }

    #[test]
    fn marks_compare_the_text_with_head_and_report_the_head_version() {
        let repo = TestRepo::new();
        repo.write("a.txt", "one\ntwo\nthree\n");
        let first = repo.commit_all("First");
        let git = repo.open();

        let marks = marks_for(&git, "a.txt", None, "one\nTWO\nthree\nfour\n").unwrap();
        assert_eq!(marks.head.commit_id.as_deref(), Some(first.as_str()));
        assert!(marks.head.blob_id.is_some());
        let kinds: Vec<(u32, u32, MarkKind)> = marks.marks.iter().map(|mark| (mark.from, mark.to, mark.kind)).collect();
        assert_eq!(kinds, vec![(1, 2, MarkKind::Modified), (3, 4, MarkKind::Added)]);
        assert!(marks_for(&git, "a.txt", None, "one\ntwo\nthree\n").unwrap().marks.is_empty());

        // A new file is all added; HEAD has no object for it.
        let fresh = marks_for(&git, "new.txt", None, "x\n").unwrap();
        assert_eq!(fresh.head.blob_id, None);
        assert_eq!(fresh.marks.len(), 1);
        assert_eq!(fresh.marks[0].kind, MarkKind::Added);
    }

    #[test]
    fn marks_of_a_staged_rename_compare_with_the_old_path() {
        let repo = TestRepo::new();
        repo.write("old.txt", "a\nb\n");
        repo.commit_all("Add");
        repo.git(&["mv", "old.txt", "new.txt"]);
        let marks = marks_for(&repo.open(), "new.txt", Some("old.txt"), "a\nb\nc\n").unwrap();
        let kinds: Vec<MarkKind> = marks.marks.iter().map(|mark| mark.kind).collect();
        assert_eq!(kinds, vec![MarkKind::Added]);
        assert_eq!(marks.marks[0].from, 2);
    }

    #[test]
    fn head_version_changes_with_commits_and_file_content() {
        let repo = TestRepo::new();
        repo.write("a.txt", "one\n");
        repo.write("b.txt", "b\n");
        repo.commit_all("First");
        let before = diff::head_version(&repo.open(), "a.txt", None);
        repo.write("b.txt", "b2\n");
        repo.commit_all("Other file");
        let other = diff::head_version(&repo.open(), "a.txt", None);
        // Another file's commit moves HEAD but keeps this file's object.
        assert_ne!(other.commit_id, before.commit_id);
        assert_eq!(other.blob_id, before.blob_id);
        repo.write("a.txt", "two\n");
        repo.commit_all("This file");
        assert_ne!(diff::head_version(&repo.open(), "a.txt", None).blob_id, before.blob_id);
    }

    #[test]
    fn head_file_reads_committed_text_normalized() {
        let repo = TestRepo::new();
        repo.write("a.txt", "x\r\ny\r\n");
        repo.commit_all("CRLF");
        repo.write("a.txt", "changed\n");
        let head = diff::head_file(&repo.open(), "a.txt", None).unwrap();
        assert_eq!(head.content, "x\ny\n");
        assert!(!head.binary && !head.too_large);
        let missing = diff::head_file(&repo.open(), "nope.txt", None).unwrap();
        assert_eq!(missing.content, "");
        assert_eq!(missing.version.blob_id, None);
    }

    #[test]
    fn blame_runs_cover_the_editor_text() {
        let repo = TestRepo::new();
        repo.write("a.txt", "one\ntwo\n");
        repo.commit_all("First");
        let info = blame::blame(&repo.path, "a.txt", None, Some("one\nnew\ntwo\n".as_bytes())).unwrap();
        let runs = info.into_runs();
        let lengths: u32 = runs.runs.chunks(3).map(|run| run[0]).sum();
        assert_eq!(lengths, 3);
        // committed, uncommitted, committed again (line 2 of the commit).
        assert_eq!(runs.runs.len(), 9);
        let uncommitted: Vec<bool> = runs.runs.chunks(3).map(|run| runs.commits[run[1] as usize].uncommitted).collect();
        assert_eq!(uncommitted, vec![false, true, false]);
        assert_eq!(runs.runs[8], 1);
    }
}
