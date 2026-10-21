//! Every git tool end to end, the way an AI client or `nibtree cli call` uses them: through the real server, on real
//! temporary repositories, with each result checked with plain git. The app's own buttons run the same commands.

mod branches;
mod changes;
mod operations;

use std::collections::HashMap;

use serde_json::{json, Value};

use super::{text_of, Fixture};
use crate::mcp::tools;
use crate::test_support::{BareRemote, TestRepo};

/// The server with every git tool on, the destructive ones too (they start off), and one repository in the workspace.
struct Git {
    fixture: Fixture,
    repo: TestRepo,
    repo_path: String,
}

impl Git {
    fn new(repo: TestRepo) -> Git {
        let states: HashMap<String, bool> = tools::all()
            .filter(|tool| tool.name.starts_with("git_"))
            .map(|tool| (tool.name.to_string(), true))
            .collect();
        let fixture = Fixture::with_states(true, false, states);
        let repo_path = repo.path_string();
        fixture.mcp.set_workspace(std::slice::from_ref(&repo_path));
        Git { fixture, repo, repo_path }
    }

    fn result(&self, tool_name: &str, mut arguments: Value) -> Value {
        if arguments.get("repoPath").is_none() {
            arguments["repoPath"] = json!(self.repo_path);
        }
        self.fixture.call(tool_name, arguments)
    }

    /// Calls a tool that must succeed; returns its structured answer, or its text when it has none.
    fn ok(&self, tool_name: &str, arguments: Value) -> Value {
        let result = self.result(tool_name, arguments);
        assert_eq!(result["isError"], false, "{tool_name}: {}", text_of(&result));
        match result.get("structuredContent") {
            Some(content) if !content.is_null() => content.clone(),
            _ => json!(text_of(&result)),
        }
    }

    /// Calls a tool that must fail; returns its error text.
    fn fails(&self, tool_name: &str, arguments: Value) -> String {
        let result = self.result(tool_name, arguments);
        assert_eq!(result["isError"], true, "{tool_name} should have failed: {result}");
        text_of(&result)
    }

    fn write_and_stage(&self, file_path: &str, content: &str) {
        self.repo.write(file_path, content);
        self.ok("git_stage", json!({ "filePaths": [file_path] }));
    }

    fn commit_file(&self, file_path: &str, content: &str, message: &str) {
        self.write_and_stage(file_path, content);
        self.ok("git_commit", json!({ "message": message }));
    }

    fn subject(&self) -> String {
        self.repo.git(&["log", "-1", "--format=%s"]).trim().to_string()
    }

    fn current_branch(&self) -> String {
        self.repo.git(&["branch", "--show-current"]).trim().to_string()
    }
}

/// A clone of a remote that another clone has pushed to since, so it is one commit behind without knowing yet.
fn behind_its_remote() -> (BareRemote, TestRepo) {
    let remote = BareRemote::new();
    let seed = TestRepo::clone_from(&remote);
    seed.write("notes.txt", "line 1\nline 2\nline 3\n");
    seed.commit_all("first commit");
    seed.git(&["push", "-q", "-u", "origin", "main"]);
    let repo = TestRepo::clone_from(&remote);
    seed.write("other.txt", "from another clone\n");
    seed.commit_all("change from another clone");
    seed.git(&["push", "-q"]);
    (remote, repo)
}

/// A repository with one commit and `notes.txt`.
fn one_commit() -> TestRepo {
    let repo = TestRepo::new();
    repo.write("notes.txt", "line 1\nline 2\nline 3\n");
    repo.commit_all("first commit");
    repo
}
