//! Revert or apply one change of a commit (or between two revisions) in the work tree (Revert
//! and Cherry-Pick Selected Changes. Both sides are read at their revisions (the newer one may be the work tree
//! itself), the patch holds only the selected lines, and `git apply` changes the work tree file alone after a
//! `--check`, so a change that no longer fits the file changes nothing. The index is never touched.

use std::path::Path;

use git2::Repository;

use super::lines::{apply_checked, in_conflict, object_blob, text_of, whole_file, worktree_blob, Blob, LinesOutcome};
use super::{blocking, safe_join};
use crate::error::{AppError, AppResult};
use crate::git::partial::{partial_text, unified_patch, LineSelection};
use crate::git::repo::{self as git_repo, resolve_commit};
use crate::local_history::{self, store::Label};

/// The file at a revision, or None when the revision has no such file.
fn revision_blob(repo: &Repository, revision: &str, file_path: &str) -> AppResult<Option<Blob>> {
    let tree = resolve_commit(repo, revision)?.tree()?;
    match tree.get_path(Path::new(file_path)) {
        Ok(entry) => object_blob(repo, entry.filemode() as u32, entry.id()).map(Some),
        Err(_) => Ok(None),
    }
}

/// The selected lines of the change from `old_revision` (None: the file did not exist, such as a root commit) to
/// `new_revision` (None: the work tree), applied to the work tree file, or taken back out of it with `reverse`.
pub fn run_apply_revision_lines(
    repo_path: &str,
    file_path: &str,
    orig_path: Option<&str>,
    old_revision: Option<&str>,
    new_revision: Option<&str>,
    selection: &LineSelection,
    reverse: bool,
) -> AppResult<LinesOutcome> {
    safe_join(repo_path, file_path)?;
    let orig_path = orig_path.filter(|path| !path.is_empty() && *path != file_path);
    if let Some(orig) = orig_path {
        safe_join(repo_path, orig)?;
    }
    let repo = git_repo::open(repo_path)?;
    if in_conflict(&repo, file_path)? {
        return Err(AppError::invalid("Resolve the conflict in this file first."));
    }
    let old = match old_revision {
        Some(revision) => revision_blob(&repo, revision, orig_path.unwrap_or(file_path))?,
        None => None,
    };
    let new = match new_revision {
        Some(revision) => revision_blob(&repo, revision, file_path)?,
        None => worktree_blob(&repo, file_path)?,
    };
    drop(repo);
    let Some(new) = new else {
        return Err(whole_file("This file was deleted."));
    };
    let new_mode = new.mode;
    let new_text = text_of(new)?;
    let old_missing = old.is_none();
    let old_text = old.map(text_of).transpose()?;
    let old_ref = old_text.as_deref().unwrap_or("");

    // Apply builds its patch on the old side's lines (the work tree does not have the change yet); Revert on the
    // new side's (the work tree has it).
    let partial = partial_text(old_ref, &new_text, selection, !reverse);
    let patched_text = if reverse { new_text.as_str() } else { old_ref };
    if partial.changed_lines == 0 || partial.text == patched_text {
        return Err(AppError::invalid("Select changed lines first."));
    }
    let (patch, args): (String, &[&str]) = if reverse {
        (
            unified_patch(file_path, Some(&partial.text), &new_text, new_mode),
            &["apply", "--reverse"],
        )
    } else {
        let before = if old_missing { None } else { Some(old_ref) };
        (unified_patch(file_path, before, &partial.text, new_mode), &["apply"])
    };
    let root = Path::new(repo_path);
    local_history::snapshot_before(&[root.join(file_path)], Label::BeforeDiscard);
    apply_checked(root, args, &patch).map_err(|_| {
        AppError::invalid("The change does not fit the file in the working tree: those lines were edited since.")
    })?;
    Ok(LinesOutcome {
        lines: partial.changed_lines,
        patch: Some(patch),
    })
}

#[crate::command]
#[allow(clippy::too_many_arguments)]
pub async fn apply_revision_lines(
    repo_path: String,
    file_path: String,
    orig_path: Option<String>,
    old_revision: Option<String>,
    new_revision: Option<String>,
    selection: LineSelection,
    reverse: bool,
) -> AppResult<LinesOutcome> {
    blocking(move || {
        run_apply_revision_lines(
            &repo_path,
            &file_path,
            orig_path.as_deref(),
            old_revision.as_deref(),
            new_revision.as_deref(),
            &selection,
            reverse,
        )
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::lines::run_restore_lines;
    use crate::test_support::TestRepo;

    fn lines(old: &[[u32; 2]], new: &[[u32; 2]]) -> LineSelection {
        LineSelection {
            old_lines: old.to_vec(),
            new_lines: new.to_vec(),
        }
    }

    /// A commit that changes two separate lines, on top of a base.
    fn commit_with_two_changes() -> (TestRepo, String) {
        let repo = TestRepo::new();
        repo.write("f.txt", "one\ntwo\nthree\nfour\nfive\nsix\nseven\neight\n");
        repo.commit_all("base");
        repo.write("f.txt", "one\nTWO\nthree\nfour\nfive\nsix\nseven\nEIGHT\n");
        let commit = repo.commit_all("change");
        (repo, commit)
    }

    fn change(
        repo: &TestRepo,
        commit: &str,
        selection: &LineSelection,
        reverse: bool,
    ) -> AppResult<LinesOutcome> {
        let parent = format!("{commit}^");
        run_apply_revision_lines(
            &repo.path_string(),
            "f.txt",
            None,
            Some(&parent),
            Some(commit),
            selection,
            reverse,
        )
    }

    #[test]
    fn reverting_a_commit_change_takes_only_it_out_of_the_work_tree_and_undo_puts_it_back() {
        let (repo, commit) = commit_with_two_changes();
        let outcome = change(&repo, &commit, &lines(&[[1, 2]], &[[1, 2]]), true).unwrap();
        assert_eq!(outcome.lines, 2);
        assert_eq!(repo.read_text("f.txt"), "one\ntwo\nthree\nfour\nfive\nsix\nseven\nEIGHT\n");
        assert_eq!(repo.git(&["diff", "--cached", "--name-only"]).trim(), "", "the index stays");
        run_restore_lines(&repo.path_string(), &outcome.patch.unwrap(), false).unwrap();
        assert_eq!(repo.read_text("f.txt"), "one\nTWO\nthree\nfour\nfive\nsix\nseven\nEIGHT\n");
    }

    #[test]
    fn applying_a_commit_change_brings_only_it_into_the_work_tree_and_undo_takes_it_out() {
        let (repo, commit) = commit_with_two_changes();
        repo.git(&["checkout", "-q", "HEAD^"]);
        let outcome = change(&repo, &commit, &lines(&[[7, 8]], &[[7, 8]]), false).unwrap();
        assert_eq!(repo.read_text("f.txt"), "one\ntwo\nthree\nfour\nfive\nsix\nseven\nEIGHT\n");
        run_restore_lines(&repo.path_string(), &outcome.patch.unwrap(), true).unwrap();
        assert_eq!(repo.read_text("f.txt"), "one\ntwo\nthree\nfour\nfive\nsix\nseven\neight\n");
    }

    #[test]
    fn a_change_that_no_longer_fits_changes_nothing() {
        let (repo, commit) = commit_with_two_changes();
        repo.write("f.txt", "one\nTwo again\nthree\nfour\nfive\nsix\nseven\nEIGHT\n");
        let error = change(&repo, &commit, &lines(&[[1, 2]], &[[1, 2]]), true).unwrap_err();
        assert!(error.to_string().contains("does not fit"), "{error}");
        assert_eq!(repo.read_text("f.txt"), "one\nTwo again\nthree\nfour\nfive\nsix\nseven\nEIGHT\n");
    }

    #[test]
    fn a_revision_against_the_work_tree_reverts_like_the_changes_tab() {
        let repo = TestRepo::new();
        repo.write("f.txt", "a\nb\nc\n");
        repo.commit_all("base");
        repo.write("f.txt", "a\nB\nc\n");
        let selection = lines(&[[1, 2]], &[[1, 2]]);
        run_apply_revision_lines(&repo.path_string(), "f.txt", None, Some("HEAD"), None, &selection, true).unwrap();
        assert_eq!(repo.read_text("f.txt"), "a\nb\nc\n");
    }

    #[test]
    fn reverting_against_head_leaves_a_staged_version_in_the_index() {
        let repo = TestRepo::new();
        repo.write("f.txt", "a\nb\nc\n");
        repo.commit_all("base");
        repo.write("f.txt", "a\nB\nc\n");
        repo.git(&["add", "f.txt"]);
        let selection = lines(&[[1, 2]], &[[1, 2]]);
        run_apply_revision_lines(&repo.path_string(), "f.txt", None, Some("HEAD"), None, &selection, true).unwrap();
        assert_eq!(repo.read_text("f.txt"), "a\nb\nc\n");
        assert_eq!(repo.git(&["show", ":f.txt"]), "a\nB\nc\n", "the staged version stays");
    }

    #[test]
    fn a_file_added_by_the_commit_is_created_by_apply() {
        let repo = TestRepo::new();
        repo.write("base.txt", "base\n");
        repo.commit_all("base");
        repo.write("new.txt", "x\ny\n");
        let commit = repo.commit_all("add");
        repo.git(&["checkout", "-q", "HEAD^"]);
        let parent = format!("{commit}^");
        let selection = lines(&[], &[[0, 2]]);
        run_apply_revision_lines(&repo.path_string(), "new.txt", None, Some(&parent), Some(&commit), &selection, false)
            .unwrap();
        assert_eq!(repo.read_text("new.txt"), "x\ny\n");
    }

    #[test]
    fn unknown_revisions_and_empty_selections_are_refused() {
        let (repo, commit) = commit_with_two_changes();
        let path = repo.path_string();
        let none = lines(&[], &[]);
        assert!(change(&repo, &commit, &none, true).is_err());
        let selection = lines(&[[1, 2]], &[[1, 2]]);
        let unknown = run_apply_revision_lines(&path, "f.txt", None, Some("nope"), Some(&commit), &selection, true);
        assert!(unknown.is_err());
        assert!(run_apply_revision_lines(&path, "../f.txt", None, None, None, &selection, true).is_err());
    }
}
