use std::path::Path;

use serde::Serialize;

use super::{blocking, reject_option, run_op, safe_join, OpOutcome};
use crate::error::{AppError, AppResult};
use crate::git::blame::{self, BlameRuns};
use crate::git::cli;
use crate::git::diff::{self, FileDiff, RevisionDiff};
use crate::git::history::{self as file_log, FileHistoryEntry, LineHistoryEntry};
use crate::git::log::{self, CommitDetails, CommitSummary};
use crate::git::repo as git_repo;

/// A reload asks for everything it shows in one call (the Log keeps up to 3000 rows),
/// since every topological page walks the whole history first.
const MAX_PAGE: usize = 5000;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogPage {
    /// Fingerprint of the branch tips the page was read at (`log::tips`).
    pub tips: String,
    /// None when `known_tips` still matched: nothing in the log changed, so nothing was walked.
    pub commits: Option<Vec<CommitSummary>>,
}

#[crate::command]
pub async fn get_log(
    repo_path: String,
    offset: usize,
    limit: usize,
    all_refs: bool,
    known_tips: Option<String>,
) -> AppResult<LogPage> {
    blocking(move || {
        let repo = git_repo::open(&repo_path)?;
        // Taken before the walk: a ref moving meanwhile only costs one more reload.
        let tips = log::tips(&repo, all_refs);
        if known_tips.as_deref() == Some(tips.as_str()) {
            return Ok(LogPage { tips, commits: None });
        }
        let commits = log::page(&repo, offset, limit.min(MAX_PAGE), all_refs)?;
        Ok(LogPage { tips, commits: Some(commits) })
    })
    .await
}

#[crate::command]
pub async fn get_commit_details(repo_path: String, commit_id: String) -> AppResult<CommitDetails> {
    blocking(move || log::details(&git_repo::open(&repo_path)?, &commit_id)).await
}

#[crate::command]
pub async fn get_commit_file_diff(
    repo_path: String,
    commit_id: String,
    file_path: String,
    orig_path: Option<String>,
    parent_index: Option<usize>,
) -> AppResult<FileDiff> {
    blocking(move || {
        let repo = git_repo::open(&repo_path)?;
        diff::commit_file(&repo, &commit_id, &file_path, orig_path.as_deref(), parent_index.unwrap_or_default())
    })
    .await
}

/// Blames a file at `revision`, or the file on disk when None. The editor blames its own
/// text with `editor::blame_contents`.
#[crate::command]
pub async fn blame_file(repo_path: String, file_path: String, revision: Option<String>) -> AppResult<BlameRuns> {
    blocking(move || Ok(blame::blame(Path::new(&repo_path), &file_path, revision.as_deref(), None)?.into_runs())).await
}

#[crate::command]
pub async fn cherry_pick(repo_path: String, commit_id: String) -> AppResult<OpOutcome> {
    blocking(move || run_op(&repo_path, &["cherry-pick", &commit_id])).await
}

#[crate::command]
pub async fn revert_commit(repo_path: String, commit_id: String) -> AppResult<OpOutcome> {
    blocking(move || run_op(&repo_path, &["revert", "--no-edit", &commit_id])).await
}

fn run_reset(repo_path: &str, revision: &str, mode: &str) -> AppResult<()> {
    let flag = match mode {
        "soft" => "--soft",
        "mixed" => "--mixed",
        "hard" => "--hard",
        "keep" => "--keep",
        _ => return Err(AppError::invalid(format!("Unknown reset mode: {mode}"))),
    };
    let revision = revision.trim();
    reject_option(revision, "A revision")?;
    if revision.is_empty() {
        return Err(AppError::invalid("Enter a revision to reset to"));
    }
    // The trailing "--" keeps a revision that looks like a file from being read as one.
    cli::run(Path::new(repo_path), &["reset", flag, revision, "--"])?;
    Ok(())
}

/// `git reset` of the current branch to any revision: soft, mixed, hard or keep.
#[crate::command]
pub async fn reset_to(repo_path: String, commit_id: String, mode: String) -> AppResult<()> {
    blocking(move || run_reset(&repo_path, &commit_id, &mode)).await
}

fn run_resolve(repo_path: &str, revision: &str) -> AppResult<String> {
    let repo = git_repo::open(repo_path)?;
    let commit_id = git_repo::resolve_commit(&repo, revision)?.id().to_string();
    Ok(commit_id)
}

#[crate::command]
pub async fn resolve_revision(repo_path: String, revision: String) -> AppResult<String> {
    blocking(move || run_resolve(&repo_path, &revision)).await
}

#[crate::command]
pub async fn file_history(
    repo_path: String,
    file_path: String,
    offset: usize,
    limit: usize,
) -> AppResult<Vec<FileHistoryEntry>> {
    blocking(move || {
        safe_join(&repo_path, &file_path)?;
        file_log::file_history(Path::new(&repo_path), &file_path, offset, limit)
    })
    .await
}

#[crate::command]
pub async fn line_history(
    repo_path: String,
    file_path: String,
    start_line: usize,
    end_line: usize,
    limit: usize,
) -> AppResult<Vec<LineHistoryEntry>> {
    blocking(move || {
        safe_join(&repo_path, &file_path)?;
        file_log::line_history(Path::new(&repo_path), &file_path, start_line, end_line, limit)
    })
    .await
}

fn run_compare(repo_path: &str, file_path: &str, orig_path: Option<&str>, revision: &str) -> AppResult<RevisionDiff> {
    safe_join(repo_path, file_path)?;
    if let Some(orig_path) = orig_path {
        safe_join(repo_path, orig_path)?;
    }
    diff::against_revision(&git_repo::open(repo_path)?, file_path, orig_path, revision)
}

/// The file at `revision` against its work tree copy (Compare with Revision / Branch, the
/// Changes tab). `orig_path` is the old name of a renamed file.
#[crate::command]
pub async fn compare_with_revision(
    repo_path: String,
    file_path: String,
    revision: String,
    orig_path: Option<String>,
) -> AppResult<RevisionDiff> {
    blocking(move || run_compare(&repo_path, &file_path, orig_path.as_deref(), &revision)).await
}

#[crate::command]
pub async fn checkout_commit(repo_path: String, commit_id: String) -> AppResult<()> {
    blocking(move || {
        cli::run(Path::new(&repo_path), &["switch", "--detach", &commit_id])?;
        Ok(())
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::{image_bytes, TestRepo};

    #[test]
    fn reset_keep_moves_the_branch_and_keeps_local_changes() {
        let repo = TestRepo::new();
        repo.write("a.txt", "one\n");
        let first = repo.commit_all("one");
        repo.write("b.txt", "two\n");
        repo.commit_all("two");
        repo.write("a.txt", "local edit\n");
        run_reset(&repo.path_string(), &first, "keep").unwrap();
        assert_eq!(repo.head(), first);
        assert_eq!(repo.read_text("a.txt"), "local edit\n");
        assert!(!repo.exists("b.txt"));

        assert!(matches!(run_reset(&repo.path_string(), "--hard", "soft"), Err(AppError::Invalid(_))));
        assert!(matches!(run_reset(&repo.path_string(), "HEAD", "merge"), Err(AppError::Invalid(_))));
        run_reset(&repo.path_string(), "HEAD", "hard").unwrap();
        assert_eq!(repo.read_text("a.txt"), "one\n");
    }

    #[test]
    fn resolve_revision_finds_branches_tags_and_hashes() {
        let repo = TestRepo::new();
        repo.write("a.txt", "one\n");
        let head = repo.commit_all("one");
        repo.git(&["tag", "v1"]);
        let repo_path = repo.path_string();
        assert_eq!(run_resolve(&repo_path, "HEAD").unwrap(), head);
        assert_eq!(run_resolve(&repo_path, "main").unwrap(), head);
        assert_eq!(run_resolve(&repo_path, "v1").unwrap(), head);
        assert_eq!(run_resolve(&repo_path, &head[..8]).unwrap(), head);
        let unknown = run_resolve(&repo_path, "nope").unwrap_err();
        assert_eq!(unknown.to_string(), "Unknown revision: nope");
    }

    #[test]
    fn file_history_follows_renames_page_by_page() {
        let repo = TestRepo::new();
        repo.write("old name.txt", "one\n");
        repo.commit_all("add");
        repo.write("other.txt", "other\n");
        repo.commit_all("unrelated");
        std::fs::create_dir_all(repo.file("dir")).unwrap();
        repo.git(&["mv", "old name.txt", "dir/new.txt"]);
        repo.commit_all("rename");
        repo.write("dir/new.txt", "one\ntwo\n");
        repo.commit_all("edit");

        let all = file_log::file_history(&repo.path, "dir/new.txt", 0, 50).unwrap();
        let summary: Vec<(&str, &str, &str)> = all
            .iter()
            .map(|entry| (entry.commit.summary.as_str(), entry.status.as_str(), entry.path.as_str()))
            .collect();
        assert_eq!(
            summary,
            [
                ("edit", "modified", "dir/new.txt"),
                ("rename", "renamed", "dir/new.txt"),
                ("add", "added", "old name.txt"),
            ]
        );
        assert_eq!(all[1].orig_path.as_deref(), Some("old name.txt"));
        assert_eq!(all[0].commit.id, repo.head());
        assert_eq!(all[0].commit.parents.len(), 1);
        assert_eq!(all[0].commit.author_name, "Test User");

        let second_page = file_log::file_history(&repo.path, "dir/new.txt", 1, 1).unwrap();
        assert_eq!(second_page.len(), 1);
        assert_eq!(second_page[0].commit.summary, "rename");
        assert!(file_log::file_history(&repo.path, "dir/new.txt", 3, 10).unwrap().is_empty());
    }

    #[test]
    fn line_history_traces_a_range() {
        let repo = TestRepo::new();
        repo.write("f.txt", "a\nb\nc\n");
        repo.commit_all("add");
        repo.write("f.txt", "a\nB\nc\n");
        repo.commit_all("change b");
        repo.write("f.txt", "a\nB\nc\nd\n");
        repo.commit_all("append d");

        let entries = file_log::line_history(&repo.path, "f.txt", 2, 2, 50).unwrap();
        let subjects: Vec<&str> = entries.iter().map(|entry| entry.commit.summary.as_str()).collect();
        assert_eq!(subjects, ["change b", "add"]);
        assert!(entries[0].patch.contains("-b\n+B"));
        assert!(!entries[0].truncated);

        assert!(matches!(
            file_log::line_history(&repo.path, "f.txt", 3, 2, 50),
            Err(AppError::Invalid(_))
        ));
        let missing = file_log::line_history(&repo.path, "nope.txt", 1, 1, 50).unwrap_err();
        assert!(missing.to_string().contains("nope.txt"));
    }

    #[test]
    fn compare_with_revision_reads_the_old_version() {
        let repo = TestRepo::new();
        repo.write("f.txt", "old\n");
        let first = repo.commit_all("one");
        repo.write("f.txt", "new\n");
        repo.commit_all("two");
        repo.write("f.txt", "work\n");
        repo.write("later.txt", "later\n");
        repo.write("image.bin", image_bytes(&[1, 2]));
        repo.commit_all("three");
        let repo_path = repo.path_string();

        let compared = run_compare(&repo_path, "f.txt", None, &first).unwrap();
        assert!(compared.exists_in_revision);
        assert_eq!(compared.commit_id, first);
        assert_eq!(compared.diff.original, "old\n");
        assert_eq!(compared.diff.modified, "work\n");

        let missing = run_compare(&repo_path, "later.txt", None, "HEAD~2").unwrap();
        assert!(!missing.exists_in_revision);
        assert_eq!(missing.diff.original, "");
        assert_eq!(missing.diff.modified, "later\n");

        let binary = run_compare(&repo_path, "image.bin", None, "main").unwrap();
        assert!(binary.diff.binary);
        assert!(run_compare(&repo_path, "../f.txt", None, "HEAD").is_err());
        assert!(run_compare(&repo_path, "f.txt", None, "-x").is_err());
    }

    #[test]
    fn compare_with_revision_reads_a_renamed_file_by_its_old_name() {
        let repo = TestRepo::new();
        repo.write("old.txt", "one\ntwo\n");
        repo.commit_all("one");
        repo.git(&["mv", "old.txt", "new.txt"]);
        repo.write("new.txt", "one\ntwo\nthree\n");
        let repo_path = repo.path_string();

        let renamed = run_compare(&repo_path, "new.txt", Some("old.txt"), "HEAD").unwrap();
        assert!(renamed.exists_in_revision);
        assert_eq!(renamed.diff.original, "one\ntwo\n");
        assert_eq!(renamed.diff.modified, "one\ntwo\nthree\n");

        let without_old_name = run_compare(&repo_path, "new.txt", None, "HEAD").unwrap();
        assert!(!without_old_name.exists_in_revision);
        assert!(run_compare(&repo_path, "new.txt", Some("../old.txt"), "HEAD").is_err());
    }
}
