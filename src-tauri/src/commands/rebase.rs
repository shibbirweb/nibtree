//! Interactive rebase: the dialog edits the todo list, and
//! `git rebase -i` runs it with that list in place of the editor.

use std::collections::HashSet;
use std::path::{Path, PathBuf};

use git2::{Oid, Repository, Sort, StatusOptions};
use serde::{Deserialize, Serialize};

use super::rebase_merges::{self, RebaseStep};
use super::{blocking, outcome, reject_option, OpOutcome};
use crate::error::{AppError, AppResult};
use crate::git::cli;
use crate::git::opstate::{self, OpKind};
use crate::git::repo::{self as git_repo, resolve_commit, short_id};

/// Message files and the todo live in the git dir: later `exec` lines read
/// them after an Edit stop or a conflict, so they must outlive this call.
const REBASE_DIR: &str = "nibtree-rebase";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum RebaseAction {
    Pick,
    Reword,
    Edit,
    Squash,
    Fixup,
    Drop,
}

impl RebaseAction {
    pub(super) fn keeps_commit(self) -> bool {
        matches!(self, RebaseAction::Pick | RebaseAction::Reword | RebaseAction::Edit)
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RebaseEntry {
    pub action: RebaseAction,
    pub commit_id: String,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RebaseCommit {
    pub id: String,
    pub short_id: String,
    pub summary: String,
    pub message: String,
    pub author_name: String,
    pub author_email: String,
    pub time: i64,
    pub is_merge: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RebasePlan {
    /// Oldest first.
    pub commits: Vec<RebaseCommit>,
    pub base: Option<String>,
    pub pushed_to: Option<String>,
    pub dirty: bool,
    /// The todo with its label, reset and merge lines when the range has merge commits
    /// (`--rebase-merges`); empty for a linear range.
    pub steps: Vec<RebaseStep>,
    /// What the commits go onto, for the title: a branch name, else None (the base commit).
    pub onto_name: Option<String>,
}

fn rebase_dir(repo: &Repository) -> PathBuf {
    repo.path().join(REBASE_DIR)
}

/// Drops the message files once no rebase is in progress any more.
pub fn cleanup_rebase_files(repo_path: &str) {
    let Ok(repo) = git_repo::open(repo_path) else {
        return;
    };
    if opstate::read(&repo).kind != OpKind::Rebase {
        let _ = std::fs::remove_dir_all(rebase_dir(&repo));
    }
}

pub(super) fn parse_commit_id(commit_id: &str) -> AppResult<Oid> {
    let commit_id = commit_id.trim();
    let hex = commit_id.len() >= 4 && commit_id.chars().all(|character| character.is_ascii_hexdigit());
    if !hex {
        return Err(AppError::invalid(format!("Not a commit id: {commit_id}")));
    }
    Oid::from_str(commit_id).map_err(|_| AppError::invalid(format!("Not a commit id: {commit_id}")))
}

/// The commit the current branch points at; detached or unborn HEADs cannot be rebased here.
fn branch_head(repo: &Repository) -> AppResult<Oid> {
    let head = repo
        .head()
        .map_err(|_| AppError::invalid("There are no commits to rebase yet"))?;
    if !head.is_branch() {
        return Err(AppError::invalid("Interactive rebase needs a checked-out branch, not a detached HEAD"));
    }
    head.target()
        .ok_or_else(|| AppError::invalid("There are no commits to rebase yet"))
}

fn has_tracked_changes(repo: &Repository) -> AppResult<bool> {
    let mut options = StatusOptions::new();
    options
        .include_untracked(false)
        .include_ignored(false)
        .exclude_submodules(true);
    let statuses = repo.statuses(Some(&mut options))?;
    Ok(statuses.iter().any(|entry| !entry.status().is_empty()))
}

/// base..HEAD, oldest first; every commit reachable from HEAD when `base` is None.
fn range(repo: &Repository, head: Oid, base: Option<Oid>) -> AppResult<Vec<Oid>> {
    let mut walk = repo.revwalk()?;
    walk.set_sorting(Sort::TOPOLOGICAL | Sort::REVERSE)?;
    walk.push(head)?;
    if let Some(base) = base {
        walk.hide(base)?;
    }
    walk.map(|oid| oid.map_err(AppError::from)).collect()
}

fn contains(repo: &Repository, tip: Oid, commit: Oid) -> bool {
    tip == commit || repo.graph_descendant_of(tip, commit).unwrap_or(false)
}

/// A remote branch, the upstream first, that already has `oldest` (so the rewrite needs a force push).
fn pushed_to(repo: &Repository, oldest: Oid) -> Option<String> {
    let current = repo
        .head()
        .ok()
        .and_then(|head| head.shorthand().ok().map(str::to_string))
        .and_then(|name| repo.find_branch(&name, git2::BranchType::Local).ok());
    if let Some(upstream) = current.and_then(|branch| branch.upstream().ok()) {
        if let (Some(tip), Ok(Some(name))) = (upstream.get().target(), upstream.name()) {
            if contains(repo, tip, oldest) {
                return Some(name.to_string());
            }
        }
    }
    for (branch, _) in repo.branches(Some(git2::BranchType::Remote)).ok()?.flatten() {
        let Ok(Some(name)) = branch.name() else {
            continue;
        };
        if name.ends_with("/HEAD") {
            continue;
        }
        if let Some(tip) = branch.get().target() {
            if contains(repo, tip, oldest) {
                return Some(name.to_string());
            }
        }
    }
    None
}

fn plan(repo_path: &str, from_commit: &str) -> AppResult<RebasePlan> {
    let repo = git_repo::open(repo_path)?;
    let head = branch_head(&repo)?;
    let from = repo.find_commit(parse_commit_id(from_commit)?)?;
    if !contains(&repo, head, from.id()) {
        return Err(AppError::invalid("The commit is not on the current branch"));
    }
    plan_range(&repo, head, from.parent_id(0).ok(), None)
}

/// The Rebase dialog's --interactive: the commits of `upstream`..HEAD, replayed onto `upstream`.
fn plan_onto(repo_path: &str, upstream: &str) -> AppResult<RebasePlan> {
    let upstream = upstream.trim();
    reject_option(upstream, "A revision")?;
    let repo = git_repo::open(repo_path)?;
    let head = branch_head(&repo)?;
    let onto = resolve_commit(&repo, upstream)?.id();
    let typed_hash = onto.to_string().starts_with(upstream);
    plan_range(&repo, head, Some(onto), (!typed_hash).then(|| upstream.to_string()))
}

fn plan_range(repo: &Repository, head: Oid, base: Option<Oid>, onto_name: Option<String>) -> AppResult<RebasePlan> {
    let oids = range(repo, head, base)?;
    let mut commits = Vec::new();
    let mut has_merges = false;
    for &oid in &oids {
        let commit = repo.find_commit(oid)?;
        let author = commit.author();
        commits.push(RebaseCommit {
            id: oid.to_string(),
            short_id: short_id(oid),
            summary: commit.summary().ok().flatten().unwrap_or_default().to_string(),
            message: commit.message().unwrap_or_default().to_string(),
            author_name: author.name().unwrap_or_default().to_string(),
            author_email: author.email().unwrap_or_default().to_string(),
            time: author.when().seconds(),
            is_merge: commit.parent_count() > 1,
        });
        has_merges |= commit.parent_count() > 1;
    }
    let steps = match (has_merges, base) {
        (false, _) => Vec::new(),
        (true, Some(base)) => rebase_merges::layout(repo, head, base, &oids)?,
        (true, None) => return Err(AppError::invalid(rebase_merges::ROOT_REFUSAL)),
    };
    Ok(RebasePlan {
        commits,
        base: base.map(|oid| oid.to_string()),
        pushed_to: oids.first().and_then(|&oldest| pushed_to(repo, oldest)),
        dirty: has_tracked_changes(repo)?,
        steps,
        onto_name,
    })
}

/// Quotes a path for the POSIX shell git runs `exec` lines and editors in.
fn shell_quote(text: &str) -> String {
    format!("'{}'", text.replace('\'', "'\\''"))
}

/// Written as-is (git's cleanup is verbatim), with exactly one trailing newline.
fn message_text(message: &str) -> String {
    format!("{}\n", message.trim_end())
}

pub(super) struct TodoWriter {
    dir: PathBuf,
    pub(super) lines: Vec<String>,
    files: usize,
}

impl TodoWriter {
    pub(super) fn new(dir: &Path) -> TodoWriter {
        TodoWriter {
            dir: dir.to_path_buf(),
            lines: Vec::new(),
            files: 0,
        }
    }

    /// An `exec` that amends HEAD with `message` (rewording it, or giving a squash group its message).
    fn amend_with(&mut self, message: &str) -> AppResult<()> {
        self.files += 1;
        let file = self.dir.join(format!("message-{}.txt", self.files));
        std::fs::write(&file, message_text(message))?;
        let path = file.to_string_lossy().replace('\\', "/");
        self.lines.push(format!(
            "exec git commit --amend --allow-empty --cleanup=verbatim -F {}",
            shell_quote(&path)
        ));
        Ok(())
    }
}

impl TodoWriter {
    /// Writes a run of rows: squash rows become `fixup` and the group's combined message is
    /// set by one amend at its end, so no editor is ever needed.
    pub(super) fn write_run(&mut self, entries: &[&RebaseEntry]) -> AppResult<()> {
        let mut group_message: Option<String> = None;
        for entry in entries {
            let commit_id = entry.commit_id.trim();
            match entry.action {
                RebaseAction::Pick | RebaseAction::Reword | RebaseAction::Edit => {
                    if let Some(message) = group_message.take() {
                        self.amend_with(&message)?;
                    }
                    let verb = if entry.action == RebaseAction::Edit { "edit" } else { "pick" };
                    self.lines.push(format!("{verb} {commit_id}"));
                    if entry.action == RebaseAction::Reword {
                        if let Some(message) = entry.message.as_deref() {
                            self.amend_with(message)?;
                        }
                    }
                }
                RebaseAction::Squash => {
                    self.lines.push(format!("fixup {commit_id}"));
                    if let Some(message) = entry.message.clone() {
                        group_message = Some(message);
                    }
                }
                RebaseAction::Fixup => self.lines.push(format!("fixup {commit_id}")),
                RebaseAction::Drop => self.lines.push(format!("drop {commit_id}")),
            }
        }
        if let Some(message) = group_message.take() {
            self.amend_with(&message)?;
        }
        Ok(())
    }
}

/// The todo for a linear range.
fn build_todo(dir: &Path, entries: &[RebaseEntry]) -> AppResult<Vec<String>> {
    let mut writer = TodoWriter::new(dir);
    writer.write_run(&entries.iter().collect::<Vec<_>>())?;
    Ok(writer.lines)
}

/// Checks the dialog's rows against the branch; returns the merge layout when the range has merges.
fn validate_entries(repo: &Repository, head: Oid, base: Option<Oid>, entries: &[RebaseEntry]) -> AppResult<Vec<RebaseStep>> {
    let commits = range(repo, head, base)?;
    let mut has_merges = false;
    for oid in &commits {
        has_merges |= repo.find_commit(*oid)?.parent_count() > 1;
    }
    let expected: HashSet<Oid> = commits.iter().copied().collect();
    let mut given = HashSet::new();
    for entry in entries {
        given.insert(parse_commit_id(&entry.commit_id)?);
    }
    if given != expected || entries.len() != commits.len() {
        return Err(AppError::invalid("The branch changed since the dialog opened"));
    }
    if has_merges {
        let base = base.ok_or_else(|| AppError::invalid(rebase_merges::ROOT_REFUSAL))?;
        let steps = rebase_merges::layout(repo, head, base, &commits)?;
        rebase_merges::validate(&steps, entries)?;
        return Ok(steps);
    }
    let first_kept = entries.iter().find(|entry| entry.action != RebaseAction::Drop);
    match first_kept {
        None => Err(AppError::invalid("Keep at least one commit")),
        Some(entry) if !entry.action.keeps_commit() => {
            Err(AppError::invalid("The first commit cannot be squashed or fixed up"))
        }
        Some(_) => Ok(Vec::new()),
    }
}

fn run_interactive_rebase(
    repo_path: &str,
    base: Option<&str>,
    entries: &[RebaseEntry],
    autostash: bool,
) -> AppResult<OpOutcome> {
    let (dir, base_arg, steps) = {
        let repo = git_repo::open(repo_path)?;
        if opstate::read(&repo).kind != OpKind::None {
            return Err(AppError::invalid(
                "Finish or abort the merge, rebase, cherry-pick or revert in progress first",
            ));
        }
        let head = branch_head(&repo)?;
        // The base is the parent of the oldest commit, or the upstream the Rebase dialog chose
        // (which need not be an ancestor); validate_entries checks the commits either way.
        let base = base.map(parse_commit_id).transpose()?;
        if !autostash && has_tracked_changes(&repo)? {
            return Err(AppError::invalid("Commit or stash your changes first"));
        }
        let steps = validate_entries(&repo, head, base, entries)?;
        let base_arg = base.map(|oid| oid.to_string()).unwrap_or_else(|| "--root".to_string());
        (rebase_dir(&repo), base_arg, steps)
    };
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir)?;
    let todo_lines = if steps.is_empty() {
        build_todo(&dir, entries)?
    } else {
        rebase_merges::build_todo(&dir, &steps, entries)?
    };
    let todo = dir.join("todo");
    std::fs::write(&todo, format!("{}\n", todo_lines.join("\n")))?;
    // git runs the sequence editor through its own POSIX shell (Git for Windows
    // bundles sh and cp), so copying the prepared todo over git's works on
    // macOS, Linux and Windows, needs no extra launch mode and runs under tests.
    // The variable, not sequence.editor, since cli::command sets it to "true".
    let editor = format!("cp {}", shell_quote(&todo.to_string_lossy().replace('\\', "/")));
    let mut args = vec!["rebase", "-i"];
    if autostash {
        args.push("--autostash");
    }
    if !steps.is_empty() {
        args.push("--rebase-merges");
    }
    args.push(&base_arg);
    let result = cli::run_with_env(Path::new(repo_path), &args, &[("GIT_SEQUENCE_EDITOR", editor.as_str())]);
    let finished = outcome(repo_path, result);
    cleanup_rebase_files(repo_path);
    finished
}

#[crate::command]
pub async fn rebase_plan(repo_path: String, from_commit: String) -> AppResult<RebasePlan> {
    blocking(move || plan(&repo_path, &from_commit)).await
}

/// The Rebase dialog's --interactive: the commits of `upstream`..HEAD.
#[crate::command]
pub async fn rebase_plan_onto(repo_path: String, upstream: String) -> AppResult<RebasePlan> {
    blocking(move || plan_onto(&repo_path, &upstream)).await
}

#[crate::command]
pub async fn interactive_rebase(
    repo_path: String,
    base: Option<String>,
    entries: Vec<RebaseEntry>,
    autostash: bool,
) -> AppResult<OpOutcome> {
    blocking(move || run_interactive_rebase(&repo_path, base.as_deref(), &entries, autostash)).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::{BareRemote, TestRepo};

    /// base, then one, two, three, each adding its own file.
    fn linear_repo() -> (TestRepo, Vec<String>) {
        let repo = TestRepo::new();
        repo.write("base.txt", "base\n");
        let mut ids = vec![repo.commit_all("base")];
        for name in ["one", "two", "three"] {
            repo.write(&format!("{name}.txt"), format!("{name}\n"));
            ids.push(repo.commit_all(name));
        }
        (repo, ids)
    }

    fn entry(action: RebaseAction, commit_id: &str, message: Option<&str>) -> RebaseEntry {
        RebaseEntry {
            action,
            commit_id: commit_id.to_string(),
            message: message.map(str::to_string),
        }
    }

    fn subjects(repo: &TestRepo) -> Vec<String> {
        repo.git(&["log", "--format=%s", "--reverse"]).lines().map(str::to_string).collect()
    }

    fn rebase(repo: &TestRepo, base: &str, entries: &[RebaseEntry]) -> AppResult<OpOutcome> {
        run_interactive_rebase(&repo.path_string(), Some(base), entries, false)
    }

    fn no_rebase_files(repo: &TestRepo) -> bool {
        !repo.file(".git/nibtree-rebase").exists()
    }

    #[test]
    fn reorders_and_drops() {
        let (repo, ids) = linear_repo();
        let entries = [
            entry(RebaseAction::Pick, &ids[3], None),
            entry(RebaseAction::Drop, &ids[2], None),
            entry(RebaseAction::Pick, &ids[1], None),
        ];
        let done = rebase(&repo, &ids[0], &entries).unwrap();
        assert!(!done.conflicts);
        assert_eq!(subjects(&repo), ["base", "three", "one"]);
        assert!(!repo.exists("two.txt"));
        assert!(no_rebase_files(&repo));
    }

    #[test]
    fn squash_takes_the_edited_message_and_fixup_keeps_the_target() {
        let (repo, ids) = linear_repo();
        let message = "one and two\n\nbody line\n";
        let entries = [
            entry(RebaseAction::Pick, &ids[1], None),
            entry(RebaseAction::Squash, &ids[2], Some(message)),
            entry(RebaseAction::Fixup, &ids[3], None),
        ];
        rebase(&repo, &ids[0], &entries).unwrap();
        assert_eq!(subjects(&repo), ["base", "one and two"]);
        // %B prints the stored message plus a newline.
        assert_eq!(repo.head_message(), format!("{message}\n"));
        assert!(repo.exists("three.txt"));

        let (repo, ids) = linear_repo();
        let entries = [
            entry(RebaseAction::Pick, &ids[1], None),
            entry(RebaseAction::Fixup, &ids[2], None),
            entry(RebaseAction::Pick, &ids[3], None),
        ];
        rebase(&repo, &ids[0], &entries).unwrap();
        assert_eq!(subjects(&repo), ["base", "one", "three"]);
    }

    #[test]
    fn reword_keeps_hash_lines_and_blank_lines_exactly() {
        let (repo, ids) = linear_repo();
        let message = "New subject\n\n# not a comment\n\n  indented\n\n\n";
        let entries = [
            entry(RebaseAction::Reword, &ids[1], Some(message)),
            entry(RebaseAction::Pick, &ids[2], None),
            entry(RebaseAction::Pick, &ids[3], None),
        ];
        rebase(&repo, &ids[0], &entries).unwrap();
        let reworded = repo.git(&["cat-file", "commit", "HEAD~2"]);
        assert!(reworded.ends_with("\n\nNew subject\n\n# not a comment\n\n  indented\n"), "{reworded}");
        assert_eq!(subjects(&repo)[3], "three");
    }

    #[test]
    fn edit_stops_at_its_commit() {
        let (repo, ids) = linear_repo();
        let entries = [
            entry(RebaseAction::Pick, &ids[1], None),
            entry(RebaseAction::Edit, &ids[2], None),
            entry(RebaseAction::Reword, &ids[3], Some("three reworded")),
        ];
        let stopped = rebase(&repo, &ids[0], &entries).unwrap();
        assert!(!stopped.conflicts);
        assert_eq!(opstate::read(&repo.open()).kind, OpKind::Rebase);
        assert_eq!(repo.head(), ids[2], "nothing changed before the edit, so the commit is reused");
        assert!(!no_rebase_files(&repo), "later exec lines still need their files");

        repo.git(&["rebase", "--continue"]);
        cleanup_rebase_files(&repo.path_string());
        assert_eq!(subjects(&repo), ["base", "one", "two", "three reworded"]);
        assert!(no_rebase_files(&repo));
    }

    #[test]
    fn a_conflict_stops_and_abort_cleans_up() {
        let repo = TestRepo::new();
        repo.write("f.txt", "base\n");
        let base = repo.commit_all("base");
        repo.write("f.txt", "first\n");
        let first = repo.commit_all("first");
        repo.write("f.txt", "second\n");
        let second = repo.commit_all("second");
        let entries = [entry(RebaseAction::Pick, &second, None), entry(RebaseAction::Pick, &first, None)];
        let stopped = rebase(&repo, &base, &entries).unwrap();
        assert!(stopped.conflicts);
        assert!(!no_rebase_files(&repo));

        repo.git(&["rebase", "--abort"]);
        cleanup_rebase_files(&repo.path_string());
        assert!(no_rebase_files(&repo));
        assert_eq!(repo.head(), second);
    }

    #[test]
    fn autostash_keeps_local_changes() {
        let (repo, ids) = linear_repo();
        repo.write("base.txt", "local edit\n");
        let entries = [
            entry(RebaseAction::Pick, &ids[1], None),
            entry(RebaseAction::Drop, &ids[2], None),
            entry(RebaseAction::Pick, &ids[3], None),
        ];
        let refused = rebase(&repo, &ids[0], &entries).unwrap_err();
        assert_eq!(refused.to_string(), "Commit or stash your changes first");
        run_interactive_rebase(&repo.path_string(), Some(&ids[0]), &entries, true).unwrap();
        assert_eq!(subjects(&repo), ["base", "one", "three"]);
        assert_eq!(repo.read_text("base.txt"), "local edit\n");
    }

    #[test]
    fn refuses_bad_plans() {
        let (repo, ids) = linear_repo();
        let all_drop: Vec<RebaseEntry> = ids[1..].iter().map(|id| entry(RebaseAction::Drop, id, None)).collect();
        assert_eq!(rebase(&repo, &ids[0], &all_drop).unwrap_err().to_string(), "Keep at least one commit");

        let leading_squash = [
            entry(RebaseAction::Drop, &ids[1], None),
            entry(RebaseAction::Squash, &ids[2], Some("x")),
            entry(RebaseAction::Pick, &ids[3], None),
        ];
        assert_eq!(
            rebase(&repo, &ids[0], &leading_squash).unwrap_err().to_string(),
            "The first commit cannot be squashed or fixed up"
        );

        let missing = [entry(RebaseAction::Pick, &ids[1], None), entry(RebaseAction::Pick, &ids[2], None)];
        assert_eq!(
            rebase(&repo, &ids[0], &missing).unwrap_err().to_string(),
            "The branch changed since the dialog opened"
        );
        let injected = [entry(RebaseAction::Pick, "--exec=x", None)];
        assert!(matches!(rebase(&repo, &ids[0], &injected), Err(AppError::Invalid(_))));
        assert_eq!(subjects(&repo), ["base", "one", "two", "three"]);
    }

    /// base, f1; side from f1: s1, s2; main: f2, a merge of side, f3. Returns the ids by name.
    fn merged_repo() -> (TestRepo, std::collections::HashMap<&'static str, String>) {
        let repo = TestRepo::new();
        let mut ids = std::collections::HashMap::new();
        repo.write("base.txt", "base\n");
        ids.insert("base", repo.commit_all("base"));
        repo.write("f1.txt", "f1\n");
        ids.insert("f1", repo.commit_all("f1"));
        repo.git(&["switch", "-q", "-c", "side"]);
        repo.write("s1.txt", "s1\n");
        ids.insert("s1", repo.commit_all("s1"));
        repo.write("s2.txt", "s2\n");
        ids.insert("s2", repo.commit_all("s2"));
        repo.checkout("main");
        repo.write("f2.txt", "f2\n");
        ids.insert("f2", repo.commit_all("f2"));
        repo.git(&["merge", "-q", "--no-ff", "-m", "Merge side", "side"]);
        ids.insert("merge", repo.head());
        repo.write("f3.txt", "f3\n");
        ids.insert("f3", repo.commit_all("f3"));
        (repo, ids)
    }

    /// Entries in the plan's todo order, all picked.
    fn picks(plan: &RebasePlan) -> Vec<RebaseEntry> {
        plan.steps
            .iter()
            .filter(|step| matches!(step.kind, rebase_merges::StepKind::Pick | rebase_merges::StepKind::Merge))
            .map(|step| entry(RebaseAction::Pick, step.commit_id.as_deref().unwrap(), None))
            .collect()
    }

    fn set(entries: &mut [RebaseEntry], commit_id: &str, action: RebaseAction, message: Option<&str>) {
        let found = entries.iter_mut().find(|entry| entry.commit_id == commit_id).unwrap();
        found.action = action;
        found.message = message.map(str::to_string);
    }

    #[test]
    fn plan_lays_out_merges_like_rebase_merges() {
        let (repo, ids) = merged_repo();
        let plan = plan(&repo.path_string(), &ids["f2"]).unwrap();
        assert_eq!(plan.base.as_deref(), Some(ids["f1"].as_str()));
        let lines: Vec<String> = plan
            .steps
            .iter()
            .map(|step| {
                let id = step.commit_id.as_deref().map(|id| &id[..7]).unwrap_or("-");
                format!("{:?} {} {} {}", step.kind, id, step.label.as_deref().unwrap_or("-"), step.parents.len())
            })
            .collect();
        let short = |name: &str| ids[name][..7].to_string();
        let side_label = format!("gm-{}", &ids["s2"][..12]);
        assert_eq!(
            lines,
            [
                "Label - onto 0".to_string(),
                "Reset - onto 0".to_string(),
                format!("Pick {} - 0", short("s1")),
                format!("Pick {} - 0", short("s2")),
                format!("Label - {side_label} 0"),
                "Reset - onto 0".to_string(),
                format!("Pick {} - 0", short("f2")),
                format!("Merge {} - 1", short("merge")),
                format!("Pick {} - 0", short("f3")),
            ]
        );
        assert_eq!(plan.steps[7].parents, [side_label]);
    }

    #[test]
    fn keeps_merges_reorders_within_a_run_and_rewords() {
        let (repo, ids) = merged_repo();
        let plan = plan(&repo.path_string(), &ids["f2"]).unwrap();
        let mut entries = picks(&plan);
        entries.swap(0, 1);
        set(&mut entries, &ids["f3"], RebaseAction::Reword, Some("f3 reworded"));
        let done = rebase(&repo, &ids["f1"], &entries).unwrap();
        assert!(!done.conflicts, "{}", done.output);
        assert_eq!(repo.head_message().trim(), "f3 reworded");
        assert_eq!(repo.parent_count("HEAD~1"), 2, "the merge is recreated");
        assert_eq!(repo.git(&["log", "-1", "--format=%s", "HEAD~1"]).trim(), "Merge side");
        assert_eq!(repo.git(&["log", "--format=%s", "-2", "HEAD~1^2"]).lines().collect::<Vec<_>>(), ["s1", "s2"]);
        assert_eq!(repo.rev_parse("HEAD~2"), ids["f2"], "untouched commits are reused");
        assert!(no_rebase_files(&repo));
        assert!(repo.git(&["for-each-ref", "refs/rewritten"]).trim().is_empty(), "labels are cleaned up");
    }

    #[test]
    fn dropping_a_merge_drops_the_branch_it_brought_in() {
        let (repo, ids) = merged_repo();
        let plan = plan(&repo.path_string(), &ids["f2"]).unwrap();
        let mut entries = picks(&plan);
        set(&mut entries, &ids["merge"], RebaseAction::Drop, None);
        // Not used: the side branch goes with its merge.
        set(&mut entries, &ids["s1"], RebaseAction::Reword, Some("never applied"));
        rebase(&repo, &ids["f1"], &entries).unwrap();
        assert_eq!(subjects(&repo), ["base", "f1", "f2", "f3"]);
        assert!(!repo.exists("s1.txt") && !repo.exists("s2.txt"));
    }

    #[test]
    fn a_branch_point_inside_the_range_keeps_both_branches_on_it() {
        let (repo, ids) = merged_repo();
        let plan = plan(&repo.path_string(), &ids["f1"]).unwrap();
        assert!(plan.steps.iter().any(|step| step.label.as_deref() == Some(&format!("gm-{}", &ids["f1"][..12]))));
        let mut entries = picks(&plan);
        set(&mut entries, &ids["f1"], RebaseAction::Reword, Some("f1 reworded"));
        rebase(&repo, &ids["base"], &entries).unwrap();
        assert_eq!(repo.git(&["log", "-1", "--format=%s", "HEAD~3"]).trim(), "f1 reworded");
        assert_eq!(repo.rev_parse("HEAD~1^2~2"), repo.rev_parse("HEAD~3"), "the side branch starts on the rewritten f1");
    }

    #[test]
    fn merge_rows_only_pick_or_drop_and_squashes_need_a_commit_above() {
        let (repo, ids) = merged_repo();
        let plan = plan(&repo.path_string(), &ids["f2"]).unwrap();
        let mut reworded_merge = picks(&plan);
        set(&mut reworded_merge, &ids["merge"], RebaseAction::Reword, Some("x"));
        assert!(rebase(&repo, &ids["f1"], &reworded_merge).unwrap_err().to_string().contains("only be picked or dropped"));

        let mut squashed = picks(&plan);
        set(&mut squashed, &ids["f3"], RebaseAction::Fixup, None);
        assert!(rebase(&repo, &ids["f1"], &squashed).unwrap_err().to_string().contains("squash or fixup"));

        let mut fixup_in_run = picks(&plan);
        set(&mut fixup_in_run, &ids["s2"], RebaseAction::Fixup, None);
        rebase(&repo, &ids["f1"], &fixup_in_run).unwrap();
        assert_eq!(repo.git(&["log", "--format=%s", "-1", "HEAD~1^2"]).trim(), "s1");
        assert!(repo.exists("s2.txt"));

        let (repo, _ids) = merged_repo();
        let root = repo.rev_parse("HEAD~4");
        let refused = super::plan(&repo.path_string(), &root).unwrap_err();
        assert_eq!(refused.to_string(), rebase_merges::ROOT_REFUSAL);
    }

    #[test]
    fn plan_onto_takes_the_commits_missing_from_the_upstream() {
        let (repo, ids) = linear_repo();
        repo.git(&["switch", "-q", "-c", "other", &ids[1]]);
        repo.write("other.txt", "other\n");
        repo.commit_all("other");
        repo.checkout("main");
        let plan = plan_onto(&repo.path_string(), "other").unwrap();
        let listed: Vec<&str> = plan.commits.iter().map(|commit| commit.summary.as_str()).collect();
        assert_eq!(listed, ["two", "three"]);
        assert_eq!(plan.onto_name.as_deref(), Some("other"));
        assert!(plan.steps.is_empty());
        let entries: Vec<RebaseEntry> = plan.commits.iter().map(|commit| entry(RebaseAction::Pick, &commit.id, None)).collect();
        rebase(&repo, plan.base.as_deref().unwrap(), &entries).unwrap();
        assert_eq!(subjects(&repo), ["base", "one", "other", "two", "three"]);
    }

    #[test]
    fn plan_lists_the_range_and_where_it_was_pushed() {
        let (repo, ids) = linear_repo();
        let remote = BareRemote::new();
        repo.add_remote("origin", &remote);
        repo.git(&["push", "-q", "-u", "origin", "main"]);
        repo.write("four.txt", "four\n");
        repo.commit_all("four");

        let from_two = plan(&repo.path_string(), &ids[2]).unwrap();
        let listed: Vec<&str> = from_two.commits.iter().map(|commit| commit.summary.as_str()).collect();
        assert_eq!(listed, ["two", "three", "four"]);
        assert_eq!(from_two.base.as_deref(), Some(ids[1].as_str()));
        assert_eq!(from_two.pushed_to.as_deref(), Some("origin/main"));
        assert!(!from_two.dirty);
        assert_eq!(from_two.commits[0].message, "two\n");

        let head = repo.head();
        let unpushed = plan(&repo.path_string(), &head).unwrap();
        assert_eq!(unpushed.pushed_to, None);
        assert_eq!(unpushed.commits.len(), 1);

        repo.write("base.txt", "dirty\n");
        let from_root = plan(&repo.path_string(), &ids[0]).unwrap();
        assert_eq!(from_root.base, None);
        assert_eq!(from_root.commits.len(), 5);
        assert!(from_root.dirty);
    }

    #[test]
    fn rebases_from_the_root() {
        let (repo, ids) = linear_repo();
        let entries = [
            entry(RebaseAction::Reword, &ids[0], Some("root reworded")),
            entry(RebaseAction::Pick, &ids[1], None),
            entry(RebaseAction::Drop, &ids[2], None),
            entry(RebaseAction::Pick, &ids[3], None),
        ];
        run_interactive_rebase(&repo.path_string(), None, &entries, false).unwrap();
        assert_eq!(subjects(&repo), ["root reworded", "one", "three"]);
        assert!(no_rebase_files(&repo));
    }

    #[test]
    fn todo_puts_group_messages_at_the_end_of_the_group() {
        let dir = crate::test_support::TestDir::new();
        let entries = [
            entry(RebaseAction::Reword, "aaaa", Some("reworded")),
            entry(RebaseAction::Squash, "bbbb", None),
            entry(RebaseAction::Drop, "cccc", None),
            entry(RebaseAction::Squash, "dddd", Some("group")),
            entry(RebaseAction::Pick, "eeee", None),
        ];
        let lines = build_todo(&dir.path, &entries).unwrap();
        let verbs: Vec<&str> = lines.iter().map(|line| line.split(' ').next().unwrap_or_default()).collect();
        assert_eq!(verbs, ["pick", "exec", "fixup", "drop", "fixup", "exec", "pick"]);
        assert_eq!(std::fs::read_to_string(dir.file("message-2.txt")).unwrap(), "group\n");
        assert_eq!(shell_quote("it's"), "'it'\\''s'");
    }
}
