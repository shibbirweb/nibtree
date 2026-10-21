//! Pushing, branches and merges, tags, stashes and rewriting history.

use serde_json::json;

use super::{behind_its_remote, one_commit, Git};

#[test]
fn push_sends_the_branch_and_push_tags_works_without_a_remote_name() {
    let (remote, repo) = behind_its_remote();
    let git = Git::new(repo);
    git.ok("git_pull", json!({}));
    git.commit_file("notes.txt", "changed\n", "edit notes");
    git.ok("git_tag_create", json!({ "tagName": "v1.0", "message": "first release" }));
    assert_eq!(git.repo.git(&["cat-file", "-t", "v1.0"]).trim(), "tag");

    // pushTags used to be dropped without a word unless remoteName was given too.
    git.ok("git_push", json!({ "pushTags": true }));
    let remote_git = |args: &[&str]| crate::test_support::git_in(&remote.path, args);
    assert_eq!(remote_git(&["rev-parse", "main"]).trim(), git.repo.head());
    assert_eq!(remote_git(&["tag"]).trim(), "v1.0");

    git.ok("git_tag_create", json!({ "tagName": "v1.1" }));
    git.ok("git_push", json!({ "remoteName": "origin", "pushTags": true }));
    assert!(remote_git(&["tag"]).contains("v1.1"));
}

#[test]
fn create_switch_compare_merge_and_delete_a_branch() {
    let git = Git::new(one_commit());
    git.ok("git_create_branch", json!({ "branchName": "feature", "checkout": true }));
    assert_eq!(git.current_branch(), "feature");
    git.commit_file("feature.txt", "feature work\n", "feature work");

    git.ok("git_checkout", json!({ "branchName": "main" }));
    assert_eq!(git.current_branch(), "main");
    let compared = git.ok("git_compare_branches", json!({ "baseName": "main", "branchName": "feature" })).to_string();
    assert!(compared.contains("feature work"), "{compared}");

    git.ok("git_merge", json!({ "branchName": "feature", "noFf": true }));
    assert_eq!(git.repo.parent_count("HEAD"), 2);
    assert!(git.repo.exists("feature.txt"));

    git.ok("git_delete_branch", json!({ "branchName": "feature" }));
    assert!(!git.repo.git(&["branch", "--format=%(refname:short)"]).lines().any(|name| name == "feature"));
    git.fails("git_delete_branch", json!({ "branchName": "main" }));
}

#[test]
fn stash_push_list_apply_pop_and_drop() {
    let git = Git::new(one_commit());
    git.repo.write("notes.txt", "stashed change\n");
    git.repo.write("untracked.txt", "untracked\n");

    git.ok("git_stash_push", json!({ "message": "wip", "includeUntracked": true }));
    assert_eq!(git.repo.porcelain(), "");
    assert!(git.ok("git_stashes", json!({})).to_string().contains("wip"));

    git.ok("git_stash_apply", json!({ "stashIndex": 0 }));
    assert_eq!(git.repo.read_text("notes.txt"), "stashed change\n");
    assert!(git.repo.exists("untracked.txt"));
    assert_ne!(git.repo.git(&["stash", "list"]), "", "apply keeps the stash");
    git.ok("git_stash_drop", json!({ "stashIndex": 0 }));
    assert_eq!(git.repo.git(&["stash", "list"]), "");

    git.ok("git_stash_push", json!({ "message": "to pop" }));
    assert_eq!(git.repo.read_text("notes.txt"), "line 1\nline 2\nline 3\n");
    git.ok("git_stash_pop", json!({ "stashIndex": 0 }));
    assert_eq!(git.repo.read_text("notes.txt"), "stashed change\n");
    assert_eq!(git.repo.git(&["stash", "list"]), "", "pop removes the stash");
}

#[test]
fn cherry_pick_revert_and_reset() {
    let git = Git::new(one_commit());
    git.ok("git_create_branch", json!({ "branchName": "pick", "checkout": true }));
    git.commit_file("picked.txt", "picked\n", "to cherry-pick");
    let picked = git.repo.head();
    git.ok("git_checkout", json!({ "branchName": "main" }));
    // main moves on first, so the pick makes a new commit rather than the same one.
    git.commit_file("main.txt", "main\n", "main moved on");

    git.ok("git_cherry_pick", json!({ "commitId": picked }));
    assert_eq!(git.subject(), "to cherry-pick");
    assert_ne!(git.repo.head(), picked);
    assert!(git.repo.exists("picked.txt"));

    git.ok("git_revert", json!({ "commitId": git.repo.head() }));
    assert!(git.subject().starts_with("Revert \"to cherry-pick\""), "{}", git.subject());
    assert!(!git.repo.exists("picked.txt"));

    let before = git.repo.rev_parse("HEAD~1");
    git.ok("git_reset", json!({ "mode": "soft", "revision": "HEAD~1" }));
    assert_eq!(git.repo.head(), before);
    assert!(git.repo.porcelain().contains("picked.txt"), "a soft reset keeps the changes staged");
    git.ok("git_reset", json!({ "mode": "hard", "revision": "HEAD" }));
    assert_eq!(git.repo.porcelain(), "");
}

#[test]
fn rebase_a_branch_onto_main() {
    let git = Git::new(one_commit());
    git.ok("git_create_branch", json!({ "branchName": "topic", "checkout": true }));
    git.commit_file("topic.txt", "topic\n", "topic work");
    git.ok("git_checkout", json!({ "branchName": "main" }));
    git.commit_file("main.txt", "main moved on\n", "main moved on");

    git.ok("git_rebase", json!({ "onto": "main", "branchName": "topic" }));
    assert_eq!(git.current_branch(), "topic");
    assert_eq!(git.repo.git(&["merge-base", "topic", "main"]).trim(), git.repo.rev_parse("main"));
    assert_eq!(git.repo.git(&["rev-list", "--count", "main..topic"]).trim(), "1");
}
