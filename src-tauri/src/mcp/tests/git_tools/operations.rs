//! Merges and rebases that stop on conflicts, then continue or abort, and finding the repositories of a workspace.

use serde_json::json;

use super::super::Fixture;
use super::{one_commit, Git};
use crate::test_support::{merge_conflict_repo, TestDir};

fn has_merge_head(git: &Git) -> bool {
    git.repo.path.join(".git").join("MERGE_HEAD").exists()
}

#[test]
fn a_rebase_that_stops_on_a_conflict_lists_it_and_aborts() {
    let git = Git::new(one_commit());
    git.ok("git_create_branch", json!({ "branchName": "clash", "checkout": true }));
    git.commit_file("notes.txt", "clash side\n", "clash side");
    git.ok("git_checkout", json!({ "branchName": "main" }));
    git.commit_file("notes.txt", "main side\n", "main side");
    git.ok("git_checkout", json!({ "branchName": "clash" }));

    let stopped = git.ok("git_rebase", json!({ "onto": "main" }));
    assert_eq!(stopped["conflicts"], true, "{stopped}");
    let conflicts = git.ok("git_conflicts", json!({}));
    assert_eq!(conflicts["files"][0]["path"], "notes.txt");
    assert_eq!(conflicts["op"]["kind"], "rebase");

    git.ok("git_abort_operation", json!({}));
    assert_eq!(git.repo.unmerged(), "");
    assert_eq!(git.current_branch(), "clash");
    assert_eq!(git.subject(), "clash side");
}

#[test]
fn every_kind_of_merge_conflict_is_listed_resolved_and_continued() {
    let git = Git::new(merge_conflict_repo());
    let conflicts = git.ok("git_conflicts", json!({}));
    let mut listed: Vec<(String, String, bool)> = conflicts["files"]
        .as_array()
        .unwrap()
        .iter()
        .map(|file| {
            let text = |key: &str| file[key].as_str().unwrap().to_string();
            (text("path"), text("kind"), file["binary"] == true)
        })
        .collect();
    listed.sort();
    let expected = [
        ("added.txt", "bothAdded", false),
        ("both.txt", "bothModified", false),
        ("crlf.txt", "bothModified", false),
        ("deleted_by_them.txt", "deletedByThem", false),
        ("deleted_by_us.txt", "deletedByUs", false),
        ("image.bin", "bothModified", true),
    ];
    let expected: Vec<(String, String, bool)> =
        expected.iter().map(|(path, kind, binary)| (path.to_string(), kind.to_string(), *binary)).collect();
    assert_eq!(listed, expected);
    assert_eq!(conflicts["op"]["kind"], "merge");

    for file_path in ["added.txt", "both.txt", "crlf.txt"] {
        git.repo.write(file_path, "resolved\n");
    }
    git.repo.remove("deleted_by_us.txt");
    let all = ["added.txt", "both.txt", "crlf.txt", "deleted_by_them.txt", "deleted_by_us.txt", "image.bin"];
    git.ok("git_stage", json!({ "filePaths": all }));
    assert_eq!(git.repo.unmerged(), "");

    git.ok("git_continue_operation", json!({}));
    assert!(!has_merge_head(&git));
    assert_eq!(git.repo.parent_count("HEAD"), 2);
    assert_eq!(git.repo.porcelain(), "");
    assert!(!git.repo.exists("deleted_by_us.txt"));
}

#[test]
fn a_merge_resolved_by_hand_continues() {
    let git = Git::new(one_commit());
    git.ok("git_create_branch", json!({ "branchName": "clash", "checkout": false }));
    git.commit_file("notes.txt", "main side\n", "main side");
    git.ok("git_checkout", json!({ "branchName": "clash" }));
    git.commit_file("notes.txt", "clash side\n", "clash side");
    git.ok("git_checkout", json!({ "branchName": "main" }));

    let stopped = git.ok("git_merge", json!({ "branchName": "clash" }));
    assert_eq!(stopped["conflicts"], true, "{stopped}");
    assert!(has_merge_head(&git));
    git.write_and_stage("notes.txt", "resolved\n");
    git.ok("git_continue_operation", json!({}));
    assert!(!has_merge_head(&git));
    assert_eq!(git.repo.read_text("notes.txt"), "resolved\n");
}

#[test]
fn an_abort_that_git_refuses_is_an_error_with_its_reason() {
    let git = Git::new(one_commit());
    git.repo.write("other.txt", "other\n");
    git.repo.commit_all("other file");
    git.ok("git_create_branch", json!({ "branchName": "clash", "checkout": false }));
    git.commit_file("notes.txt", "main side\n", "main side");
    git.ok("git_checkout", json!({ "branchName": "clash" }));
    git.commit_file("notes.txt", "clash side\n", "clash side");
    git.ok("git_checkout", json!({ "branchName": "main" }));
    git.ok("git_merge", json!({ "branchName": "clash" }));
    // Staged and then changed again: `git merge --abort` refuses to throw that away.
    git.write_and_stage("other.txt", "staged\n");
    git.repo.write("other.txt", "staged, then changed again\n");

    // It used to come back as "stopped with conflicts", which hid git's reason and suggested continuing.
    let refused = git.fails("git_abort_operation", json!({}));
    assert!(refused.contains("other.txt"), "{refused}");
    assert!(has_merge_head(&git), "the merge is still in progress");
    assert_eq!(git.repo.read_text("other.txt"), "staged, then changed again\n");
}

#[test]
fn the_workspace_lists_nested_repositories_and_a_plain_folder_is_not_one() {
    let fixture = Fixture::new(true, false);
    let folder = TestDir::new();
    folder.init_repo("apps/web");
    folder.init_repo("apps/web/packages/ui");
    folder.init_repo("libs/shared");
    folder.write("docs/readme.md", "not a repository\n");
    fixture.mcp.set_workspace(&[folder.path_string()]);

    let workspace = fixture.call("list_workspace", json!({}));
    let mut repos: Vec<String> = workspace["structuredContent"]["folders"][0]["repos"]
        .as_array()
        .unwrap()
        .iter()
        .map(|repo| repo["relativePath"].as_str().unwrap().to_string())
        .collect();
    repos.sort();
    assert_eq!(repos, ["apps/web", "apps/web/packages/ui", "libs/shared"]);

    let plain = fixture.call("git_status", json!({ "repoPath": folder.file_string("docs") }));
    assert_eq!(plain["isError"], true, "{plain}");
    assert!(super::super::text_of(&plain).contains("Not a git repository"), "{plain}");
}
