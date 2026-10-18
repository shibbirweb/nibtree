use std::path::Path;

use super::{blocking, run_op, OpOutcome};
use crate::error::{AppError, AppResult};
use crate::git::cli;
use crate::git::repo as git_repo;
use crate::git::stash::{self, StashEntry};

fn stash_ref(stash_index: usize) -> String {
    format!("stash@{{{stash_index}}}")
}

#[crate::command]
pub async fn get_stashes(repo_path: String) -> AppResult<Vec<StashEntry>> {
    blocking(move || stash::list(&mut git_repo::open(&repo_path)?)).await
}

fn newest_stash(repo_path: &str) -> Option<git2::Oid> {
    git_repo::open(repo_path).ok()?.refname_to_id("refs/stash").ok()
}

fn has_untracked(repo_path: &str) -> bool {
    let Ok(repo) = git_repo::open(repo_path) else {
        return false;
    };
    let mut options = git2::StatusOptions::new();
    options.include_untracked(true).include_ignored(false);
    repo.statuses(Some(&mut options))
        .map(|statuses| statuses.iter().any(|entry| entry.status().is_wt_new()))
        .unwrap_or(false)
}

/// `git stash push` exits 0 with "No local changes to save" when there is
/// nothing to stash. That text is translated, so compare the stash ref instead
/// and report it as an error, which keeps the UI from announcing a stash.
#[crate::command]
pub async fn stash_push(repo_path: String, message: String, include_untracked: bool) -> AppResult<()> {
    blocking(move || {
        let mut args = vec!["stash", "push"];
        if include_untracked {
            args.push("--include-untracked");
        }
        if !message.trim().is_empty() {
            args.extend(["-m", message.as_str()]);
        }
        let before = newest_stash(&repo_path);
        cli::run(Path::new(&repo_path), &args)?;
        if newest_stash(&repo_path) == before {
            let message = if !include_untracked && has_untracked(&repo_path) {
                "No local changes to stash. To stash new files, turn on Include untracked files."
            } else {
                "No local changes to stash"
            };
            return Err(AppError::invalid(message));
        }
        Ok(())
    })
    .await
}

#[crate::command]
pub async fn stash_apply(repo_path: String, stash_index: usize, pop: bool) -> AppResult<OpOutcome> {
    blocking(move || {
        let reference = stash_ref(stash_index);
        let action = if pop { "pop" } else { "apply" };
        run_op(&repo_path, &["stash", action, &reference])
    })
    .await
}

#[crate::command]
pub async fn stash_drop(repo_path: String, stash_index: usize) -> AppResult<()> {
    blocking(move || {
        cli::run(Path::new(&repo_path), &["stash", "drop", &stash_ref(stash_index)])?;
        Ok(())
    })
    .await
}

/// Drops every stash (`git stash clear`); the UI confirms first.
#[crate::command]
pub async fn stash_clear(repo_path: String) -> AppResult<()> {
    blocking(move || {
        cli::run(Path::new(&repo_path), &["stash", "clear"])?;
        Ok(())
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::{block_on, TestRepo};

    fn push(repo: &TestRepo, include_untracked: bool) -> AppResult<()> {
        block_on(stash_push(repo.path_string(), "WIP".to_string(), include_untracked))
    }

    #[test]
    fn stashing_nothing_is_an_error_not_a_success() {
        let repo = TestRepo::new();
        repo.write("f.txt", "base\n");
        repo.commit_all("base");

        let clean = push(&repo, true);
        assert!(matches!(&clean, Err(AppError::Invalid(message)) if message == "No local changes to stash"), "{clean:?}");

        // Only a new file, without Include untracked files: git stashes nothing.
        repo.write("new.txt", "new\n");
        let untracked_only = push(&repo, false);
        assert!(
            matches!(&untracked_only, Err(AppError::Invalid(message)) if message.contains("Include untracked files")),
            "{untracked_only:?}"
        );
        assert!(block_on(get_stashes(repo.path_string())).unwrap().is_empty());

        push(&repo, true).unwrap();
        assert_eq!(block_on(get_stashes(repo.path_string())).unwrap().len(), 1);
        assert!(!repo.exists("new.txt"));

        // With a stash already there, nothing new to stash is still reported.
        let again = push(&repo, true);
        assert!(matches!(again, Err(AppError::Invalid(_))), "{again:?}");
        assert_eq!(block_on(get_stashes(repo.path_string())).unwrap().len(), 1);
    }

    #[test]
    fn stash_clear_drops_every_stash_and_pop_by_index_keeps_the_rest() {
        let repo = TestRepo::new();
        repo.write("f.txt", "base\n");
        repo.commit_all("base");
        repo.write("f.txt", "one\n");
        push(&repo, false).unwrap();
        repo.write("f.txt", "two\n");
        push(&repo, false).unwrap();
        repo.write("new.txt", "new\n");
        push(&repo, true).unwrap();
        assert_eq!(block_on(get_stashes(repo.path_string())).unwrap().len(), 3);

        // stash@{2} is the oldest ("one"); popping it leaves the other two.
        let popped = block_on(stash_apply(repo.path_string(), 2, true)).unwrap();
        assert!(!popped.conflicts);
        assert_eq!(repo.read_text("f.txt"), "one\n");
        assert_eq!(block_on(get_stashes(repo.path_string())).unwrap().len(), 2);

        block_on(stash_clear(repo.path_string())).unwrap();
        assert!(block_on(get_stashes(repo.path_string())).unwrap().is_empty());
        // Clearing with no stashes is not an error.
        block_on(stash_clear(repo.path_string())).unwrap();
    }
}
