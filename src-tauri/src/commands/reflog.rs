//! Show Reflog and Undo Last Action. Reads go through git2 (git/reflog.rs); moving HEAD
//! back goes through `git reset` so hooks and config behave like the terminal.

use std::path::Path;

use git2::Oid;

use super::{blocking, reject_option};
use crate::error::{AppError, AppResult};
use crate::git::cli;
use crate::git::reflog::{self, LastAction, ReflogPage};
use crate::git::repo as git_repo;

/// Entries in one page at most, so a huge reflog never crosses the bridge at once.
const MAX_PAGE: usize = 1000;

fn run_get_reflog(repo_path: &str, ref_name: &str, offset: usize, limit: usize) -> AppResult<ReflogPage> {
    let repo = git_repo::open(repo_path)?;
    reflog::read_page(&repo, ref_name, offset, limit.clamp(1, MAX_PAGE))
}

/// One page of the reflog of HEAD ("" or "HEAD") or of a local branch, newest first.
#[crate::command]
pub async fn get_reflog(repo_path: String, ref_name: Option<String>, offset: usize, limit: usize) -> AppResult<ReflogPage> {
    blocking(move || run_get_reflog(&repo_path, ref_name.as_deref().unwrap_or("HEAD"), offset, limit)).await
}

/// The latest HEAD movement, for Undo Last Action.
#[crate::command]
pub async fn last_action(repo_path: String) -> AppResult<LastAction> {
    blocking(move || reflog::last_action(&git_repo::open(&repo_path)?)).await
}

fn parse_commit(commit_id: &str, what: &str) -> AppResult<Oid> {
    let commit_id = commit_id.trim();
    reject_option(commit_id, what)?;
    Oid::from_str(commit_id).map_err(|_| AppError::invalid(format!("{what} is not a commit id: {commit_id}")))
}

/// Moves the current branch (or a detached HEAD) back to `commit_id`, but only while HEAD
/// still points at `head_id`: an Undo offered a while ago must not undo something newer.
/// `soft` keeps the undone commit's changes staged. `keep` tries `reset --keep` (moves the
/// work tree too, refusing to touch local changes) and falls back to `reset --mixed`
/// (changes stay in the work tree), so an undo never throws work away. Returns the mode used.
pub(crate) fn run_move_head_back(repo_path: &str, head_id: &str, commit_id: &str, mode: &str) -> AppResult<String> {
    let expected = parse_commit(head_id, "The current commit")?;
    let target = parse_commit(commit_id, "The commit to go back to")?;
    {
        let repo = git_repo::open(repo_path)?;
        let current = repo.head().ok().and_then(|head| head.target());
        if current != Some(expected) {
            return Err(AppError::invalid("The repository changed since then, so this can no longer be undone"));
        }
        if repo.state() != git2::RepositoryState::Clean {
            return Err(AppError::invalid("Finish or abort the operation in progress first"));
        }
        repo.find_commit(target)
            .map_err(|_| AppError::invalid(format!("The commit {commit_id} is not in this repository")))?;
    }
    let root = Path::new(repo_path);
    let target = target.to_string();
    match mode {
        "soft" => {
            cli::run(root, &["reset", "--soft", &target, "--"])?;
            Ok("soft".to_string())
        }
        "keep" => {
            let kept = cli::run_raw(root, &["reset", "--keep", &target, "--"], None)?;
            if kept.success {
                return Ok("keep".to_string());
            }
            cli::run(root, &["reset", "--mixed", "-q", &target, "--"])?;
            Ok("mixed".to_string())
        }
        _ => Err(AppError::invalid(format!("Unknown undo mode: {mode}"))),
    }
}

#[crate::command]
pub async fn move_head_back(repo_path: String, head_id: String, commit_id: String, mode: String) -> AppResult<String> {
    blocking(move || run_move_head_back(&repo_path, &head_id, &commit_id, &mode)).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::git::reflog::ReflogAction;
    use crate::test_support::{BareRemote, TestRepo};

    fn last(repo: &TestRepo) -> LastAction {
        reflog::last_action(&repo.open()).unwrap()
    }

    #[test]
    fn reads_the_reflog_in_pages_newest_first() {
        let repo = TestRepo::new();
        repo.write("a.txt", "1\n");
        let first = repo.commit_all("First");
        repo.write("a.txt", "2\n");
        let second = repo.commit_all("Second");
        repo.git(&["commit", "-q", "--amend", "-m", "Second, fixed"]);
        let amended = repo.head();
        repo.branch("topic");
        repo.checkout("topic");
        repo.git(&["reset", "-q", "--hard", &first]);

        let page = run_get_reflog(&repo.path_string(), "HEAD", 0, 2).unwrap();
        assert_eq!(page.total, 5);
        assert_eq!(page.ref_name, "HEAD");
        let actions: Vec<ReflogAction> = page.entries.iter().map(|entry| entry.action).collect();
        assert_eq!(actions, vec![ReflogAction::Reset, ReflogAction::Checkout]);
        assert_eq!(page.entries[0].selector, "HEAD@{0}");
        assert_eq!(page.entries[0].old_id, amended);
        assert_eq!(page.entries[0].new_id, first);
        assert_eq!(page.entries[1].checkout_from.as_deref(), Some("main"));

        let rest = run_get_reflog(&repo.path_string(), "", 2, 10).unwrap();
        let actions: Vec<ReflogAction> = rest.entries.iter().map(|entry| entry.action).collect();
        assert_eq!(actions, vec![ReflogAction::Amend, ReflogAction::Commit, ReflogAction::InitialCommit]);
        assert_eq!(rest.entries[0].old_id, second);
        assert_eq!(rest.entries[2].index, 4);
        assert!(Oid::from_str(&rest.entries[2].old_id).unwrap().is_zero());

        let branch = run_get_reflog(&repo.path_string(), "topic", 0, 10).unwrap();
        assert_eq!(branch.ref_name, "refs/heads/topic");
        assert_eq!(branch.entries[0].selector, "topic@{0}");
        assert_eq!(branch.total, 2);
        assert!(run_get_reflog(&repo.path_string(), "--all", 0, 10).is_err());
        assert!(run_get_reflog(&repo.path_string(), "missing", 0, 10).unwrap().entries.is_empty());
    }

    #[test]
    fn last_action_knows_the_branch_the_checkout_came_from() {
        let repo = TestRepo::new();
        repo.write("a.txt", "1\n");
        repo.commit_all("First");
        repo.branch("topic");
        repo.checkout("topic");
        let action = last(&repo);
        let entry = action.entry.unwrap();
        assert_eq!(entry.action, ReflogAction::Checkout);
        assert_eq!(entry.checkout_from.as_deref(), Some("main"));
        assert!(action.from_branch_exists);
        assert_eq!(action.branch.as_deref(), Some("topic"));
        assert!(!action.pushed);
    }

    #[test]
    fn last_action_is_pushed_once_a_remote_has_the_commit() {
        let remote = BareRemote::new();
        let repo = TestRepo::new();
        repo.git(&["remote", "add", "origin", &remote.path_string()]);
        repo.write("a.txt", "1\n");
        repo.commit_all("First");
        repo.git(&["push", "-q", "-u", "origin", "main"]);
        repo.write("a.txt", "2\n");
        repo.commit_all("Second");
        assert!(!last(&repo).pushed, "the new commit is only local");
        repo.git(&["push", "-q"]);
        assert!(last(&repo).pushed);
    }

    #[test]
    fn undoes_a_commit_softly_and_keeps_its_changes_staged() {
        let repo = TestRepo::new();
        repo.write("a.txt", "1\n");
        let first = repo.commit_all("First");
        repo.write("a.txt", "2\n");
        let second = repo.commit_all("Second");
        let used = run_move_head_back(&repo.path_string(), &second, &first, "soft").unwrap();
        assert_eq!(used, "soft");
        assert_eq!(repo.head(), first);
        assert_eq!(repo.porcelain().trim(), "M  a.txt");
    }

    #[test]
    fn undoes_an_amend_back_to_the_old_commit() {
        let repo = TestRepo::new();
        repo.write("a.txt", "1\n");
        let first = repo.commit_all("First");
        repo.git(&["commit", "-q", "--amend", "-m", "First, renamed"]);
        let amended = repo.head();
        let entry = last(&repo).entry.unwrap();
        assert_eq!(entry.action, ReflogAction::Amend);
        assert_eq!(entry.old_id, first);
        run_move_head_back(&repo.path_string(), &amended, &entry.old_id, "soft").unwrap();
        assert_eq!(repo.head(), first);
    }

    #[test]
    fn undoes_a_hard_reset_and_a_merge_without_losing_local_changes() {
        let repo = TestRepo::new();
        repo.write("a.txt", "1\n");
        let first = repo.commit_all("First");
        repo.write("b.txt", "b\n");
        let second = repo.commit_all("Second");
        repo.git(&["reset", "-q", "--hard", &first]);
        let entry = last(&repo).entry.unwrap();
        assert_eq!(entry.action, ReflogAction::Reset);
        assert_eq!(run_move_head_back(&repo.path_string(), &first, &entry.old_id, "keep").unwrap(), "keep");
        assert_eq!(repo.head(), second);
        assert!(repo.exists("b.txt"), "the reset is undone in the work tree too");

        // A local change to a file the undo would rewrite: --keep refuses, --mixed keeps it.
        repo.git(&["reset", "-q", "--hard", &first]);
        repo.write("b.txt", "mine\n");
        let used = run_move_head_back(&repo.path_string(), &first, &second, "keep").unwrap();
        assert_eq!(used, "mixed");
        assert_eq!(repo.head(), second);
        assert_eq!(repo.read_text("b.txt"), "mine\n");

        repo.git(&["checkout", "-q", "--", "b.txt"]);
        repo.git(&["checkout", "-q", "-b", "topic", &first]);
        repo.write("c.txt", "c\n");
        repo.commit_all("Topic");
        repo.checkout("main");
        repo.git(&["merge", "-q", "--no-edit", "--no-ff", "topic"]);
        let merged = repo.head();
        let entry = last(&repo).entry.unwrap();
        assert_eq!(entry.action, ReflogAction::Merge);
        run_move_head_back(&repo.path_string(), &merged, &entry.old_id, "keep").unwrap();
        assert_eq!(repo.head(), second);
        assert!(!repo.exists("c.txt"));
    }

    #[test]
    fn refuses_an_undo_once_head_moved_on() {
        let repo = TestRepo::new();
        repo.write("a.txt", "1\n");
        let first = repo.commit_all("First");
        repo.write("a.txt", "2\n");
        let second = repo.commit_all("Second");
        repo.write("a.txt", "3\n");
        repo.commit_all("Third");
        let refused = run_move_head_back(&repo.path_string(), &second, &first, "soft");
        assert!(matches!(refused, Err(AppError::Invalid(_))), "{refused:?}");
        assert!(run_move_head_back(&repo.path_string(), &repo.head(), "--hard", "soft").is_err());
        assert!(run_move_head_back(&repo.path_string(), &repo.head(), &first, "hard").is_err());
    }
}
