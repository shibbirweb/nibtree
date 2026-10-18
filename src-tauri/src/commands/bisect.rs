//! Git > Bisect: every step runs `git bisect` so its log, terms and refs stay exactly as
//! the terminal would leave them; git/bisect.rs reads the state back.

use std::path::Path;

use super::{blocking, reject_option};
use crate::error::{AppError, AppResult};
use crate::git::bisect::{self, BisectState};
use crate::git::cli;
use crate::git::repo as git_repo;

fn checked_revision(revision: &str) -> AppResult<&str> {
    let revision = revision.trim();
    reject_option(revision, "A revision")?;
    if revision.is_empty() {
        return Err(AppError::invalid("Pick a commit"));
    }
    Ok(revision)
}

fn ensure_active(repo_path: &str) -> AppResult<(String, String)> {
    let repo = git_repo::open(repo_path)?;
    let Some(state) = bisect::read(&repo)? else {
        return Err(AppError::invalid("No bisect is running"));
    };
    Ok((state.bad_term, state.good_term))
}

pub(crate) fn run_bisect_start(repo_path: &str, bad_commit: Option<&str>, good_commits: &[String]) -> AppResult<String> {
    if bisect::is_active(&git_repo::open(repo_path)?) {
        return Err(AppError::invalid("A bisect is already running"));
    }
    let bad_commit = bad_commit.map(checked_revision).transpose()?;
    let good_commits = good_commits
        .iter()
        .map(|good| checked_revision(good))
        .collect::<AppResult<Vec<&str>>>()?;
    let root = Path::new(repo_path);
    let output = match bad_commit {
        Some(bad) => {
            let mut args = vec!["bisect", "start", bad];
            args.extend(good_commits.iter().copied());
            args.push("--");
            cli::run(root, &args)?
        }
        None => {
            // `git bisect start` takes good commits only after a bad one: mark them one by one.
            let mut output = cli::run(root, &["bisect", "start"])?;
            for good in &good_commits {
                output = cli::run(root, &["bisect", "good", good])?;
            }
            output
        }
    };
    Ok(output.text())
}

pub(crate) fn run_bisect_mark(repo_path: &str, mark: &str, commit_id: Option<&str>) -> AppResult<String> {
    let (bad_term, good_term) = ensure_active(repo_path)?;
    let term = match mark {
        "bad" => bad_term,
        "good" => good_term,
        "skip" => "skip".to_string(),
        _ => return Err(AppError::invalid(format!("Unknown bisect mark: {mark}"))),
    };
    let mut args = vec!["bisect", term.as_str()];
    if let Some(commit) = commit_id.map(checked_revision).transpose()? {
        args.push(commit);
    }
    Ok(cli::run(Path::new(repo_path), &args)?.text())
}

pub(crate) fn run_bisect_reset(repo_path: &str) -> AppResult<String> {
    ensure_active(repo_path)?;
    Ok(cli::run(Path::new(repo_path), &["bisect", "reset"])?.text())
}

#[crate::command]
pub async fn bisect_state(repo_path: String) -> AppResult<Option<BisectState>> {
    blocking(move || bisect::read(&git_repo::open(&repo_path)?)).await
}

/// Starts a bisect: with a bad commit (and good ones) git checks out the first commit to test.
#[crate::command]
pub async fn bisect_start(repo_path: String, bad_commit: Option<String>, good_commits: Vec<String>) -> AppResult<String> {
    blocking(move || run_bisect_start(&repo_path, bad_commit.as_deref(), &good_commits)).await
}

/// Marks a commit (the checked out one when None) as "good", "bad" or "skip".
#[crate::command]
pub async fn bisect_mark(repo_path: String, mark: String, commit_id: Option<String>) -> AppResult<String> {
    blocking(move || run_bisect_mark(&repo_path, &mark, commit_id.as_deref())).await
}

/// Ends the bisect and goes back to where it started.
#[crate::command]
pub async fn bisect_reset(repo_path: String) -> AppResult<String> {
    blocking(move || run_bisect_reset(&repo_path)).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::TestRepo;

    /// Ten commits; "version" 6 and later are bad.
    fn history() -> (TestRepo, Vec<String>) {
        let repo = TestRepo::new();
        let mut commits = Vec::new();
        for version in 1..=10 {
            repo.write("version.txt", format!("{version}\n"));
            commits.push(repo.commit_all(&format!("Version {version}")));
        }
        (repo, commits)
    }

    fn state(repo: &TestRepo) -> Option<BisectState> {
        bisect::read(&repo.open()).unwrap()
    }

    fn is_bad(repo: &TestRepo) -> bool {
        repo.read_text("version.txt").trim().parse::<u32>().unwrap() >= 6
    }

    #[test]
    fn finds_the_first_bad_commit_and_resets() {
        let (repo, commits) = history();
        assert!(state(&repo).is_none());
        let path = repo.path_string();
        run_bisect_start(&path, Some(&commits[9]), &[commits[0].clone()]).unwrap();
        let started = state(&repo).unwrap();
        assert_eq!(started.start, "main");
        assert_eq!(started.bad.as_deref(), Some(commits[9].as_str()));
        assert_eq!(started.good, vec![commits[0].clone()]);
        assert_eq!(started.remaining, 9);
        assert_eq!(started.steps, 2);
        assert!(started.first_bad.is_none());
        assert!(run_bisect_start(&path, None, &[]).is_err(), "one bisect at a time");

        let mut marks = 0;
        while state(&repo).unwrap().first_bad.is_none() {
            let mark = if is_bad(&repo) { "bad" } else { "good" };
            run_bisect_mark(&path, mark, None).unwrap();
            marks += 1;
            assert!(marks < 10, "the bisect does not finish");
        }
        let finished = state(&repo).unwrap();
        let first_bad = finished.first_bad.unwrap();
        assert_eq!(first_bad.id, commits[5]);
        assert_eq!(first_bad.summary, "Version 6");
        assert_eq!(finished.remaining, 1);

        run_bisect_reset(&path).unwrap();
        assert!(state(&repo).is_none());
        assert_eq!(repo.git(&["branch", "--show-current"]).trim(), "main");
        assert_eq!(repo.head(), commits[9]);
        assert!(run_bisect_reset(&path).is_err());
    }

    #[test]
    fn starts_without_a_bad_commit_and_marks_by_id_or_skips() {
        let (repo, commits) = history();
        let path = repo.path_string();
        run_bisect_start(&path, None, &[commits[1].clone()]).unwrap();
        let waiting = state(&repo).unwrap();
        assert!(waiting.bad.is_none());
        assert_eq!(waiting.good, vec![commits[1].clone()]);
        assert_eq!(waiting.remaining, 0);

        run_bisect_mark(&path, "bad", Some(&commits[9])).unwrap();
        let current = state(&repo).unwrap().current.unwrap();
        run_bisect_mark(&path, "skip", None).unwrap();
        let skipped = state(&repo).unwrap();
        assert_eq!(skipped.skipped, vec![current]);
        assert_eq!(skipped.remaining, 7, "eight candidates, one skipped");
        assert!(run_bisect_mark(&path, "maybe", None).is_err());
        assert!(run_bisect_mark(&path, "good", Some("--all")).is_err());
        run_bisect_reset(&path).unwrap();
    }

    fn status_hash(repo: &TestRepo) -> String {
        crate::git::status::hash(&crate::git::status::read(&repo.open()).unwrap())
    }

    #[test]
    fn every_mark_changes_the_status_even_when_head_stays() {
        let (repo, commits) = history();
        let path = repo.path_string();
        let before = status_hash(&repo);
        // No checkout happens here: only the bisect log changes.
        run_bisect_start(&path, None, &[commits[0].clone()]).unwrap();
        let started = status_hash(&repo);
        assert_ne!(before, started);
        assert_eq!(repo.head(), commits[9]);

        run_bisect_mark(&path, "bad", None).unwrap();
        let mut last = status_hash(&repo);
        assert_ne!(started, last);
        let mut marks = 0;
        while state(&repo).unwrap().first_bad.is_none() {
            let mark = if is_bad(&repo) { "bad" } else { "good" };
            run_bisect_mark(&path, mark, None).unwrap();
            let next = status_hash(&repo);
            assert_ne!(last, next, "a mark leaves the status unchanged");
            last = next;
            marks += 1;
            assert!(marks < 10, "the bisect does not finish");
        }
        run_bisect_reset(&path).unwrap();
        assert_eq!(status_hash(&repo), before);
    }

    #[test]
    fn marking_needs_a_running_bisect() {
        let (repo, _) = history();
        let refused = run_bisect_mark(&repo.path_string(), "good", None);
        assert!(matches!(refused, Err(AppError::Invalid(_))), "{refused:?}");
    }

    #[test]
    fn uses_custom_terms() {
        let (repo, commits) = history();
        let path = repo.path_string();
        repo.git(&["bisect", "start", "--term-old=old", "--term-new=new", &commits[9], &commits[0]]);
        let started = state(&repo).unwrap();
        assert_eq!((started.bad_term.as_str(), started.good_term.as_str()), ("new", "old"));
        assert_eq!(started.bad.as_deref(), Some(commits[9].as_str()));
        run_bisect_mark(&path, "good", None).unwrap();
        assert_eq!(state(&repo).unwrap().good.len(), 2);
        run_bisect_reset(&path).unwrap();
    }
}
