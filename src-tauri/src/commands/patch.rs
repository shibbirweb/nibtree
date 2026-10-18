//! Create Patch, Create Patch from Commit, Apply Patch and the clipboard text
//! Apply Patch from Clipboard reads.

use std::path::Path;
use std::process::{Command, Stdio};

use serde::Deserialize;

use super::{blocking, has_conflicts, safe_join, with_paths, OpOutcome};
use crate::error::{AppError, AppResult};
use crate::git::cli;
use crate::git::repo::{self as git_repo, resolve_commit};

/// The tree of an empty repository, to diff against when HEAD does not exist yet.
const EMPTY_TREE: &str = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

/// Which changes a patch holds.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PatchSource {
    /// HEAD to the index.
    Staged,
    /// The index to the work tree.
    Unstaged,
    /// HEAD to the work tree.
    All,
}

/// Explicit prefixes, so a user's diff.noprefix or mnemonicPrefix never makes a patch `git apply` cannot read.
const DIFF_FLAGS: [&str; 5] = ["--binary", "--no-color", "--no-ext-diff", "--src-prefix=a/", "--dst-prefix=b/"];

fn count_files(patch: &[u8]) -> usize {
    patch
        .split(|byte| *byte == b'\n')
        .filter(|line| line.starts_with(b"diff --git "))
        .count()
}

fn checked_patch_path(patch_path: &str) -> AppResult<&Path> {
    let path = Path::new(patch_path);
    if !path.is_absolute() {
        return Err(AppError::invalid(format!("Choose where to save the patch: {patch_path}")));
    }
    Ok(path)
}

fn run_create_patch(repo_path: &str, source: PatchSource, file_paths: &[String], patch_path: &str) -> AppResult<usize> {
    let target = checked_patch_path(patch_path)?;
    for file_path in file_paths {
        safe_join(repo_path, file_path)?;
    }
    let unborn = git_repo::open(repo_path)?.head().is_err();
    let mut args = vec!["diff"];
    args.extend(DIFF_FLAGS);
    match source {
        PatchSource::Staged => args.push("--cached"),
        PatchSource::Unstaged => {}
        PatchSource::All => args.push(if unborn { EMPTY_TREE } else { "HEAD" }),
    }
    let args = if file_paths.is_empty() {
        args
    } else {
        with_paths(&args, file_paths)
    };
    let patch = cli::run_bytes(Path::new(repo_path), &args)?;
    let files = count_files(&patch);
    if files == 0 {
        return Err(AppError::invalid("There are no changes to put in a patch"));
    }
    std::fs::write(target, &patch)?;
    Ok(files)
}

fn run_create_commit_patch(repo_path: &str, commit_id: &str, patch_path: &str) -> AppResult<()> {
    let target = checked_patch_path(patch_path)?;
    let full_id = {
        let repo = git_repo::open(repo_path)?;
        let resolved = resolve_commit(&repo, commit_id)?.id().to_string();
        resolved
    };
    let mut args = vec!["format-patch", "-1", "--stdout"];
    args.extend(&DIFF_FLAGS[1..]);
    args.push(&full_id);
    let patch = cli::run_bytes(Path::new(repo_path), &args)?;
    std::fs::write(target, &patch)?;
    Ok(())
}

fn run_apply_patch(repo_path: &str, patch_path: Option<&str>, patch_text: Option<&str>) -> AppResult<OpOutcome> {
    let bytes = match (patch_path.filter(|path| !path.is_empty()), patch_text) {
        (Some(path), _) => std::fs::read(path)?,
        (None, Some(text)) => text.as_bytes().to_vec(),
        (None, None) => Vec::new(),
    };
    if bytes.iter().all(u8::is_ascii_whitespace) {
        return Err(AppError::invalid("The patch is empty"));
    }
    let root = Path::new(repo_path);
    let check = cli::run_raw(root, &["apply", "--check", "-"], Some(&bytes))?;
    if check.success {
        // The work tree only, nothing is staged.
        let applied = cli::run_with_stdin(root, &["apply", "-"], &bytes)?;
        return Ok(OpOutcome {
            output: applied.text(),
            conflicts: false,
        });
    }
    // The base blobs the patch names may still be here: a 3-way merge can apply it with conflicts.
    let merged = cli::run_raw(root, &["apply", "--3way", "-"], Some(&bytes))?;
    let conflicts = has_conflicts(repo_path);
    if merged.success || conflicts {
        return Ok(OpOutcome {
            output: merged.text(),
            conflicts,
        });
    }
    let reason = check.text();
    let reason = if reason.is_empty() { merged.text() } else { reason };
    Err(AppError::Command {
        message: format!("Patch does not apply: {reason}"),
    })
}

#[crate::command]
pub async fn create_patch(
    repo_path: String,
    source: PatchSource,
    file_paths: Vec<String>,
    patch_path: String,
) -> AppResult<usize> {
    blocking(move || run_create_patch(&repo_path, source, &file_paths, &patch_path)).await
}

#[crate::command]
pub async fn create_commit_patch(repo_path: String, commit_id: String, patch_path: String) -> AppResult<()> {
    blocking(move || run_create_commit_patch(&repo_path, &commit_id, &patch_path)).await
}

#[crate::command]
pub async fn apply_patch(repo_path: String, patch_path: Option<String>, patch_text: Option<String>) -> AppResult<OpOutcome> {
    blocking(move || run_apply_patch(&repo_path, patch_path.as_deref(), patch_text.as_deref())).await
}

#[cfg(target_os = "macos")]
fn clipboard_commands() -> Vec<(&'static str, Vec<&'static str>)> {
    vec![("/usr/bin/pbpaste", vec![])]
}

#[cfg(target_os = "windows")]
fn clipboard_commands() -> Vec<(&'static str, Vec<&'static str>)> {
    vec![("powershell", vec!["-NoProfile", "-Command", "Get-Clipboard -Raw"])]
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn clipboard_commands() -> Vec<(&'static str, Vec<&'static str>)> {
    vec![
        ("wl-paste", vec!["--no-newline"]),
        ("xclip", vec!["-selection", "clipboard", "-o"]),
    ]
}

fn read_clipboard() -> AppResult<String> {
    for (program, args) in clipboard_commands() {
        let output = crate::child_process::hide_console(&mut Command::new(program))
            .args(args)
            .stdin(Stdio::null())
            .stderr(Stdio::null())
            .output();
        if let Ok(output) = output {
            if output.status.success() {
                return Ok(String::from_utf8_lossy(&output.stdout).into_owned());
            }
        }
    }
    Err(AppError::invalid("Could not read the clipboard"))
}

/// The clipboard's text, read natively: the web view only allows that after a click in the page.
#[crate::command]
pub async fn read_clipboard_text() -> AppResult<String> {
    blocking(read_clipboard).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::{TestDir, TestRepo};

    fn changed_repo() -> TestRepo {
        let repo = TestRepo::new();
        repo.write("staged.txt", "base\n");
        repo.write("unstaged.txt", "base\n");
        repo.commit_all("base");
        repo.write("staged.txt", "staged\n");
        repo.git(&["add", "staged.txt"]);
        repo.write("unstaged.txt", "unstaged\n");
        repo
    }

    fn read(path: &Path) -> String {
        std::fs::read_to_string(path).unwrap()
    }

    #[test]
    fn create_patch_writes_the_chosen_changes() {
        let repo = changed_repo();
        let out = TestDir::new();
        let repo_path = repo.path_string();

        let staged = out.file_string("staged.patch");
        assert_eq!(run_create_patch(&repo_path, PatchSource::Staged, &[], &staged).unwrap(), 1);
        assert!(read(Path::new(&staged)).contains("+++ b/staged.txt"));
        assert!(!read(Path::new(&staged)).contains("unstaged.txt"));

        let unstaged = out.file_string("unstaged.patch");
        assert_eq!(run_create_patch(&repo_path, PatchSource::Unstaged, &[], &unstaged).unwrap(), 1);
        assert!(read(Path::new(&unstaged)).contains("+unstaged"));

        let all = out.file_string("all.patch");
        assert_eq!(run_create_patch(&repo_path, PatchSource::All, &[], &all).unwrap(), 2);
        let one = out.file_string("one.patch");
        let only = vec!["unstaged.txt".to_string()];
        assert_eq!(run_create_patch(&repo_path, PatchSource::All, &only, &one).unwrap(), 1);

        repo.git(&["config", "diff.noprefix", "true"]);
        run_create_patch(&repo_path, PatchSource::All, &[], &all).unwrap();
        assert!(read(Path::new(&all)).contains("diff --git a/staged.txt b/staged.txt"));

        repo.git(&["reset", "-q", "--hard"]);
        let empty = run_create_patch(&repo_path, PatchSource::All, &[], &all).unwrap_err();
        assert_eq!(empty.to_string(), "There are no changes to put in a patch");
        assert!(run_create_patch(&repo_path, PatchSource::All, &[], "relative.patch").is_err());
    }

    #[test]
    fn create_patch_works_before_the_first_commit() {
        let repo = TestRepo::new();
        repo.write("first.txt", "first\n");
        repo.git(&["add", "first.txt"]);
        let out = TestDir::new();
        let patch = out.file_string("first.patch");
        assert_eq!(run_create_patch(&repo.path_string(), PatchSource::All, &[], &patch).unwrap(), 1);
    }

    #[test]
    fn a_commit_patch_applies_elsewhere() {
        let repo = TestRepo::new();
        repo.write("f.txt", "one\n");
        repo.commit_all("base");
        let base = repo.head();
        repo.write("f.txt", "one\ntwo\n");
        let commit_id = repo.commit_all("add two");
        let out = TestDir::new();
        let patch = out.file_string("commit.patch");
        run_create_commit_patch(&repo.path_string(), &commit_id[..8], &patch).unwrap();
        let text = read(Path::new(&patch));
        assert!(text.contains("Subject: [PATCH] add two"));

        repo.git(&["reset", "-q", "--hard", &base]);
        let applied = run_apply_patch(&repo.path_string(), Some(&patch), None).unwrap();
        assert!(!applied.conflicts);
        assert_eq!(repo.read_text("f.txt"), "one\ntwo\n");
        assert_eq!(repo.git(&["diff", "--cached", "--name-only"]).trim(), "", "nothing is staged");
        assert!(run_create_commit_patch(&repo.path_string(), "nope", &patch).is_err());
    }

    #[test]
    fn apply_patch_falls_back_to_a_three_way_merge() {
        let repo = TestRepo::new();
        repo.write("f.txt", "alpha\nbravo\ncharlie\n");
        let base = repo.commit_all("base");
        repo.write("f.txt", "alpha\nBRAVO patch\ncharlie\n");
        repo.commit_all("patch side");
        let out = TestDir::new();
        let patch = out.file_string("p.patch");
        run_create_commit_patch(&repo.path_string(), "HEAD", &patch).unwrap();

        repo.git(&["reset", "-q", "--hard", &base]);
        repo.write("f.txt", "alpha\nBRAVO local\ncharlie\n");
        repo.commit_all("local side");
        let outcome = run_apply_patch(&repo.path_string(), Some(&patch), None).unwrap();
        assert!(outcome.conflicts);
        assert!(repo.read_text("f.txt").contains("<<<<<<<"));
    }

    #[test]
    fn apply_patch_reports_why_it_does_not_apply() {
        let repo = TestRepo::new();
        repo.write("f.txt", "one\n");
        repo.commit_all("base");
        let bad = "diff --git a/f.txt b/f.txt\n--- a/f.txt\n+++ b/f.txt\n@@ -1 +1 @@\n-missing line\n+other\n";
        let error = run_apply_patch(&repo.path_string(), None, Some(bad)).unwrap_err();
        assert!(error.to_string().starts_with("Patch does not apply: "), "{error}");
        assert_eq!(repo.read_text("f.txt"), "one\n");

        let empty = run_apply_patch(&repo.path_string(), None, Some(" \n")).unwrap_err();
        assert_eq!(empty.to_string(), "The patch is empty");
        assert!(run_apply_patch(&repo.path_string(), None, None).is_err());
    }

    #[test]
    fn apply_patch_from_text() {
        let repo = TestRepo::new();
        repo.write("f.txt", "one\n");
        repo.commit_all("base");
        let patch = "diff --git a/f.txt b/f.txt\n--- a/f.txt\n+++ b/f.txt\n@@ -1 +1 @@\n-one\n+uno\n";
        let applied = run_apply_patch(&repo.path_string(), None, Some(patch)).unwrap();
        assert!(!applied.conflicts);
        assert_eq!(repo.read_text("f.txt"), "uno\n");
    }
}
