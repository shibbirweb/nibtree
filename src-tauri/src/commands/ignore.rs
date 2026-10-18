//! Add to .gitignore (or to .git/info/exclude, which stays local) and Edit .gitignore. The
//! patterns come from the UI (stores/gitignore.ts escapes them); this side appends the new
//! ones once, keeps the file's line endings and reports tracked files the patterns match,
//! which stay tracked until removed with `git rm --cached`.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use super::{blocking, safe_join};
use crate::error::{AppError, AppResult};
use crate::git::cli;
use crate::git::repo::{self as git_repo, path_text, workdir};

/// Tracked matches reported at most, so a pattern like `*.js` never sends a huge list.
const MAX_TRACKED: usize = 1000;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum IgnoreTarget {
    /// The repository's root `.gitignore`, shared through commits.
    Gitignore,
    /// `.git/info/exclude`: this clone only.
    Exclude,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IgnoreOutcome {
    /// Absolute path of the file written.
    pub ignore_file: String,
    pub added: Vec<String>,
    /// Patterns that were in the file already.
    pub existing: Vec<String>,
    /// Tracked files the patterns match (repo-relative), at most `MAX_TRACKED`.
    pub tracked_paths: Vec<String>,
}

fn ignore_file(repo: &git2::Repository, target: IgnoreTarget) -> AppResult<PathBuf> {
    Ok(match target {
        IgnoreTarget::Gitignore => workdir(repo)?.join(".gitignore"),
        IgnoreTarget::Exclude => repo.commondir().join("info").join("exclude"),
    })
}

/// The file's content with the patterns it lacks appended, one per line, in the file's own
/// line ending. Returns the new content (None when nothing changes), the added patterns and
/// the ones already there.
pub fn append_patterns(current: &str, patterns: &[String]) -> (Option<String>, Vec<String>, Vec<String>) {
    let newline = if current.contains("\r\n") { "\r\n" } else { "\n" };
    let present: Vec<&str> = current.lines().map(|line| line.trim_end_matches('\r')).collect();
    let mut added: Vec<String> = Vec::new();
    let mut existing = Vec::new();
    for pattern in patterns {
        if present.contains(&pattern.as_str()) {
            if !existing.contains(pattern) {
                existing.push(pattern.clone());
            }
        } else if !added.contains(pattern) {
            added.push(pattern.clone());
        }
    }
    if added.is_empty() {
        return (None, added, existing);
    }
    let mut next = current.to_string();
    if !next.is_empty() && !next.ends_with('\n') {
        next.push_str(newline);
    }
    for pattern in &added {
        next.push_str(pattern);
        next.push_str(newline);
    }
    (Some(next), added, existing)
}

fn check_patterns(patterns: &[String]) -> AppResult<()> {
    if patterns.is_empty() {
        return Err(AppError::invalid("Nothing to ignore"));
    }
    for pattern in patterns {
        if pattern.trim().is_empty() || pattern.contains(['\n', '\r']) {
            return Err(AppError::invalid(format!("Not a valid ignore pattern: {pattern:?}")));
        }
    }
    Ok(())
}

/// The literal extension of a `*.ext` pattern, for picking the index entries to check.
fn literal_extension(pattern: &str) -> Option<String> {
    let rest = pattern.strip_prefix("*.")?;
    let mut extension = String::new();
    let mut chars = rest.chars();
    while let Some(character) = chars.next() {
        match character {
            '\\' => extension.push(chars.next()?),
            '*' | '?' | '[' | '/' => return None,
            other => extension.push(other),
        }
    }
    Some(format!(".{extension}"))
}

/// Index entries under `scope_paths` (or with a `*.ext` pattern's extension) that git now ignores.
fn tracked_matches(repo_path: &str, scope_paths: &[String], patterns: &[String]) -> AppResult<Vec<String>> {
    // A fresh handle reads the ignore files as they are now.
    let repo = git_repo::open(repo_path)?;
    let index = repo.index()?;
    let extensions: Vec<String> = patterns.iter().filter_map(|pattern| literal_extension(pattern)).collect();
    let scopes: Vec<&str> = scope_paths.iter().map(|scope| scope.trim_end_matches('/')).collect();
    let mut tracked = Vec::new();
    for entry in index.iter() {
        let entry_path = path_text(&entry.path);
        let in_scope = scopes
            .iter()
            .any(|scope| entry_path == *scope || entry_path.strip_prefix(scope).is_some_and(|rest| rest.starts_with('/')))
            || extensions.iter().any(|extension| entry_path.ends_with(extension.as_str()));
        if in_scope && repo.status_should_ignore(Path::new(&entry_path)).unwrap_or(false) && !tracked.contains(&entry_path) {
            tracked.push(entry_path);
            if tracked.len() >= MAX_TRACKED {
                break;
            }
        }
    }
    Ok(tracked)
}

fn run_add_to_ignore(
    repo_path: &str,
    patterns: &[String],
    target: IgnoreTarget,
    file_paths: &[String],
) -> AppResult<IgnoreOutcome> {
    check_patterns(patterns)?;
    for file_path in file_paths {
        safe_join(repo_path, file_path.trim_end_matches('/'))?;
    }
    let repo = git_repo::open(repo_path)?;
    let path = ignore_file(&repo, target)?;
    let current = match std::fs::read(&path) {
        Ok(bytes) => String::from_utf8_lossy(&bytes).into_owned(),
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => String::new(),
        Err(err) => return Err(err.into()),
    };
    let (next, added, existing) = append_patterns(&current, patterns);
    if let Some(content) = next {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::write(&path, content)?;
    }
    Ok(IgnoreOutcome {
        ignore_file: crate::paths::to_ui(&path),
        added,
        existing,
        tracked_paths: tracked_matches(repo_path, file_paths, patterns)?,
    })
}

fn run_ensure_ignore_file(repo_path: &str, target: IgnoreTarget) -> AppResult<String> {
    let path = ignore_file(&git_repo::open(repo_path)?, target)?;
    if !path.exists() {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::write(&path, "")?;
    }
    Ok(crate::paths::to_ui(&path))
}

/// `git rm --cached`: the files stay on disk and leave the index. Paths go through stdin, so a
/// long list never hits the command line limit, and literally, so `*` in a name is no glob.
fn run_untrack_files(repo_path: &str, file_paths: &[String]) -> AppResult<()> {
    if file_paths.is_empty() {
        return Ok(());
    }
    for file_path in file_paths {
        safe_join(repo_path, file_path)?;
    }
    let mut list = Vec::new();
    for file_path in file_paths {
        list.extend_from_slice(file_path.as_bytes());
        list.push(0);
    }
    let args = [
        "--literal-pathspecs",
        "rm",
        "--cached",
        "-r",
        "-q",
        "--pathspec-from-file=-",
        "--pathspec-file-nul",
    ];
    cli::run_with_stdin(Path::new(repo_path), &args, &list)?;
    Ok(())
}

/// Appends `patterns` to the root .gitignore or to .git/info/exclude. `file_paths` are the
/// files or folders the patterns were made for, to find which of them are tracked.
#[crate::command]
pub async fn add_to_ignore(
    repo_path: String,
    patterns: Vec<String>,
    target: IgnoreTarget,
    file_paths: Vec<String>,
) -> AppResult<IgnoreOutcome> {
    blocking(move || run_add_to_ignore(&repo_path, &patterns, target, &file_paths)).await
}

/// Edit .gitignore: the file's absolute path, created empty when missing.
#[crate::command]
pub async fn ensure_ignore_file(repo_path: String, target: IgnoreTarget) -> AppResult<String> {
    blocking(move || run_ensure_ignore_file(&repo_path, target)).await
}

#[crate::command]
pub async fn untrack_files(repo_path: String, file_paths: Vec<String>) -> AppResult<()> {
    blocking(move || run_untrack_files(&repo_path, &file_paths)).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::UiText;
    use crate::test_support::TestRepo;

    fn strings(values: &[&str]) -> Vec<String> {
        values.iter().map(|value| value.to_string()).collect()
    }

    #[test]
    fn appends_once_with_a_newline_in_the_files_own_style() {
        let (next, added, existing) = append_patterns("", &strings(&["/a.log"]));
        assert_eq!(next.as_deref(), Some("/a.log\n"));
        assert_eq!(added, strings(&["/a.log"]));
        assert!(existing.is_empty());

        // A last line without a line break gets one before the new pattern.
        let (next, _, _) = append_patterns("node_modules", &strings(&["/build/"]));
        assert_eq!(next.as_deref(), Some("node_modules\n/build/\n"));

        let (next, added, existing) = append_patterns("one\r\ntwo\r\n", &strings(&["two", "three", "three"]));
        assert_eq!(next.as_deref(), Some("one\r\ntwo\r\nthree\r\n"));
        assert_eq!(added, strings(&["three"]));
        assert_eq!(existing, strings(&["two"]));

        let (next, added, existing) = append_patterns("*.tmp\n", &strings(&["*.tmp"]));
        assert_eq!(next, None);
        assert!(added.is_empty());
        assert_eq!(existing, strings(&["*.tmp"]));
    }

    #[test]
    fn reads_literal_extensions() {
        assert_eq!(literal_extension("*.log").as_deref(), Some(".log"));
        assert_eq!(literal_extension("*.\\[x\\]").as_deref(), Some(".[x]"));
        assert_eq!(literal_extension("*.l?g"), None);
        assert_eq!(literal_extension("/a.log"), None);
    }

    #[test]
    fn adds_to_gitignore_and_reports_tracked_matches() {
        let repo = TestRepo::new();
        repo.write("logs/a.log", "a\n");
        repo.write("keep.txt", "keep\n");
        repo.write("deep/b.log", "b\n");
        repo.commit_all("base");
        repo.write("new.log", "untracked\n");

        let outcome = run_add_to_ignore(&repo.path_string(), &strings(&["/logs/"]), IgnoreTarget::Gitignore, &strings(&["logs"]))
            .unwrap();
        assert_eq!(repo.read_text(".gitignore"), "/logs/\n");
        assert_eq!(outcome.ignore_file, repo.file(".gitignore").ui());
        assert_eq!(outcome.tracked_paths, strings(&["logs/a.log"]));

        let again = run_add_to_ignore(&repo.path_string(), &strings(&["/logs/"]), IgnoreTarget::Gitignore, &[]).unwrap();
        assert!(again.added.is_empty());
        assert_eq!(repo.read_text(".gitignore"), "/logs/\n", "no duplicate line");

        let by_extension = run_add_to_ignore(&repo.path_string(), &strings(&["*.log"]), IgnoreTarget::Gitignore, &[]).unwrap();
        assert_eq!(by_extension.tracked_paths, strings(&["deep/b.log", "logs/a.log"]));
        assert!(!repo.porcelain().contains("new.log"), "the untracked file is ignored now");

        run_untrack_files(&repo.path_string(), &by_extension.tracked_paths).unwrap();
        assert!(repo.exists("deep/b.log"), "the file stays on disk");
        assert_eq!(repo.git(&["ls-files"]).lines().collect::<Vec<_>>(), vec!["keep.txt"]);
    }

    #[test]
    fn adds_to_info_exclude_and_creates_files_for_editing() {
        let repo = TestRepo::new();
        repo.write("local.txt", "x\n");
        let outcome =
            run_add_to_ignore(&repo.path_string(), &strings(&["/local.txt"]), IgnoreTarget::Exclude, &strings(&["local.txt"]))
                .unwrap();
        let exclude = repo.path.join(".git/info/exclude");
        assert!(std::fs::read_to_string(&exclude).unwrap().ends_with("/local.txt\n"));
        assert!(outcome.tracked_paths.is_empty());
        assert_eq!(repo.porcelain(), "");
        assert!(!repo.exists(".gitignore"));

        let created = run_ensure_ignore_file(&repo.path_string(), IgnoreTarget::Gitignore).unwrap();
        assert_eq!(created, repo.file(".gitignore").ui());
        assert_eq!(repo.read_text(".gitignore"), "");
    }

    #[test]
    fn untracks_names_with_glob_characters_literally() {
        let repo = TestRepo::new();
        // `[ab]` and not `*`: Windows file names cannot hold `*` or `?`.
        repo.write("star[ab].txt", "s\n");
        repo.write("stara.txt", "t\n");
        repo.commit_all("base");
        run_untrack_files(&repo.path_string(), &strings(&["star[ab].txt"])).unwrap();
        assert_eq!(repo.git(&["ls-files"]).trim(), "stara.txt");
    }

    #[test]
    fn refuses_patterns_that_would_break_the_file() {
        let repo = TestRepo::new();
        for bad in [vec![], strings(&["a\nb"]), strings(&["  "])] {
            assert!(run_add_to_ignore(&repo.path_string(), &bad, IgnoreTarget::Gitignore, &[]).is_err());
        }
        assert!(run_add_to_ignore(&repo.path_string(), &strings(&["/x"]), IgnoreTarget::Gitignore, &strings(&["../x"])).is_err());
    }
}
