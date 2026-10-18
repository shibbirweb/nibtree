//! The Merge and Rebase dialogs: `git merge` and `git rebase` with their options.

use serde::Deserialize;

use super::{blocking, reject_option, run_op, OpOutcome};
use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct MergeOptions {
    pub no_ff: bool,
    pub ff_only: bool,
    pub squash: bool,
    pub no_commit: bool,
    /// The merge commit's message (-m); None or empty takes git's default.
    pub message: Option<String>,
    pub no_verify: bool,
}

/// Trims an optional value from the UI; empty counts as not given.
fn given(value: Option<&str>) -> Option<&str> {
    value.map(str::trim).filter(|text| !text.is_empty())
}

fn merge_args(branch_name: &str, options: &MergeOptions) -> AppResult<Vec<String>> {
    let branch_name = branch_name.trim();
    if branch_name.is_empty() {
        return Err(AppError::invalid("Choose a branch to merge"));
    }
    reject_option(branch_name, "A branch name")?;
    if options.no_ff && options.ff_only {
        return Err(AppError::invalid("--no-ff and --ff-only cannot be combined"));
    }
    if options.squash && (options.no_ff || options.ff_only) {
        return Err(AppError::invalid("--squash cannot be combined with --no-ff or --ff-only"));
    }
    let mut args = vec!["merge".to_string()];
    if options.no_ff {
        args.push("--no-ff".to_string());
    }
    if options.ff_only {
        args.push("--ff-only".to_string());
    }
    if options.squash {
        args.push("--squash".to_string());
    }
    if options.no_commit && !options.squash && !options.ff_only {
        args.push("--no-commit".to_string());
    }
    if options.no_verify {
        args.push("--no-verify".to_string());
    }
    let message = given(options.message.as_deref()).filter(|_| !options.squash && !options.ff_only);
    match message {
        Some(message) => {
            args.push("-m".to_string());
            args.push(message.to_string());
        }
        // Never open an editor the GUI cannot show.
        None => args.push("--no-edit".to_string()),
    }
    args.push(branch_name.to_string());
    Ok(args)
}

fn run_merge(repo_path: &str, branch_name: &str, options: &MergeOptions) -> AppResult<OpOutcome> {
    let args = merge_args(branch_name, options)?;
    let args: Vec<&str> = args.iter().map(String::as_str).collect();
    run_op(repo_path, &args)
}

/// The Merge dialog: merges `branch_name` into the current branch with the chosen options.
#[crate::command]
pub async fn merge_with_options(repo_path: String, branch_name: String, options: MergeOptions) -> AppResult<OpOutcome> {
    blocking(move || run_merge(&repo_path, &branch_name, &options)).await
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct RebaseOptions {
    /// What to rebase onto: the upstream of the two-argument form, or the new base with `--onto`.
    pub onto: Option<String>,
    /// `--onto <onto> <upstream>`: only the commits after `upstream` move.
    pub upstream: Option<String>,
    /// The branch to rebase; None rebases the current one.
    pub branch_name: Option<String>,
    pub use_onto: bool,
    pub rebase_merges: bool,
    pub keep_empty: bool,
    pub root: bool,
    pub update_refs: bool,
}

fn rebase_args(options: &RebaseOptions) -> AppResult<Vec<String>> {
    let onto = given(options.onto.as_deref());
    let upstream = given(options.upstream.as_deref());
    let branch_name = given(options.branch_name.as_deref());
    for (value, what) in [(onto, "A revision"), (upstream, "An upstream"), (branch_name, "A branch name")] {
        if let Some(value) = value {
            reject_option(value, what)?;
        }
    }
    let mut args = vec!["rebase".to_string()];
    if options.rebase_merges {
        args.push("--rebase-merges".to_string());
    }
    if options.keep_empty {
        args.push("--keep-empty".to_string());
    }
    if options.update_refs {
        args.push("--update-refs".to_string());
    }
    if options.use_onto {
        let onto = onto.ok_or_else(|| AppError::invalid("Choose the new base for --onto"))?;
        args.push("--onto".to_string());
        args.push(onto.to_string());
    }
    if options.root {
        args.push("--root".to_string());
    } else if options.use_onto {
        let upstream = upstream.ok_or_else(|| AppError::invalid("Choose the upstream for --onto"))?;
        args.push(upstream.to_string());
    } else {
        let onto = onto.ok_or_else(|| AppError::invalid("Choose what to rebase onto"))?;
        args.push(onto.to_string());
    }
    if let Some(branch_name) = branch_name {
        args.push(branch_name.to_string());
    }
    Ok(args)
}

fn run_rebase(repo_path: &str, options: &RebaseOptions) -> AppResult<OpOutcome> {
    let args = rebase_args(options)?;
    let args: Vec<&str> = args.iter().map(String::as_str).collect();
    run_op(repo_path, &args)
}

/// The Rebase dialog (not interactive): `git rebase` with the chosen options.
#[crate::command]
pub async fn rebase_with_options(repo_path: String, options: RebaseOptions) -> AppResult<OpOutcome> {
    blocking(move || run_rebase(&repo_path, &options)).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::TestRepo;

    /// main: base, main change; feature (checked out at main afterwards): feature change.
    fn diverged() -> TestRepo {
        let repo = TestRepo::new();
        repo.write("base.txt", "base\n");
        repo.commit_all("base");
        repo.git(&["switch", "-q", "-c", "feature"]);
        repo.write("feature.txt", "feature\n");
        repo.commit_all("feature change");
        repo.checkout("main");
        repo.write("main.txt", "main\n");
        repo.commit_all("main change");
        repo
    }

    /// main: base; feature: one commit ahead, so a fast-forward is possible.
    fn ahead() -> TestRepo {
        let repo = TestRepo::new();
        repo.write("base.txt", "base\n");
        repo.commit_all("base");
        repo.git(&["switch", "-q", "-c", "feature"]);
        repo.write("feature.txt", "feature\n");
        repo.commit_all("feature change");
        repo.checkout("main");
        repo
    }

    fn merge(repo: &TestRepo, options: MergeOptions) -> AppResult<OpOutcome> {
        run_merge(&repo.path_string(), "feature", &options)
    }

    #[test]
    fn no_ff_creates_a_merge_commit_with_the_message() {
        let repo = ahead();
        let options = MergeOptions {
            no_ff: true,
            message: Some("Merge feature for review".to_string()),
            ..MergeOptions::default()
        };
        let done = merge(&repo, options).unwrap();
        assert!(!done.conflicts);
        assert_eq!(repo.parent_count("HEAD"), 2);
        assert_eq!(repo.head_message().trim(), "Merge feature for review");
    }

    #[test]
    fn ff_only_refuses_when_a_merge_is_needed() {
        let repo = diverged();
        let before = repo.head();
        let options = MergeOptions {
            ff_only: true,
            ..MergeOptions::default()
        };
        assert!(merge(&repo, options.clone()).is_err());
        assert_eq!(repo.head(), before);

        let repo = ahead();
        merge(&repo, options).unwrap();
        assert_eq!(repo.head(), repo.rev_parse("feature"), "fast-forwarded");
    }

    #[test]
    fn squash_leaves_the_changes_staged() {
        let repo = diverged();
        let before = repo.head();
        let options = MergeOptions {
            squash: true,
            message: Some("ignored".to_string()),
            ..MergeOptions::default()
        };
        merge(&repo, options).unwrap();
        assert_eq!(repo.head(), before, "nothing committed");
        assert!(!repo.file(".git/MERGE_HEAD").exists(), "a squash is not a merge in progress");
        assert_eq!(repo.git(&["diff", "--cached", "--name-only"]).trim(), "feature.txt");
    }

    #[test]
    fn no_commit_stops_before_the_merge_commit() {
        let repo = diverged();
        let before = repo.head();
        let options = MergeOptions {
            no_commit: true,
            no_verify: true,
            ..MergeOptions::default()
        };
        let stopped = merge(&repo, options).unwrap();
        assert!(!stopped.conflicts);
        assert_eq!(repo.head(), before);
        assert!(repo.file(".git/MERGE_HEAD").exists());
    }

    #[test]
    fn merge_refuses_bad_combinations_and_option_names() {
        let both = MergeOptions {
            no_ff: true,
            ff_only: true,
            ..MergeOptions::default()
        };
        assert!(matches!(merge_args("feature", &both), Err(AppError::Invalid(_))));
        let squash = MergeOptions {
            squash: true,
            no_ff: true,
            ..MergeOptions::default()
        };
        assert!(matches!(merge_args("feature", &squash), Err(AppError::Invalid(_))));
        assert!(merge_args("--all", &MergeOptions::default()).is_err());
        assert_eq!(merge_args("feature", &MergeOptions::default()).unwrap(), ["merge", "--no-edit", "feature"]);
    }

    fn subjects(repo: &TestRepo, revision: &str) -> Vec<String> {
        repo.git(&["log", "--format=%s", "--reverse", revision]).lines().map(str::to_string).collect()
    }

    #[test]
    fn rebases_onto_a_branch_and_with_onto_an_upstream() {
        let repo = diverged();
        repo.checkout("feature");
        let options = RebaseOptions {
            onto: Some("main".to_string()),
            ..RebaseOptions::default()
        };
        run_rebase(&repo.path_string(), &options).unwrap();
        assert_eq!(subjects(&repo, "HEAD"), ["base", "main change", "feature change"]);

        // feature: base, main change, feature change, topic one (topic). Move only "topic one" onto base.
        repo.git(&["switch", "-q", "-c", "topic"]);
        repo.write("topic.txt", "topic\n");
        repo.commit_all("topic one");
        let base = repo.rev_parse("main~1");
        let options = RebaseOptions {
            use_onto: true,
            onto: Some(base),
            upstream: Some("feature".to_string()),
            ..RebaseOptions::default()
        };
        run_rebase(&repo.path_string(), &options).unwrap();
        assert_eq!(subjects(&repo, "HEAD"), ["base", "topic one"]);
    }

    #[test]
    fn rebase_options_keep_merges_empty_commits_and_update_refs() {
        let repo = TestRepo::new();
        repo.write("base.txt", "base\n");
        repo.commit_all("base");
        repo.git(&["switch", "-q", "-c", "stack-1"]);
        repo.write("one.txt", "one\n");
        repo.commit_all("one");
        repo.git(&["switch", "-q", "-c", "stack-2"]);
        repo.git(&["commit", "-q", "--allow-empty", "-m", "empty"]);
        repo.git(&["switch", "-q", "-c", "side"]);
        repo.write("side.txt", "side\n");
        repo.commit_all("side");
        repo.checkout("stack-2");
        repo.git(&["merge", "-q", "--no-ff", "-m", "merge side", "side"]);
        repo.checkout("main");
        repo.write("main.txt", "main\n");
        repo.commit_all("main moved");
        repo.checkout("stack-2");

        let options = RebaseOptions {
            onto: Some("main".to_string()),
            rebase_merges: true,
            keep_empty: true,
            update_refs: true,
            ..RebaseOptions::default()
        };
        let done = run_rebase(&repo.path_string(), &options).unwrap();
        assert!(!done.conflicts, "{}", done.output);
        assert_eq!(repo.parent_count("HEAD"), 2, "the merge commit is kept");
        let first_parents = repo.git(&["log", "--first-parent", "--format=%s", "--reverse"]);
        assert_eq!(first_parents.lines().collect::<Vec<_>>(), ["base", "main moved", "one", "empty", "merge side"]);
        assert_eq!(
            repo.rev_parse("stack-1"),
            repo.rev_parse("HEAD~2"),
            "--update-refs moved the branch inside the stack"
        );
    }

    #[test]
    fn rebases_from_the_root_onto_another_history() {
        let repo = TestRepo::new();
        repo.write("a.txt", "a\n");
        repo.commit_all("root");
        repo.write("b.txt", "b\n");
        repo.commit_all("second");
        repo.git(&["switch", "-q", "--orphan", "fresh"]);
        repo.write("c.txt", "c\n");
        repo.commit_all("other root");
        repo.checkout("main");
        let options = RebaseOptions {
            root: true,
            use_onto: true,
            onto: Some("fresh".to_string()),
            ..RebaseOptions::default()
        };
        run_rebase(&repo.path_string(), &options).unwrap();
        assert_eq!(subjects(&repo, "HEAD"), ["other root", "root", "second"]);
        assert_eq!(
            rebase_args(&options).unwrap(),
            ["rebase", "--onto", "fresh", "--root"]
        );
    }

    #[test]
    fn rebase_args_follow_the_form() {
        let three = RebaseOptions {
            use_onto: true,
            onto: Some("main".to_string()),
            upstream: Some("old".to_string()),
            branch_name: Some("topic".to_string()),
            ..RebaseOptions::default()
        };
        assert_eq!(rebase_args(&three).unwrap(), ["rebase", "--onto", "main", "old", "topic"]);
        let missing = RebaseOptions {
            use_onto: true,
            onto: Some("main".to_string()),
            ..RebaseOptions::default()
        };
        assert!(matches!(rebase_args(&missing), Err(AppError::Invalid(_))));
        assert!(rebase_args(&RebaseOptions::default()).is_err());
        let injected = RebaseOptions {
            onto: Some("--exec=x".to_string()),
            ..RebaseOptions::default()
        };
        assert!(rebase_args(&injected).is_err());
    }
}
