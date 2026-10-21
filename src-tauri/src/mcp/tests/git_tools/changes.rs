//! Reading a repository, staging, committing and syncing with a remote.

use serde_json::json;

use super::{behind_its_remote, one_commit, Git};

#[test]
fn fetch_and_pull_bring_in_a_commit_from_another_clone() {
    let (_remote, repo) = behind_its_remote();
    let git = Git::new(repo);

    let status = git.ok("git_status", json!({}));
    assert_eq!(status["head"]["branch"], "main");
    assert!(git.ok("git_remotes", json!({})).to_string().contains("origin"));
    assert!(git.ok("git_branches", json!({})).to_string().contains("main"));

    git.ok("git_fetch", json!({}));
    assert_eq!(git.repo.git(&["rev-list", "--count", "main..origin/main"]).trim(), "1");
    git.ok("git_pull", json!({}));
    assert!(git.repo.exists("other.txt"));
    assert_eq!(git.repo.head(), git.repo.rev_parse("origin/main"));
}

#[test]
fn stage_unstage_discard_and_commit() {
    let git = Git::new(one_commit());
    git.repo.write("notes.txt", "line 1\nline 2 changed\nline 3\n");
    git.repo.write("new.txt", "brand new\n");

    let status = git.ok("git_status", json!({})).to_string();
    assert!(status.contains("notes.txt") && status.contains("new.txt"), "{status}");
    let diff = git.ok("git_diff", json!({})).to_string();
    assert!(diff.contains("line 2 changed"), "{diff}");

    git.ok("git_stage", json!({ "filePaths": ["new.txt"] }));
    assert_eq!(git.repo.git(&["diff", "--cached", "--name-only"]).trim(), "new.txt");
    git.ok("git_unstage", json!({ "filePaths": ["new.txt"] }));
    assert_eq!(git.repo.git(&["diff", "--cached", "--name-only"]).trim(), "");
    git.fails("git_commit", json!({ "message": "nothing staged" }));

    git.ok("git_discard", json!({ "filePaths": ["notes.txt"] }));
    assert_eq!(git.repo.read_text("notes.txt"), "line 1\nline 2\nline 3\n");
    git.ok("git_discard", json!({ "filePaths": ["new.txt"] }));
    assert!(!git.repo.exists("new.txt"), "an untracked file is removed too");

    git.repo.write("notes.txt", "line 1\nline 2 changed\nline 3\n");
    git.ok("git_stage", json!({ "filePaths": ["notes.txt"] }));
    git.ok("git_commit", json!({ "message": "edit notes" }));
    assert_eq!(git.subject(), "edit notes");
    assert_eq!(git.repo.porcelain(), "");
}

#[test]
fn history_tools_follow_a_line_through_commits() {
    let git = Git::new(one_commit());
    git.commit_file("notes.txt", "line 1\nline 2 changed\nline 3\n", "edit notes");
    let head = git.repo.head();

    assert!(git.ok("git_log", json!({ "limit": 3 })).to_string().contains("edit notes"));
    let shown = git.ok("git_show_commit", json!({ "commitId": head, "includePatch": true })).to_string();
    assert!(shown.contains("edit notes") && shown.contains("line 2 changed"), "{shown}");
    let blame = git.ok("git_blame", json!({ "filePath": "notes.txt", "startLine": 2, "endLine": 2 }));
    assert_eq!(blame["lines"][0]["summary"], "edit notes");
    let history = git.ok("git_file_history", json!({ "filePath": "notes.txt" })).to_string();
    assert!(history.contains("edit notes") && history.contains("first commit"), "{history}");
    let line = git.ok("git_line_history", json!({ "filePath": "notes.txt", "startLine": 2, "endLine": 2 })).to_string();
    assert!(line.contains("edit notes"), "{line}");
}

#[test]
fn undo_amend_sign_off_and_another_author() {
    let git = Git::new(one_commit());
    git.commit_file("notes.txt", "changed\n", "edit notes");

    git.ok("git_undo_last_commit", json!({}));
    assert_eq!(git.subject(), "first commit");
    assert!(git.repo.porcelain().contains("notes.txt"), "the changes are kept");

    git.ok("git_commit", json!({ "message": "edit notes", "all": true, "signOff": true }));
    assert!(git.repo.head_message().contains("Signed-off-by: Test User <test@example.com>"));
    git.ok("git_commit", json!({ "message": "edit notes, amended", "amend": true }));
    assert_eq!(git.subject(), "edit notes, amended");
    assert_eq!(git.repo.git(&["rev-list", "--count", "HEAD"]).trim(), "2");

    git.write_and_stage("author.txt", "x\n");
    git.ok("git_commit", json!({ "message": "by someone else", "author": "Someone Else <someone@example.com>" }));
    assert_eq!(git.repo.git(&["log", "-1", "--format=%an <%ae>"]).trim(), "Someone Else <someone@example.com>");
}

#[test]
fn a_failing_hook_blocks_the_commit_unless_skipped() {
    let git = Git::new(one_commit());
    let hooks = tempfile::TempDir::new().unwrap();
    let hook = hooks.path().join("pre-commit");
    std::fs::write(&hook, "#!/bin/sh\necho 'blocked by hook' >&2\nexit 1\n").unwrap();
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&hook, std::fs::Permissions::from_mode(0o755)).unwrap();
    }
    git.repo.git(&["config", "core.hooksPath", &hooks.path().to_string_lossy()]);

    git.write_and_stage("hooked.txt", "x\n");
    let refused = git.fails("git_commit", json!({ "message": "should fail" }));
    assert!(refused.contains("blocked by hook"), "{refused}");
    assert_eq!(git.subject(), "first commit");
    git.ok("git_commit", json!({ "message": "skipped hook", "noVerify": true }));
    assert_eq!(git.subject(), "skipped hook");
}

#[test]
fn file_names_with_spaces_and_unicode() {
    let git = Git::new(one_commit());
    let odd = "docs and notes/my file ü (copy).txt";
    git.repo.write(odd, "odd name\n");
    git.ok("git_stage", json!({ "filePaths": [odd] }));
    let staged = git.repo.git(&["-c", "core.quotepath=off", "diff", "--cached", "--name-only"]);
    assert_eq!(staged.trim(), odd);
    git.ok("git_commit", json!({ "message": "odd name" }));
    assert_eq!(git.repo.porcelain(), "");
}

#[test]
fn the_git_console_lists_what_the_tools_ran() {
    let git = Git::new(one_commit());
    crate::git_console::global().set_enabled(true);
    git.commit_file("notes.txt", "changed\n", "edit notes");
    let entries = git.ok("git_console_entries", json!({})).to_string();
    assert!(entries.contains("commit"), "{entries}");
}
