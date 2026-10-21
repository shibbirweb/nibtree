//! Git writes, through the same commands (and git CLI calls) as the app's buttons, so they
//! run hooks and credential helpers and show in the Git Console.

use serde_json::{json, Value};

use super::{done, files_prop, json_out, object, repo_prop, wait, Args, BackendTool, ToolCtx, ToolResult, GIT};
use crate::commands::commit_options::CommitOptions;
use crate::commands::integrate::{MergeOptions, RebaseOptions};
use crate::commands::remote::{self, PullMode};
use crate::commands::{self as app, reject_option, OpOutcome};
use crate::git::repo as git_repo;
use crate::git::status::{self, ChangeKind};
use crate::mcp::paths;

const CONFLICT_HINT: &str =
    "Stopped with conflicts. List them with git_conflicts, fix the files, stage them, then call git_continue_operation (or git_abort_operation).";

fn outcome(result: OpOutcome) -> ToolResult {
    let hint = result.conflicts.then_some(CONFLICT_HINT);
    json_out(json!({ "output": result.output, "conflicts": result.conflicts, "hint": hint }))
}

fn quiet() -> impl FnMut(&str) {
    |_line: &str| {}
}

fn checked<'a>(value: &'a str, what: &str) -> Result<&'a str, String> {
    reject_option(value, what).map_err(|err| err.to_string())?;
    Ok(value)
}

fn repo_only() -> Value {
    object(json!({ "repoPath": repo_prop() }), &["repoPath"])
}

fn repo_files_schema() -> Value {
    object(
        json!({ "repoPath": repo_prop(), "filePaths": files_prop("The files or folders.") }),
        &["repoPath", "filePaths"],
    )
}

pub const TOOLS: &[BackendTool] = &[
    BackendTool {
        name: "git_stage",
        title: "Stage files",
        description: "Stages files or folders (git add -A), including new and deleted files.",
        category: GIT,
        read_only: false,
        destructive: false,
        schema: repo_files_schema,
        run: git_stage,
    },
    BackendTool {
        name: "git_unstage",
        title: "Unstage files",
        description: "Removes files from the staging area and keeps their changes in the work tree.",
        category: GIT,
        read_only: false,
        destructive: false,
        schema: repo_files_schema,
        run: git_unstage,
    },
    BackendTool {
        name: "git_discard",
        title: "Discard changes",
        description: "Throws away unstaged changes: tracked files go back to their staged version and new (untracked) files are deleted. This cannot be undone.",
        category: GIT,
        read_only: false,
        destructive: true,
        schema: repo_files_schema,
        run: git_discard,
    },
    BackendTool {
        name: "git_commit",
        title: "Commit",
        description: "Commits the staged changes, or every tracked change with all, or only filePaths. Can amend the last commit, add a Signed-off-by line, set another author or skip hooks.",
        category: GIT,
        read_only: false,
        destructive: false,
        schema: commit_schema,
        run: git_commit,
    },
    BackendTool {
        name: "git_undo_last_commit",
        title: "Undo last commit",
        description: "Undoes the last commit with git reset --soft HEAD~1: its changes stay staged. Returns its message.",
        category: GIT,
        read_only: false,
        destructive: false,
        schema: repo_only,
        run: git_undo_last_commit,
    },
    BackendTool {
        name: "git_create_branch",
        title: "Create branch",
        description: "Creates a branch at HEAD or startPoint, and switches to it unless checkout is false.",
        category: GIT,
        read_only: false,
        destructive: false,
        schema: create_branch_schema,
        run: git_create_branch,
    },
    BackendTool {
        name: "git_checkout",
        title: "Check out",
        description: "Switches to a local branch, or to a remote branch (origin/name) as a new tracking branch, or detaches HEAD at commitId.",
        category: GIT,
        read_only: false,
        destructive: false,
        schema: checkout_schema,
        run: git_checkout,
    },
    BackendTool {
        name: "git_delete_branch",
        title: "Delete branch",
        description: "Deletes a local branch. Without force, git refuses when it has commits not merged anywhere.",
        category: GIT,
        read_only: false,
        destructive: true,
        schema: delete_branch_schema,
        run: git_delete_branch,
    },
    BackendTool {
        name: "git_fetch",
        title: "Fetch",
        description: "Downloads new commits and branches from the default remote, or every remote with allRemotes.",
        category: GIT,
        read_only: false,
        destructive: false,
        schema: fetch_schema,
        run: git_fetch,
    },
    BackendTool {
        name: "git_pull",
        title: "Pull",
        description: "Fetches and integrates the upstream branch (or branchName from remoteName) by merge, rebase or fast-forward only. Without mode the repository's pull settings decide.",
        category: GIT,
        read_only: false,
        destructive: false,
        schema: pull_schema,
        run: git_pull,
    },
    BackendTool {
        name: "git_push",
        title: "Push",
        description: "Pushes the current branch to its upstream (setting it on the first push), or to remoteName/remoteBranch. force uses --force-with-lease. This publishes commits.",
        category: GIT,
        read_only: false,
        destructive: true,
        schema: push_schema,
        run: git_push,
    },
    BackendTool {
        name: "clone_repository",
        title: "Clone repository",
        description: "Clones a repository into a new folder, like Git > Clone. parentPath may be any existing folder, also outside the workspace; folderName defaults to the URL's last part without .git. open \"window\" opens the clone in the app window (in place of its folders), \"workspace\" adds it to the open folders, and \"none\" (the default) only clones. Off by default because it writes outside the workspace: turn it on in Help > Available MCP Tools.",
        category: GIT,
        read_only: false,
        destructive: false,
        schema: clone_schema,
        run: clone_repository,
    },
    BackendTool {
        name: "git_stash_push",
        title: "Stash changes",
        description: "Saves the local changes in a new stash and cleans the work tree, new files too with includeUntracked.",
        category: GIT,
        read_only: false,
        destructive: false,
        schema: stash_push_schema,
        run: git_stash_push,
    },
    BackendTool {
        name: "git_stash_apply",
        title: "Apply stash",
        description: "Applies a stash to the work tree and keeps it in the list.",
        category: GIT,
        read_only: false,
        destructive: false,
        schema: stash_index_schema,
        run: git_stash_apply,
    },
    BackendTool {
        name: "git_stash_pop",
        title: "Pop stash",
        description: "Applies a stash and removes it from the list (git keeps it when the apply conflicts).",
        category: GIT,
        read_only: false,
        destructive: false,
        schema: stash_index_schema,
        run: git_stash_pop,
    },
    BackendTool {
        name: "git_stash_drop",
        title: "Drop stash",
        description: "Deletes a stash without applying it.",
        category: GIT,
        read_only: false,
        destructive: true,
        schema: stash_index_schema,
        run: git_stash_drop,
    },
    BackendTool {
        name: "git_merge",
        title: "Merge",
        description: "Merges a branch into the current branch. May stop with conflicts.",
        category: GIT,
        read_only: false,
        destructive: false,
        schema: merge_schema,
        run: git_merge,
    },
    BackendTool {
        name: "git_rebase",
        title: "Rebase",
        description: "Rebases the current branch (or branchName) onto another branch or commit. May stop with conflicts.",
        category: GIT,
        read_only: false,
        destructive: false,
        schema: rebase_schema,
        run: git_rebase,
    },
    BackendTool {
        name: "git_reset",
        title: "Reset",
        description: "Moves the current branch to a revision: soft keeps changes staged, mixed keeps them unstaged, hard throws them away, keep keeps local edits.",
        category: GIT,
        read_only: false,
        destructive: true,
        schema: reset_schema,
        run: git_reset,
    },
    BackendTool {
        name: "git_cherry_pick",
        title: "Cherry-pick",
        description: "Applies the changes of a commit as a new commit on the current branch. May stop with conflicts.",
        category: GIT,
        read_only: false,
        destructive: false,
        schema: commit_id_schema,
        run: git_cherry_pick,
    },
    BackendTool {
        name: "git_revert",
        title: "Revert commit",
        description: "Makes a new commit that undoes a commit's changes. May stop with conflicts.",
        category: GIT,
        read_only: false,
        destructive: false,
        schema: commit_id_schema,
        run: git_revert,
    },
    BackendTool {
        name: "git_tag_create",
        title: "Create tag",
        description: "Tags HEAD or commitId: annotated when a message is given, lightweight otherwise.",
        category: GIT,
        read_only: false,
        destructive: false,
        schema: tag_schema,
        run: git_tag_create,
    },
    BackendTool {
        name: "git_abort_operation",
        title: "Abort operation",
        description: "Aborts the merge, rebase, cherry-pick or revert in progress and goes back to the state before it. Conflict resolutions made so far are lost.",
        category: GIT,
        read_only: false,
        destructive: true,
        schema: repo_only,
        run: git_abort_operation,
    },
    BackendTool {
        name: "git_continue_operation",
        title: "Continue operation",
        description: "Continues the merge, rebase, cherry-pick or revert in progress once every conflict is resolved and staged.",
        category: GIT,
        read_only: false,
        destructive: false,
        schema: repo_only,
        run: git_continue_operation,
    },
];

fn git_stage(ctx: &ToolCtx, args: &Args) -> ToolResult {
    let repo_path = ctx.repo(args)?;
    let file_paths = ctx.repo_files(&repo_path, &args.str_list("filePaths")?)?;
    let count = file_paths.len();
    wait(app::status::stage_files(repo_path, file_paths))?;
    done(format!("Staged {count} path(s)."))
}

fn git_unstage(ctx: &ToolCtx, args: &Args) -> ToolResult {
    let repo_path = ctx.repo(args)?;
    let file_paths = ctx.repo_files(&repo_path, &args.str_list("filePaths")?)?;
    let count = file_paths.len();
    wait(app::status::unstage_files(repo_path, file_paths))?;
    done(format!("Unstaged {count} path(s)."))
}

fn covers(given: &str, file_path: &str) -> bool {
    let given = given.trim_end_matches('/');
    file_path.trim_end_matches('/') == given || file_path.starts_with(&format!("{given}/"))
}

fn git_discard(ctx: &ToolCtx, args: &Args) -> ToolResult {
    let repo_path = ctx.repo(args)?;
    let file_paths = ctx.repo_files(&repo_path, &args.str_list("filePaths")?)?;
    let repo = git_repo::open(&repo_path).map_err(|err| err.to_string())?;
    let changes = status::read(&repo).map_err(|err| err.to_string())?.files;
    let (mut tracked, mut untracked) = (Vec::new(), Vec::new());
    for given in &file_paths {
        let mut found = false;
        for file in changes.iter().filter(|file| covers(given, &file.path)) {
            match file.unstaged {
                Some(ChangeKind::Untracked) => untracked.push(file.path.clone()),
                Some(_) => tracked.push(file.path.clone()),
                None => continue,
            }
            found = true;
        }
        if !found {
            return Err(format!("No unstaged changes in {given}"));
        }
    }
    let summary = format!("Discarded changes in {} file(s), deleted {} new file(s).", tracked.len(), untracked.len());
    wait(app::status::discard_files(repo_path, tracked, untracked))?;
    done(summary)
}

fn commit_schema() -> Value {
    object(
        json!({
            "repoPath": repo_prop(),
            "message": { "type": "string", "description": "The commit message. May be empty only with amend, which then keeps the old message." },
            "amend": { "type": "boolean", "description": "Replace the last commit instead of adding one (default false)." },
            "all": { "type": "boolean", "description": "Stage every tracked change first, like git commit -a; new files stay out (default false)." },
            "filePaths": files_prop("Commit only these files, with their work tree content; other staged changes stay staged."),
            "signOff": { "type": "boolean", "description": "Add a Signed-off-by line (default false)." },
            "author": { "type": "string", "description": "Another author, as Name <email>." },
            "noVerify": { "type": "boolean", "description": "Skip the pre-commit and commit-msg hooks (default false)." },
        }),
        &["repoPath", "message"],
    )
}

fn git_commit(ctx: &ToolCtx, args: &Args) -> ToolResult {
    let repo_path = ctx.repo(args)?;
    let message = args.text("message")?.to_string();
    let amend = args.bool("amend", false)?;
    let options = CommitOptions {
        sign_off: args.bool("signOff", false)?,
        author: args.opt_str("author")?.map(str::to_string),
        no_verify: args.bool("noVerify", false)?,
        ..CommitOptions::default()
    };
    if message.trim().is_empty() && !amend {
        return Err("Write a commit message first".to_string());
    }
    let file_paths = ctx.repo_files(&repo_path, &args.opt_str_list("filePaths")?)?;
    let output = if !file_paths.is_empty() {
        wait(app::status::commit_files(repo_path.clone(), file_paths, message, amend, Some(options)))?
    } else if args.bool("all", false)? {
        wait(app::status::commit_all(repo_path.clone(), message, amend, Some(options)))?
    } else {
        wait(app::status::commit(repo_path.clone(), message, amend, Some(options)))?
    };
    let head = git_repo::open(&repo_path)
        .ok()
        .and_then(|repo| repo.head().ok()?.target().map(|oid| oid.to_string()));
    json_out(json!({ "commitId": head, "output": output.text() }))
}

fn git_undo_last_commit(ctx: &ToolCtx, args: &Args) -> ToolResult {
    let repo_path = ctx.repo(args)?;
    let message = wait(app::status::undo_last_commit(repo_path))?;
    json_out(json!({ "undoneMessage": message }))
}

fn create_branch_schema() -> Value {
    object(
        json!({
            "repoPath": repo_prop(),
            "branchName": { "type": "string", "description": "The new branch's name." },
            "startPoint": { "type": "string", "description": "Where it starts (branch, tag or commit; default HEAD)." },
            "checkout": { "type": "boolean", "description": "Switch to it (default true)." },
        }),
        &["repoPath", "branchName"],
    )
}

fn git_create_branch(ctx: &ToolCtx, args: &Args) -> ToolResult {
    let repo_path = ctx.repo(args)?;
    let branch_name = checked(args.str("branchName")?, "A branch name")?.to_string();
    let start_point = match args.opt_str("startPoint")? {
        Some(start) => Some(checked(start, "A start point")?.to_string()),
        None => None,
    };
    let checkout = args.bool("checkout", true)?;
    wait(app::branch::create_branch(repo_path, branch_name.clone(), start_point, checkout))?;
    done(format!("Created branch {branch_name}{}.", if checkout { " and switched to it" } else { "" }))
}

fn checkout_schema() -> Value {
    object(
        json!({
            "repoPath": repo_prop(),
            "branchName": { "type": "string", "description": "A local branch, or a remote branch such as origin/feature (a local tracking branch is made)." },
            "commitId": { "type": "string", "description": "Detach HEAD at this commit instead of switching branches." },
        }),
        &["repoPath"],
    )
}

fn git_checkout(ctx: &ToolCtx, args: &Args) -> ToolResult {
    let repo_path = ctx.repo(args)?;
    if let Some(commit_id) = args.opt_str("commitId")? {
        let commit_id = checked(commit_id, "A commit")?.to_string();
        wait(app::history::checkout_commit(repo_path, commit_id.clone()))?;
        return done(format!("HEAD is now detached at {commit_id}."));
    }
    let branch_name = checked(args.str("branchName")?, "A branch name")?.to_string();
    let (local, remote) = {
        let repo = git_repo::open(&repo_path).map_err(|err| err.to_string())?;
        let local = repo.find_branch(&branch_name, git2::BranchType::Local).is_ok();
        let remote = repo.find_branch(&branch_name, git2::BranchType::Remote).is_ok();
        (local, remote)
    };
    if local {
        wait(app::branch::checkout_branch(repo_path, branch_name.clone()))?;
        return done(format!("Switched to {branch_name}."));
    }
    if remote {
        let local_name = branch_name.split_once('/').map(|(_, rest)| rest.to_string()).unwrap_or_default();
        wait(app::branch::checkout_remote_branch(repo_path, branch_name.clone(), local_name.clone()))?;
        return done(format!("Switched to {local_name}, tracking {branch_name}."));
    }
    Err(format!("No branch named {branch_name}"))
}

fn delete_branch_schema() -> Value {
    object(
        json!({
            "repoPath": repo_prop(),
            "branchName": { "type": "string", "description": "The local branch to delete." },
            "force": { "type": "boolean", "description": "Delete even when not merged (git branch -D, default false)." },
        }),
        &["repoPath", "branchName"],
    )
}

fn git_delete_branch(ctx: &ToolCtx, args: &Args) -> ToolResult {
    let repo_path = ctx.repo(args)?;
    let branch_name = checked(args.str("branchName")?, "A branch name")?.to_string();
    wait(app::branch::delete_branch(repo_path, branch_name.clone(), args.bool("force", false)?))?;
    done(format!("Deleted branch {branch_name}."))
}

fn fetch_schema() -> Value {
    object(
        json!({
            "repoPath": repo_prop(),
            "allRemotes": { "type": "boolean", "description": "Fetch every remote (default false: the default remote)." },
            "prune": { "type": "boolean", "description": "Remove remote branches deleted on the remote (default false)." },
        }),
        &["repoPath"],
    )
}

fn git_fetch(ctx: &ToolCtx, args: &Args) -> ToolResult {
    let repo_path = ctx.repo(args)?;
    let all_remotes = args.bool("allRemotes", false)?;
    let prune = args.bool("prune", false)?;
    outcome(remote::run_fetch(&repo_path, all_remotes, prune, &mut quiet()).map_err(|err| err.to_string())?)
}

fn pull_schema() -> Value {
    object(
        json!({
            "repoPath": repo_prop(),
            "mode": { "type": "string", "enum": ["merge", "rebase", "ffOnly"], "description": "How to integrate. Leave out to follow the repository's pull settings." },
            "remoteName": { "type": "string", "description": "Pull from this remote instead of the upstream (needs mode)." },
            "branchName": { "type": "string", "description": "The remote's branch to pull (with remoteName)." },
        }),
        &["repoPath"],
    )
}

fn git_pull(ctx: &ToolCtx, args: &Args) -> ToolResult {
    let repo_path = ctx.repo(args)?;
    let remote_name = args.opt_str("remoteName")?;
    let branch_name = args.opt_str("branchName")?;
    let mode = match args.opt_str("mode")? {
        None if remote_name.is_some() || branch_name.is_some() => Some(PullMode::Merge),
        None => None,
        Some("merge") => Some(PullMode::Merge),
        Some("rebase") => Some(PullMode::Rebase),
        Some("ffOnly") => Some(PullMode::FfOnly),
        Some(other) => return Err(format!("Unknown pull mode: {other}")),
    };
    let result = match mode {
        None => remote::run_pull(&repo_path, false, &mut quiet()),
        Some(mode) => remote::run_pull_with_options(&repo_path, remote_name, branch_name, mode, false, &mut quiet()),
    };
    outcome(result.map_err(|err| err.to_string())?)
}

fn push_schema() -> Value {
    object(
        json!({
            "repoPath": repo_prop(),
            "force": { "type": "boolean", "description": "Overwrite the remote branch with --force-with-lease (default false)." },
            "remoteName": { "type": "string", "description": "Push to this remote instead of the upstream." },
            "remoteBranch": { "type": "string", "description": "The branch name on the remote (with remoteName; default the current branch's name)." },
            "pushTags": { "type": "boolean", "description": "Push tags too (default false)." },
        }),
        &["repoPath"],
    )
}

fn git_push(ctx: &ToolCtx, args: &Args) -> ToolResult {
    let repo_path = ctx.repo(args)?;
    let force = args.bool("force", false)?;
    let push_tags = args.bool("pushTags", false)?;
    let result = match args.opt_str("remoteName")? {
        // The upstream push has no tags option, so the tags follow in a second push to the same remote.
        None if push_tags => remote::run_push(&repo_path, force, &mut quiet()).and_then(|branch| {
            let tags = remote::run_push_tags(&repo_path, &mut quiet())?;
            Ok(OpOutcome { output: format!("{}\n{}", branch.output, tags.output), conflicts: false })
        }),
        None => remote::run_push(&repo_path, force, &mut quiet()),
        Some(remote_name) => {
            let remote_branch = match args.opt_str("remoteBranch")? {
                Some(branch) => branch.to_string(),
                None => {
                    let repo = git_repo::open(&repo_path).map_err(|err| err.to_string())?;
                    status::head_info(&repo).branch.ok_or("Cannot push a detached HEAD")?
                }
            };
            remote::run_push_with_options(&repo_path, remote_name, &remote_branch, force, push_tags, &mut quiet())
        }
    };
    outcome(result.map_err(|err| err.to_string())?)
}

fn stash_push_schema() -> Value {
    object(
        json!({
            "repoPath": repo_prop(),
            "message": { "type": "string", "description": "A description for the stash." },
            "includeUntracked": { "type": "boolean", "description": "Stash new (untracked) files too (default false)." },
        }),
        &["repoPath"],
    )
}

fn git_stash_push(ctx: &ToolCtx, args: &Args) -> ToolResult {
    let repo_path = ctx.repo(args)?;
    let message = args.opt_str("message")?.unwrap_or_default().to_string();
    wait(app::stash::stash_push(repo_path, message, args.bool("includeUntracked", false)?))?;
    done("Stashed the changes as stash 0.")
}

fn stash_index_schema() -> Value {
    object(
        json!({
            "repoPath": repo_prop(),
            "stashIndex": { "type": "integer", "description": "The stash's index from git_stashes (0 is the newest, the default)." },
        }),
        &["repoPath"],
    )
}

fn stash_index(args: &Args) -> Result<usize, String> {
    args.usize("stashIndex", 0, usize::MAX)
}

fn git_stash_apply(ctx: &ToolCtx, args: &Args) -> ToolResult {
    let repo_path = ctx.repo(args)?;
    outcome(wait(app::stash::stash_apply(repo_path, stash_index(args)?, false))?)
}

fn git_stash_pop(ctx: &ToolCtx, args: &Args) -> ToolResult {
    let repo_path = ctx.repo(args)?;
    outcome(wait(app::stash::stash_apply(repo_path, stash_index(args)?, true))?)
}

fn git_stash_drop(ctx: &ToolCtx, args: &Args) -> ToolResult {
    let repo_path = ctx.repo(args)?;
    let index = stash_index(args)?;
    wait(app::stash::stash_drop(repo_path, index))?;
    done(format!("Dropped stash {index}."))
}

fn merge_schema() -> Value {
    object(
        json!({
            "repoPath": repo_prop(),
            "branchName": { "type": "string", "description": "The branch (or commit) to merge into the current branch." },
            "noFf": { "type": "boolean", "description": "Always make a merge commit (default false)." },
            "ffOnly": { "type": "boolean", "description": "Only fast-forward; fail otherwise (default false)." },
            "squash": { "type": "boolean", "description": "Squash the changes into the index without committing (default false)." },
            "noCommit": { "type": "boolean", "description": "Stop before making the merge commit (default false)." },
            "message": { "type": "string", "description": "The merge commit's message (default git's)." },
        }),
        &["repoPath", "branchName"],
    )
}

fn git_merge(ctx: &ToolCtx, args: &Args) -> ToolResult {
    let repo_path = ctx.repo(args)?;
    let options = MergeOptions {
        no_ff: args.bool("noFf", false)?,
        ff_only: args.bool("ffOnly", false)?,
        squash: args.bool("squash", false)?,
        no_commit: args.bool("noCommit", false)?,
        message: args.opt_str("message")?.map(str::to_string),
        no_verify: false,
    };
    let branch_name = args.str("branchName")?.to_string();
    outcome(wait(app::integrate::merge_with_options(repo_path, branch_name, options))?)
}

fn rebase_schema() -> Value {
    object(
        json!({
            "repoPath": repo_prop(),
            "onto": { "type": "string", "description": "The branch or commit to rebase onto." },
            "branchName": { "type": "string", "description": "The branch to rebase (default the current one)." },
            "rebaseMerges": { "type": "boolean", "description": "Keep merge commits (--rebase-merges, default false)." },
            "updateRefs": { "type": "boolean", "description": "Move branches that point into the rebased commits too (--update-refs, default false)." },
        }),
        &["repoPath", "onto"],
    )
}

fn git_rebase(ctx: &ToolCtx, args: &Args) -> ToolResult {
    let repo_path = ctx.repo(args)?;
    let options = RebaseOptions {
        onto: Some(args.str("onto")?.to_string()),
        branch_name: args.opt_str("branchName")?.map(str::to_string),
        rebase_merges: args.bool("rebaseMerges", false)?,
        update_refs: args.bool("updateRefs", false)?,
        ..RebaseOptions::default()
    };
    outcome(wait(app::integrate::rebase_with_options(repo_path, options))?)
}

fn reset_schema() -> Value {
    object(
        json!({
            "repoPath": repo_prop(),
            "revision": { "type": "string", "description": "Where to move the branch (commit, branch, tag or HEAD~1)." },
            "mode": { "type": "string", "enum": ["soft", "mixed", "hard", "keep"], "description": "What happens to the changes (default mixed)." },
        }),
        &["repoPath", "revision"],
    )
}

fn git_reset(ctx: &ToolCtx, args: &Args) -> ToolResult {
    let repo_path = ctx.repo(args)?;
    let revision = args.str("revision")?.to_string();
    let mode = args.opt_str("mode")?.unwrap_or("mixed").to_string();
    wait(app::history::reset_to(repo_path, revision.clone(), mode.clone()))?;
    done(format!("Reset ({mode}) to {revision}."))
}

fn commit_id_schema() -> Value {
    object(
        json!({
            "repoPath": repo_prop(),
            "commitId": { "type": "string", "description": "The commit (hash, branch or tag)." },
        }),
        &["repoPath", "commitId"],
    )
}

fn git_cherry_pick(ctx: &ToolCtx, args: &Args) -> ToolResult {
    let repo_path = ctx.repo(args)?;
    let commit_id = checked(args.str("commitId")?, "A commit")?.to_string();
    outcome(wait(app::history::cherry_pick(repo_path, commit_id))?)
}

fn git_revert(ctx: &ToolCtx, args: &Args) -> ToolResult {
    let repo_path = ctx.repo(args)?;
    let commit_id = checked(args.str("commitId")?, "A commit")?.to_string();
    outcome(wait(app::history::revert_commit(repo_path, commit_id))?)
}

fn tag_schema() -> Value {
    object(
        json!({
            "repoPath": repo_prop(),
            "tagName": { "type": "string", "description": "The tag's name, e.g. v1.2.0." },
            "message": { "type": "string", "description": "Makes an annotated tag with this message." },
            "commitId": { "type": "string", "description": "The commit to tag (default HEAD)." },
        }),
        &["repoPath", "tagName"],
    )
}

fn git_tag_create(ctx: &ToolCtx, args: &Args) -> ToolResult {
    let repo_path = ctx.repo(args)?;
    let tag_name = args.str("tagName")?.to_string();
    let commit_id = match args.opt_str("commitId")? {
        Some(commit_id) => Some(checked(commit_id, "A commit")?.to_string()),
        None => None,
    };
    let message = args.opt_str("message")?.map(str::to_string);
    wait(app::tag::create_tag(repo_path, tag_name.clone(), message, commit_id))?;
    done(format!("Created tag {tag_name}."))
}

fn git_abort_operation(ctx: &ToolCtx, args: &Args) -> ToolResult {
    let repo_path = ctx.repo(args)?;
    outcome(wait(app::merge::abort_operation(repo_path))?)
}

fn git_continue_operation(ctx: &ToolCtx, args: &Args) -> ToolResult {
    let repo_path = ctx.repo(args)?;
    outcome(wait(app::merge::continue_operation(repo_path))?)
}

const CLONE_OPEN_MODES: [&str; 3] = ["none", "window", "workspace"];

fn clone_schema() -> Value {
    object(
        json!({
            "url": { "type": "string", "description": "The repository URL: https://..., git@host:owner/repo.git, ssh://..., or a local path." },
            "parentPath": { "type": "string", "description": "Absolute path of an existing folder to clone into (any folder, not only the workspace)." },
            "folderName": { "type": "string", "description": "Name of the new folder (default: the URL's last part without .git). It must not exist, or be empty." },
            "open": { "type": "string", "enum": CLONE_OPEN_MODES, "description": "After cloning: \"window\" opens the clone in the app window, \"workspace\" adds it to the open folders, \"none\" (default) leaves the window as it is." },
        }),
        &["url", "parentPath"],
    )
}

fn clone_repository(ctx: &ToolCtx, args: &Args) -> ToolResult {
    let url = args.str("url")?.trim();
    if remote::is_remote_helper_url(url) {
        return Err("Remote helper URLs (transport::address) cannot be cloned here. Use an https, ssh or git URL, or a local path.".to_string());
    }
    let parent = paths::resolve(args.str("parentPath")?)?;
    let folder_name = match args.opt_str("folderName")?.map(str::trim).filter(|name| !name.is_empty()) {
        Some(name) => name.to_string(),
        None => remote::clone_folder_name(url),
    };
    let open = args.opt_str("open")?.unwrap_or("none");
    if !CLONE_OPEN_MODES.contains(&open) {
        return Err(format!("open must be one of {}", CLONE_OPEN_MODES.join(", ")));
    }
    let cloned_path = remote::clone_quietly(url, &parent.to_string_lossy(), &folder_name).map_err(|err| err.to_string())?;
    let window = if open == "none" { None } else { open_in_window(ctx, &cloned_path, open) };
    let note = match (open, &window) {
        ("none", _) => None,
        (_, Some(_)) => Some("The window opens the clone now."),
        (_, None) => Some("Cloned, but no app window is ready to open it."),
    };
    json_out(json!({ "clonedPath": cloned_path, "open": open, "window": window, "note": note }))
}

/// Asks the window focused last to open the clone (App.svelte listens for mcp-open-folder);
/// the window label, or None when no window can.
fn open_in_window(ctx: &ToolCtx, cloned_path: &str, mode: &str) -> Option<String> {
    let host = ctx.host().filter(|host| host.window_ready())?;
    let window_label = ctx.shared.target_window(&serde_json::Map::new())?;
    host.emit_to(&window_label, "mcp-open-folder", json!({ "folderPath": cloned_path, "mode": mode }));
    Some(window_label)
}
