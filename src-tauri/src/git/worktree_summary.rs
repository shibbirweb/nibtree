//! What the top bar's worktree switcher shows for each worktree of a repository: its changed and conflicted
//! files, how far it is ahead of and behind its upstream, a merge or rebase in progress, and when it last changed.
//! Read on demand when the switcher opens, one status walk per worktree, so nothing is kept or polled.

use std::path::Path;
use std::time::UNIX_EPOCH;

use git2::Repository;
use serde::Serialize;

use super::opstate::OpKind;
use super::status;
use super::worktree::{self, WorktreeInfo};
use crate::error::AppResult;

/// At most this many changed files are looked at for the last activity; the rest are past the point.
const ACTIVITY_FILES: usize = 2000;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorktreeSummary {
    #[serde(flatten)]
    pub info: WorktreeInfo,
    /// Changed files, staged or not, untracked and conflicted ones included.
    pub changes: usize,
    pub conflicts: usize,
    pub upstream: Option<String>,
    pub ahead: usize,
    pub behind: usize,
    /// A merge, rebase, cherry-pick or revert stopped in it.
    pub op: OpKind,
    /// Milliseconds since 1970 of the latest of: HEAD moving (its reflog), the index, a changed file.
    pub last_activity: Option<i64>,
}

/// Every worktree of the repository at `repo_path`, in `worktree::list` order. A worktree that cannot be read
/// (its folder is gone, or it is bare) has no counts rather than failing the list.
pub fn summaries(repo_path: &str) -> AppResult<Vec<WorktreeSummary>> {
    Ok(worktree::list(repo_path)?.into_iter().map(summary).collect())
}

fn summary(info: WorktreeInfo) -> WorktreeSummary {
    let mut summary = WorktreeSummary {
        info,
        changes: 0,
        conflicts: 0,
        upstream: None,
        ahead: 0,
        behind: 0,
        op: OpKind::None,
        last_activity: None,
    };
    if summary.info.prunable || summary.info.bare {
        return summary;
    }
    let Ok(repo) = Repository::open(&summary.info.path) else {
        return summary;
    };
    let Ok(status) = status::read(&repo) else {
        return summary;
    };
    summary.changes = status.files.len();
    summary.conflicts = status.files.iter().filter(|file| file.conflicted).count();
    summary.upstream = status.head.upstream;
    summary.ahead = status.head.ahead;
    summary.behind = status.head.behind;
    summary.op = status.op.kind;
    let changed: Vec<&str> = status.files.iter().take(ACTIVITY_FILES).map(|file| file.path.as_str()).collect();
    summary.last_activity = last_activity(&repo, &changed);
    summary
}

fn modified_ms(path: &Path) -> Option<i64> {
    let modified = std::fs::metadata(path).ok()?.modified().ok()?;
    Some(modified.duration_since(UNIX_EPOCH).ok()?.as_millis() as i64)
}

fn last_activity(repo: &Repository, changed: &[&str]) -> Option<i64> {
    // The newest reflog entry comes first: a commit, checkout, reset or pull in this worktree.
    let moved = repo
        .reflog("HEAD")
        .ok()
        .and_then(|reflog| reflog.get(0).map(|entry| entry.committer().when().seconds() * 1000));
    // Each worktree has its own index in its own git folder.
    let indexed = modified_ms(&repo.path().join("index"));
    let edited = repo
        .workdir()
        .and_then(|workdir| changed.iter().filter_map(|path| modified_ms(&workdir.join(path))).max());
    [moved, indexed, edited].into_iter().flatten().max()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::*;

    fn sibling(repo: &TestRepo, name: &str) -> String {
        repo.path.parent().expect("repo parent").join(name).ui()
    }

    #[test]
    fn summaries_count_changes_conflicts_and_operations_per_worktree() {
        let repo = TestRepo::new();
        repo.write("a.txt", "base\n");
        repo.commit_all("base");
        let main = repo.path_string();
        let linked = sibling(&repo, "wt-summary");
        repo.git(&["worktree", "add", "-q", "-b", "side", &linked]);
        std::fs::write(Path::new(&linked).join("new.txt"), "new\n").unwrap();
        std::fs::write(Path::new(&linked).join("a.txt"), "changed\n").unwrap();

        let list = summaries(&main).unwrap();
        assert_eq!(list.len(), 2);
        assert!(list[0].info.is_main && list[0].info.is_current);
        assert_eq!((list[0].changes, list[0].conflicts, list[0].op), (0, 0, OpKind::None));
        let side = &list[1];
        assert_eq!(side.info.branch.as_deref(), Some("side"));
        assert_eq!(side.changes, 2);
        assert!(side.last_activity.is_some());

        // A merge that stops on a conflict in the main worktree.
        git_in(Path::new(&linked), &["commit", "-qam", "side change"]);
        repo.write("a.txt", "main change\n");
        repo.commit_all("main change");
        assert!(!repo.git_raw(&["merge", "side"]).status.success());
        let merging = &summaries(&main).unwrap()[0];
        assert_eq!(merging.op, OpKind::Merge);
        assert_eq!(merging.conflicts, 1);
    }

    #[test]
    fn a_worktree_whose_folder_is_gone_has_no_counts() {
        let repo = TestRepo::new();
        repo.write("a.txt", "base\n");
        repo.commit_all("base");
        let linked = sibling(&repo, "wt-gone");
        repo.git(&["worktree", "add", "-q", "-b", "gone", &linked]);
        std::fs::remove_dir_all(&linked).unwrap();
        let list = summaries(&repo.path_string()).unwrap();
        let gone = list.iter().find(|summary| summary.info.branch.as_deref() == Some("gone")).unwrap();
        assert!(gone.info.prunable);
        assert_eq!((gone.changes, gone.last_activity), (0, None));
    }
}
