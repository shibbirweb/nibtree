//! Stage, unstage or discard the lines selected in a diff (partial staging). The sides are read with git2, the patch is built in
//! `git::partial`, and git applies it from stdin after a `--check`, so the index or the
//! work tree is never left half changed.

use std::path::Path;

use git2::Repository;
use serde::{Deserialize, Serialize};

use super::{blocking, safe_join};
use crate::error::{AppError, AppResult};
use crate::git::cli;
use crate::git::diff::{working_file_version, DiffArea};
use crate::git::lfs;
use crate::git::partial::{partial_text, unified_patch, LineSelection};
use crate::git::repo::{self as git_repo, bytes_to_text, workdir};
use crate::local_history::{self, store::Label};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum LineAction {
    /// Unstaged diff: the selected lines go into the index.
    Stage,
    /// Staged diff: the selected lines leave the index.
    Unstage,
    /// Unstaged diff: the selected lines in the work tree go back to the index version.
    Discard,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LinesOutcome {
    /// How many changed lines moved.
    pub lines: usize,
    /// Discard only: the patch that was taken back, so Undo can apply it again.
    pub patch: Option<String>,
}

const REGULAR_MODE: u32 = 0o100644;
#[cfg(unix)]
const EXECUTABLE_MODE: u32 = 0o100755;
const SYMLINK_MODE: u32 = 0o120000;
const GITLINK_MODE: u32 = 0o160000;
/// Like the diff view: larger files show no text diff, so no lines can be picked.
const MAX_BYTES: usize = 4 * 1024 * 1024;

pub(super) struct Blob {
    pub(super) mode: u32,
    pub(super) bytes: Vec<u8>,
}

pub(super) fn object_blob(repo: &Repository, mode: u32, oid: git2::Oid) -> AppResult<Blob> {
    if mode == GITLINK_MODE {
        return Ok(Blob { mode, bytes: Vec::new() });
    }
    Ok(Blob {
        mode,
        bytes: repo.find_blob(oid)?.content().to_vec(),
    })
}

fn head_blob(repo: &Repository, file_path: &str) -> AppResult<Option<Blob>> {
    let Some(tree) = repo.head().ok().and_then(|head| head.peel_to_tree().ok()) else {
        return Ok(None);
    };
    match tree.get_path(Path::new(file_path)) {
        Ok(entry) => object_blob(repo, entry.filemode() as u32, entry.id()).map(Some),
        Err(_) => Ok(None),
    }
}

fn index_blob(repo: &Repository, file_path: &str) -> AppResult<Option<Blob>> {
    match repo.index()?.get_path(Path::new(file_path), 0) {
        Some(entry) => object_blob(repo, entry.mode, entry.id).map(Some),
        None => Ok(None),
    }
}

#[cfg(unix)]
fn file_mode(meta: &std::fs::Metadata) -> u32 {
    use std::os::unix::fs::PermissionsExt;
    if meta.permissions().mode() & 0o111 != 0 {
        EXECUTABLE_MODE
    } else {
        REGULAR_MODE
    }
}

#[cfg(not(unix))]
fn file_mode(_meta: &std::fs::Metadata) -> u32 {
    REGULAR_MODE
}

pub(super) fn worktree_blob(repo: &Repository, file_path: &str) -> AppResult<Option<Blob>> {
    let full = workdir(repo)?.join(file_path);
    let Ok(meta) = std::fs::symlink_metadata(&full) else {
        return Ok(None);
    };
    if meta.file_type().is_symlink() {
        return Ok(Some(Blob {
            mode: SYMLINK_MODE,
            bytes: Vec::new(),
        }));
    }
    if meta.is_dir() {
        return Ok(Some(Blob {
            mode: GITLINK_MODE,
            bytes: Vec::new(),
        }));
    }
    Ok(Some(Blob {
        mode: file_mode(&meta),
        bytes: std::fs::read(&full)?,
    }))
}

pub(super) fn whole_file(reason: &str) -> AppError {
    AppError::invalid(format!("{reason} Use the whole file instead."))
}

/// The side as text, or why its lines cannot be picked.
pub(super) fn text_of(blob: Blob) -> AppResult<String> {
    match blob.mode {
        SYMLINK_MODE => return Err(whole_file("This is a symbolic link.")),
        GITLINK_MODE => return Err(whole_file("This is a submodule.")),
        _ => {}
    }
    if blob.bytes.len() > MAX_BYTES {
        return Err(whole_file("This file is too large for line staging."));
    }
    if lfs::parse_pointer(&blob.bytes).is_some() {
        return Err(whole_file("This file is stored in Git LFS."));
    }
    bytes_to_text(blob.bytes).ok_or_else(|| whole_file("This is a binary file."))
}

pub(super) fn in_conflict(repo: &Repository, file_path: &str) -> AppResult<bool> {
    let index = repo.index()?;
    Ok((1..=3).any(|stage| index.get_path(Path::new(file_path), stage).is_some()))
}

/// `git apply <args> --check` first, then the same for real: a patch that does not fit
/// changes nothing.
pub(super) fn apply_checked(root: &Path, args: &[&str], patch: &str) -> AppResult<()> {
    // Explicit, so apply.whitespace=error never refuses a line the user wrote.
    let mut check = args.to_vec();
    check.extend(["--check", "--whitespace=nowarn", "-"]);
    let checked = cli::run_raw(root, &check, Some(patch.as_bytes()))?;
    if !checked.success {
        return Err(AppError::Command {
            message: format!("The selected lines do not apply: {}", checked.text()),
        });
    }
    let mut apply = args.to_vec();
    apply.extend(["--whitespace=nowarn", "-"]);
    cli::run_with_stdin(root, &apply, patch.as_bytes())?;
    Ok(())
}

pub fn run_apply_lines(
    repo_path: &str,
    file_path: &str,
    orig_path: Option<&str>,
    action: LineAction,
    selection: &LineSelection,
    known_version: Option<&str>,
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
    let area = match action {
        LineAction::Unstage => DiffArea::Staged,
        LineAction::Stage | LineAction::Discard => DiffArea::Unstaged,
    };
    let takes_back = action == LineAction::Discard;
    // The selection names lines of the diff on screen; refuse it for any other version.
    if let Some(known) = known_version {
        if working_file_version(&repo, file_path, orig_path, area)? != known {
            return Err(AppError::invalid("The file changed after the diff was shown. Check the diff and try again."));
        }
    }
    let (old, new) = match action {
        LineAction::Stage | LineAction::Discard => (index_blob(&repo, file_path)?, worktree_blob(&repo, file_path)?),
        LineAction::Unstage => (head_blob(&repo, orig_path.unwrap_or(file_path))?, index_blob(&repo, file_path)?),
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

    let patched_is_old = action == LineAction::Stage;
    let partial = partial_text(old_ref, &new_text, selection, patched_is_old);
    let patched_text = if patched_is_old { old_ref } else { new_text.as_str() };
    if partial.changed_lines == 0 || partial.text == patched_text {
        return Err(AppError::invalid("Select changed lines first."));
    }

    let root = Path::new(repo_path);
    let (patch, args): (String, &[&str]) = match action {
        LineAction::Stage => (
            unified_patch(file_path, old_text.as_deref(), &partial.text, new_mode),
            &["apply", "--cached"],
        ),
        LineAction::Unstage => {
            // Every line of a newly added file: take the file out of the index again.
            let before = if old_missing && partial.text.is_empty() {
                None
            } else {
                Some(partial.text.as_str())
            };
            (unified_patch(file_path, before, &new_text, new_mode), &["apply", "--cached", "--reverse"])
        }
        LineAction::Discard => (
            unified_patch(file_path, Some(&partial.text), &new_text, new_mode),
            &["apply", "--reverse"],
        ),
    };
    if takes_back {
        local_history::snapshot_before(&[root.join(file_path)], Label::BeforeDiscard);
    }
    apply_checked(root, args, &patch)?;
    Ok(LinesOutcome {
        lines: partial.changed_lines,
        patch: takes_back.then_some(patch),
    })
}

/// Undo of Discard Selected Lines (and of a reverted change): applies the taken back patch to the work tree again.
/// `reverse` undoes an applied change instead, by taking its patch back out.
pub fn run_restore_lines(repo_path: &str, patch: &str, reverse: bool) -> AppResult<()> {
    if patch.trim().is_empty() {
        return Err(AppError::invalid("There is nothing to restore."));
    }
    let args: &[&str] = if reverse { &["apply", "--reverse"] } else { &["apply"] };
    apply_checked(Path::new(repo_path), args, patch).map_err(|_| {
        AppError::invalid("The lines cannot be restored: the file changed after they were discarded.")
    })
}

#[crate::command]
pub async fn apply_selected_lines(
    repo_path: String,
    file_path: String,
    orig_path: Option<String>,
    action: LineAction,
    selection: LineSelection,
    known_version: Option<String>,
) -> AppResult<LinesOutcome> {
    blocking(move || {
        run_apply_lines(
            &repo_path,
            &file_path,
            orig_path.as_deref(),
            action,
            &selection,
            known_version.as_deref(),
        )
    })
    .await
}

#[crate::command]
pub async fn restore_discarded_lines(repo_path: String, patch: String, reverse: Option<bool>) -> AppResult<()> {
    blocking(move || run_restore_lines(&repo_path, &patch, reverse.unwrap_or_default())).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::TestRepo;

    fn lines(old: &[[u32; 2]], new: &[[u32; 2]]) -> LineSelection {
        LineSelection {
            old_lines: old.to_vec(),
            new_lines: new.to_vec(),
        }
    }

    fn apply(repo: &TestRepo, file_path: &str, action: LineAction, selection: &LineSelection) -> AppResult<LinesOutcome> {
        run_apply_lines(&repo.path_string(), file_path, None, action, selection, None)
    }

    /// A committed file with two separate changes in the work tree.
    fn two_changes() -> TestRepo {
        let repo = TestRepo::new();
        repo.write("f.txt", "one\ntwo\nthree\nfour\nfive\nsix\nseven\neight\nnine\nten\n");
        repo.commit_all("base");
        repo.write("f.txt", "one\nTWO\nthree\nfour\nfive\nsix\nseven\neight\nnine\nTEN\neleven\n");
        repo
    }

    #[test]
    fn stage_selected_lines_puts_only_them_in_the_index() {
        let repo = two_changes();
        let outcome = apply(&repo, "f.txt", LineAction::Stage, &lines(&[[1, 2]], &[[1, 2]])).unwrap();
        assert_eq!(outcome.lines, 2);
        assert!(outcome.patch.is_none());
        assert_eq!(repo.index_text("f.txt"), "one\nTWO\nthree\nfour\nfive\nsix\nseven\neight\nnine\nten\n");
        assert_eq!(
            repo.read_text("f.txt"),
            "one\nTWO\nthree\nfour\nfive\nsix\nseven\neight\nnine\nTEN\neleven\n",
            "the work tree is untouched"
        );
        // The second change now: its line numbers are the index's (old) and the work tree's (new).
        apply(&repo, "f.txt", LineAction::Stage, &lines(&[], &[[10, 11]])).unwrap();
        assert_eq!(repo.index_text("f.txt"), "one\nTWO\nthree\nfour\nfive\nsix\nseven\neight\nnine\nten\neleven\n");
    }

    #[test]
    fn a_selection_across_hunks_stages_both_parts() {
        let repo = two_changes();
        apply(&repo, "f.txt", LineAction::Stage, &lines(&[[1, 10]], &[[1, 10]])).unwrap();
        assert_eq!(repo.index_text("f.txt"), "one\nTWO\nthree\nfour\nfive\nsix\nseven\neight\nnine\nTEN\n");
    }

    #[test]
    fn unstage_selected_lines_takes_only_them_out_of_the_index() {
        let repo = two_changes();
        repo.git(&["add", "f.txt"]);
        // Staged diff: HEAD (old) against the index (new). Unstage the added "eleven".
        apply(&repo, "f.txt", LineAction::Unstage, &lines(&[], &[[10, 11]])).unwrap();
        assert_eq!(repo.index_text("f.txt"), "one\nTWO\nthree\nfour\nfive\nsix\nseven\neight\nnine\nTEN\n");
        // And the first replacement: both of its lines.
        apply(&repo, "f.txt", LineAction::Unstage, &lines(&[[1, 2]], &[[1, 2]])).unwrap();
        assert_eq!(repo.index_text("f.txt"), "one\ntwo\nthree\nfour\nfive\nsix\nseven\neight\nnine\nTEN\n");
        assert_eq!(
            repo.read_text("f.txt"),
            "one\nTWO\nthree\nfour\nfive\nsix\nseven\neight\nnine\nTEN\neleven\n"
        );
    }

    #[test]
    fn discard_selected_lines_restores_them_and_undo_brings_them_back() {
        let repo = two_changes();
        let before = repo.read_text("f.txt");
        let outcome = apply(&repo, "f.txt", LineAction::Discard, &lines(&[[9, 10]], &[[9, 11]])).unwrap();
        assert_eq!(outcome.lines, 3);
        assert_eq!(repo.read_text("f.txt"), "one\nTWO\nthree\nfour\nfive\nsix\nseven\neight\nnine\nten\n");
        assert_eq!(repo.git(&["diff", "--cached", "--name-only"]).trim(), "", "nothing is staged");

        let patch = outcome.patch.unwrap();
        run_restore_lines(&repo.path_string(), &patch, false).unwrap();
        assert_eq!(repo.read_text("f.txt"), before);
        // A second undo no longer fits and changes nothing.
        assert!(run_restore_lines(&repo.path_string(), &patch, false).is_err());
        assert_eq!(repo.read_text("f.txt"), before);
    }

    #[test]
    fn files_without_a_final_newline() {
        let repo = TestRepo::new();
        repo.write("f.txt", "a\nb");
        repo.commit_all("base");
        repo.write("f.txt", "a\nB\nc");
        // Stage the replacement of the last line only, not the added "c".
        apply(&repo, "f.txt", LineAction::Stage, &lines(&[[1, 2]], &[[1, 2]])).unwrap();
        // B takes the place of the last line, which had no newline.
        assert_eq!(repo.index_text("f.txt"), "a\nB");
        // Then the rest.
        apply(&repo, "f.txt", LineAction::Stage, &lines(&[[0, 9]], &[[0, 9]])).unwrap();
        assert_eq!(repo.index_text("f.txt"), "a\nB\nc");

        repo.commit_all("second");
        repo.write("f.txt", "a\nB\nc\n");
        apply(&repo, "f.txt", LineAction::Discard, &lines(&[[2, 3]], &[[2, 4]])).unwrap();
        assert_eq!(repo.read_text("f.txt"), "a\nB\nc");
    }

    #[test]
    fn crlf_files_keep_their_line_endings() {
        let repo = TestRepo::new();
        repo.write("w.txt", "one\r\ntwo\r\nthree\r\n");
        repo.commit_all("base");
        repo.write("w.txt", "one\r\nTWO\r\nthree\r\nfour\r\n");
        apply(&repo, "w.txt", LineAction::Stage, &lines(&[], &[[3, 4]])).unwrap();
        assert_eq!(repo.index_bytes("w.txt"), b"one\r\ntwo\r\nthree\r\nfour\r\n");
        apply(&repo, "w.txt", LineAction::Discard, &lines(&[[1, 2]], &[[1, 2]])).unwrap();
        assert_eq!(repo.read("w.txt"), b"one\r\ntwo\r\nthree\r\nfour\r\n");
    }

    #[test]
    fn autocrlf_work_trees_stage_lf_lines() {
        let repo = TestRepo::new();
        repo.git(&["config", "core.autocrlf", "true"]);
        repo.write("w.txt", "one\ntwo\n");
        repo.commit_all("base");
        repo.write("w.txt", "one\r\ntwo\r\nthree\r\nfour\r\n");
        apply(&repo, "w.txt", LineAction::Stage, &lines(&[], &[[2, 3]])).unwrap();
        assert_eq!(repo.index_bytes("w.txt"), b"one\ntwo\nthree\n");
    }

    #[test]
    fn selected_lines_of_a_new_file_add_it_with_only_those_lines() {
        let repo = TestRepo::new();
        repo.write("base.txt", "base\n");
        repo.commit_all("base");
        repo.write("new.sh", "#!/bin/sh\necho one\necho two\n");
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(repo.file("new.sh"), std::fs::Permissions::from_mode(0o755)).unwrap();
        }
        apply(&repo, "new.sh", LineAction::Stage, &lines(&[], &[[0, 2]])).unwrap();
        assert_eq!(repo.index_text("new.sh"), "#!/bin/sh\necho one\n");
        #[cfg(unix)]
        assert!(repo.index_entry("new.sh").starts_with("100755 "), "{}", repo.index_entry("new.sh"));
        assert_eq!(repo.read_text("new.sh"), "#!/bin/sh\necho one\necho two\n");

        // Unstaging every line of the added file takes it out of the index again.
        apply(&repo, "new.sh", LineAction::Unstage, &lines(&[], &[[0, 9]])).unwrap();
        assert_eq!(repo.index_entry("new.sh"), "");
        assert!(repo.porcelain().contains("?? new.sh"), "{}", repo.porcelain());
    }

    #[test]
    fn unstaging_some_lines_of_an_added_file_keeps_the_rest() {
        let repo = TestRepo::new();
        repo.write("base.txt", "base\n");
        repo.commit_all("base");
        repo.write("n.txt", "a\nb\nc\n");
        repo.git(&["add", "n.txt"]);
        apply(&repo, "n.txt", LineAction::Unstage, &lines(&[], &[[1, 2]])).unwrap();
        assert_eq!(repo.index_text("n.txt"), "a\nc\n");
    }

    #[test]
    fn intent_to_add_files_stage_selected_lines() {
        let repo = TestRepo::new();
        repo.write("base.txt", "base\n");
        repo.commit_all("base");
        repo.write("n.txt", "a\nb\n");
        repo.git(&["add", "-N", "n.txt"]);
        apply(&repo, "n.txt", LineAction::Stage, &lines(&[], &[[1, 2]])).unwrap();
        assert_eq!(repo.index_text("n.txt"), "b\n");
    }

    #[test]
    fn discarding_lines_of_an_untracked_file_edits_it_in_place() {
        let repo = TestRepo::new();
        repo.write("base.txt", "base\n");
        repo.commit_all("base");
        repo.write("u.txt", "keep\ndrop\n");
        apply(&repo, "u.txt", LineAction::Discard, &lines(&[], &[[1, 2]])).unwrap();
        assert_eq!(repo.read_text("u.txt"), "keep\n");
        assert_eq!(repo.index_entry("u.txt"), "", "still untracked");
    }

    #[test]
    fn deleted_binary_and_conflicted_files_are_refused() {
        let repo = TestRepo::new();
        repo.write("gone.txt", "a\nb\n");
        repo.write("image.bin", [0u8, 1, 2, 3, 0, 5]);
        repo.commit_all("base");
        repo.remove("gone.txt");
        let all = lines(&[[0, 9]], &[[0, 9]]);
        for action in [LineAction::Stage, LineAction::Discard] {
            let error = apply(&repo, "gone.txt", action, &all).unwrap_err();
            assert_eq!(error.to_string(), "This file was deleted. Use the whole file instead.");
        }
        repo.git(&["rm", "-q", "--cached", "gone.txt"]);
        let error = apply(&repo, "gone.txt", LineAction::Unstage, &all).unwrap_err();
        assert_eq!(error.to_string(), "This file was deleted. Use the whole file instead.");
        assert!(repo.porcelain().contains("D  gone.txt"));

        repo.write("image.bin", [0u8, 9, 9, 9, 0, 5]);
        let error = apply(&repo, "image.bin", LineAction::Stage, &all).unwrap_err();
        assert_eq!(error.to_string(), "This is a binary file. Use the whole file instead.");

        let conflicted = crate::test_support::merge_conflict_repo();
        let path = conflicted.unmerged().lines().next().unwrap().split('\t').nth(1).unwrap().to_string();
        let error = apply(&conflicted, &path, LineAction::Stage, &all).unwrap_err();
        assert_eq!(error.to_string(), "Resolve the conflict in this file first.");
    }

    #[test]
    fn a_staged_rename_unstages_lines_at_its_new_path() {
        let repo = TestRepo::new();
        repo.write("old.txt", "a\nb\nc\nd\ne\nf\n");
        repo.commit_all("base");
        repo.git(&["mv", "old.txt", "new.txt"]);
        repo.write("new.txt", "a\nb\nc\nd\ne\nf\ng\n");
        repo.git(&["add", "new.txt"]);
        run_apply_lines(
            &repo.path_string(),
            "new.txt",
            Some("old.txt"),
            LineAction::Unstage,
            &lines(&[], &[[6, 7]]),
            None,
        )
        .unwrap();
        assert_eq!(repo.index_text("new.txt"), "a\nb\nc\nd\ne\nf\n");
        assert_eq!(repo.index_entry("old.txt"), "", "the rename stays staged");
    }

    #[test]
    fn a_stale_selection_or_an_empty_one_changes_nothing() {
        let repo = two_changes();
        let error = run_apply_lines(
            &repo.path_string(),
            "f.txt",
            None,
            LineAction::Stage,
            &lines(&[[1, 2]], &[[1, 2]]),
            Some("u|old|version"),
        )
        .unwrap_err();
        assert!(error.to_string().starts_with("The file changed"), "{error}");
        let version = working_file_version(&repo.open(), "f.txt", None, DiffArea::Unstaged).unwrap();
        // Unchanged lines only.
        let error = run_apply_lines(
            &repo.path_string(),
            "f.txt",
            None,
            LineAction::Stage,
            &lines(&[[2, 5]], &[[2, 5]]),
            Some(&version),
        )
        .unwrap_err();
        assert_eq!(error.to_string(), "Select changed lines first.");
        assert_eq!(repo.git(&["diff", "--cached", "--name-only"]).trim(), "");
        run_apply_lines(
            &repo.path_string(),
            "f.txt",
            None,
            LineAction::Stage,
            &lines(&[[1, 2]], &[[1, 2]]),
            Some(&version),
        )
        .unwrap();
        assert!(repo.index_text("f.txt").starts_with("one\nTWO\n"));
    }

    #[test]
    fn a_patch_that_does_not_fit_leaves_the_index_alone() {
        let repo = two_changes();
        let before = repo.index_entry("f.txt");
        let bad = "diff --git a/f.txt b/f.txt\n--- a/f.txt\n+++ b/f.txt\n@@ -1,2 +1,2 @@\n one\n-missing\n+x\n";
        let error = apply_checked(&repo.path, &["apply", "--cached"], bad).unwrap_err();
        assert!(error.to_string().starts_with("The selected lines do not apply: "), "{error}");
        assert_eq!(repo.index_entry("f.txt"), before);
    }

    #[test]
    fn random_edits_and_selections_apply_exactly() {
        let repo = TestRepo::new();
        repo.write("f.txt", "seed\n");
        repo.commit_all("base");
        let mut seed: u64 = 11;
        let mut random = |bound: u64| {
            seed = seed.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
            (seed >> 33) % bound
        };
        for round in 0..25 {
            let ending = if round % 3 == 0 { "\r\n" } else { "\n" };
            let text = |random: &mut dyn FnMut(u64) -> u64| -> String {
                let count = 1 + random(12);
                let mut body: Vec<String> = (0..count).map(|_| format!("v{}", random(5))).collect();
                if random(4) == 0 {
                    body.push(String::new());
                }
                let joined = body.join(ending);
                if random(3) == 0 {
                    joined
                } else {
                    format!("{joined}{ending}")
                }
            };
            let (base, edited) = (text(&mut random), text(&mut random));
            repo.write("f.txt", &base);
            repo.git(&["add", "f.txt"]);
            repo.write("f.txt", &edited);
            let pick = |random: &mut dyn FnMut(u64) -> u64| -> Vec<[u32; 2]> {
                (0..random(3))
                    .map(|_| {
                        let start = random(14) as u32;
                        [start, start + 1 + random(4) as u32]
                    })
                    .collect()
            };
            let selection = lines(&pick(&mut random), &pick(&mut random));
            let expected = partial_text(&base, &edited, &selection, true);
            match apply(&repo, "f.txt", LineAction::Stage, &selection) {
                Ok(_) => assert_eq!(repo.index_bytes("f.txt"), expected.text.as_bytes(), "round {round}"),
                Err(error) => {
                    assert_eq!(error.to_string(), "Select changed lines first.", "round {round}");
                    assert_eq!(repo.index_bytes("f.txt"), base.as_bytes(), "round {round}");
                }
            }
            assert_eq!(repo.read("f.txt"), edited.as_bytes(), "round {round}");

            // The same lines in a staged diff: `base` committed, `edited` staged.
            let given_back = partial_text(&base, &edited, &selection, false);
            repo.write("f.txt", &base);
            repo.git(&["add", "f.txt"]);
            repo.git(&["commit", "-q", "--allow-empty", "-m", "round"]);
            repo.write("f.txt", &edited);
            repo.git(&["add", "f.txt"]);
            match apply(&repo, "f.txt", LineAction::Unstage, &selection) {
                Ok(_) => assert_eq!(repo.index_bytes("f.txt"), given_back.text.as_bytes(), "unstage round {round}"),
                Err(error) => assert_eq!(error.to_string(), "Select changed lines first.", "unstage round {round}"),
            }
            repo.git(&["reset", "-q", "--hard"]);
        }
    }

    #[test]
    fn odd_paths_and_whitespace_settings_still_apply() {
        let repo = TestRepo::new();
        repo.git(&["config", "apply.whitespace", "error"]);
        repo.write("my dir/naïve file.txt", "a\nb\n");
        repo.commit_all("base");
        repo.write("my dir/naïve file.txt", "a\ntrailing space \nb\n");
        apply(&repo, "my dir/naïve file.txt", LineAction::Stage, &lines(&[], &[[1, 2]])).unwrap();
        assert_eq!(repo.index_text("my dir/naïve file.txt"), "a\ntrailing space \nb\n");
    }
}
