//! Shelve Changes, Unshelve and the Shelf: changes saved as a patch in
//! `.git/nibtree-shelf/` (see shelf/store.rs) and reverted from the work tree.

use std::collections::HashSet;
use std::path::{Path, PathBuf};

use serde::Serialize;

use super::{blocking, has_conflicts, safe_join, with_paths, OpOutcome};
use crate::error::{AppError, AppResult};
use crate::git::cli;
use crate::git::diff::{self, FileDiff};
use crate::git::repo as git_repo;
use crate::git::status::{self as git_status, ChangeKind};
use crate::shelf::patch::{apply_hunks, hunk_sides, is_zero_id, parse_section, split_sections};
use crate::shelf::store::{clean_name, Shelf, ShelfEntry, ShelvedChange, ShelvedFile};

/// The tree of an empty repository, to diff against when HEAD does not exist yet.
const EMPTY_TREE: &str = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

/// A patch `git apply` reads back exactly, whatever the user's diff config says. Renames are
/// found the same way in the patch and in its `--raw` listing, so their entries line up.
const PATCH_FLAGS: [&str; 10] = [
    "--binary",
    "--full-index",
    "--no-color",
    "--no-ext-diff",
    "--no-textconv",
    "--src-prefix=a/",
    "--dst-prefix=b/",
    "--no-relative",
    "--find-renames",
    "--ignore-submodules=all",
];
const RAW_FLAGS: [&str; 6] = ["--raw", "-z", "--no-abbrev", "--no-relative", "--find-renames", "--ignore-submodules=all"];

/// `apply.whitespace=fix` would change the content while applying: always apply as-is.
const APPLY_FLAGS: [&str; 1] = ["--whitespace=nowarn"];

#[derive(Debug, Clone, PartialEq, Eq)]
struct RawChange {
    change: ShelvedChange,
    path: String,
    old_path: Option<String>,
    old_id: Option<String>,
}

/// `git diff --raw -z`: ":old_mode new_mode old_id new_id STATUS\0path\0" (two paths for R and C).
fn parse_raw(bytes: &[u8]) -> Vec<RawChange> {
    let mut tokens = bytes.split(|byte| *byte == 0).filter(|token| !token.is_empty());
    let mut changes = Vec::new();
    while let Some(header) = tokens.next() {
        let header = String::from_utf8_lossy(header);
        let fields: Vec<&str> = header.trim_start_matches(':').split_whitespace().collect();
        let letter = fields.get(4).and_then(|status| status.bytes().next()).unwrap_or(b'M');
        let old_id = fields.get(2).filter(|object_id| !is_zero_id(object_id)).map(|object_id| object_id.to_string());
        let change = ShelvedChange::from_letter(letter);
        let first = tokens.next().map(git_repo::path_text).unwrap_or_default();
        if matches!(change, ShelvedChange::Renamed | ShelvedChange::Copied) {
            let second = tokens.next().map(git_repo::path_text).unwrap_or_default();
            changes.push(RawChange { change, path: second, old_path: Some(first), old_id });
        } else {
            changes.push(RawChange { change, path: first, old_path: None, old_id });
        }
    }
    changes
}

/// A copy of the index that only this shelve uses, removed when dropped.
struct ScratchIndex {
    path: PathBuf,
}

impl ScratchIndex {
    fn create(repo: &git2::Repository, shelf_dir_parent: &Path, shelf_id: &str) -> AppResult<ScratchIndex> {
        std::fs::create_dir_all(shelf_dir_parent)?;
        let path = shelf_dir_parent.join(format!("{shelf_id}.index"));
        let real = repo.path().join("index");
        if real.exists() {
            std::fs::copy(&real, &path)?;
        }
        Ok(ScratchIndex { path })
    }

    fn env(&self) -> (&'static str, String) {
        ("GIT_INDEX_FILE", self.path.to_string_lossy().into_owned())
    }
}

impl Drop for ScratchIndex {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.path);
    }
}

struct Selection {
    tracked: Vec<String>,
    untracked: Vec<String>,
}

/// Splits the chosen paths into tracked and untracked; refuses conflicted files.
fn select(repo: &git2::Repository, file_paths: &[String]) -> AppResult<Selection> {
    let wanted: HashSet<&str> = file_paths.iter().map(String::as_str).collect();
    let status = git_status::read(repo)?;
    let mut tracked = Vec::new();
    let mut untracked = Vec::new();
    for file in &status.files {
        let orig_wanted = file.orig_path.as_deref().is_some_and(|orig_path| wanted.contains(orig_path));
        // A nested repository shows up as an untracked "dir/": it is not a change to shelve.
        if (!wanted.contains(file.path.as_str()) && !orig_wanted) || file.path.ends_with('/') {
            continue;
        }
        if file.conflicted {
            return Err(AppError::invalid(format!("Resolve the conflict in {} before shelving it", file.path)));
        }
        if file.unstaged == Some(ChangeKind::Untracked) && file.staged.is_none() {
            untracked.push(file.path.clone());
        } else {
            tracked.push(file.path.clone());
            if let Some(orig_path) = &file.orig_path {
                tracked.push(orig_path.clone());
            }
        }
    }
    tracked.sort();
    tracked.dedup();
    Ok(Selection { tracked, untracked })
}

fn run_shelve(repo_path: &str, name: &str, file_paths: &[String], keep_in_working_tree: bool) -> AppResult<ShelfEntry> {
    let name = clean_name(name)?;
    for file_path in file_paths {
        safe_join(repo_path, file_path)?;
    }
    let repo = git_repo::open(repo_path)?;
    let selection = select(&repo, file_paths)?;
    if selection.tracked.is_empty() && selection.untracked.is_empty() {
        return Err(AppError::invalid("There are no changes to shelve"));
    }
    let root = Path::new(repo_path);
    let shelf = Shelf::of(&repo);
    let shelf_id = shelf.new_id();
    let head = repo.head().ok();
    let unborn = head.is_none();
    let branch = git_status::head_info(&repo).branch;
    let head_commit = head.and_then(|reference| reference.target()).map(|object_id| object_id.to_string());

    // New files join a scratch copy of the index as intent-to-add, so one `git diff HEAD`
    // includes them (and pairs moves into renames) without touching the real index.
    let scratch = ScratchIndex::create(&repo, &repo.commondir().join(crate::shelf::store::SHELF_DIR), &shelf_id)?;
    let (env_key, env_value) = scratch.env();
    let envs = [(env_key, env_value.as_str())];
    if !selection.untracked.is_empty() {
        cli::run_with_env(root, &with_paths(&["add", "--intent-to-add"], &selection.untracked), &envs)?;
    }
    let mut paths = selection.tracked.clone();
    paths.extend(selection.untracked.iter().cloned());
    let base = if unborn { EMPTY_TREE } else { "HEAD" };
    let mut raw_args = vec!["diff"];
    raw_args.extend(RAW_FLAGS);
    raw_args.push(base);
    let raw = cli::run_bytes_with_env(root, &with_paths(&raw_args, &paths), &envs)?;
    let mut patch_args = vec!["diff"];
    patch_args.extend(PATCH_FLAGS);
    patch_args.push(base);
    let patch = cli::run_bytes_with_env(root, &with_paths(&patch_args, &paths), &envs)?;
    drop(scratch);

    let sections = split_sections(&patch);
    let changes = parse_raw(&raw);
    if sections.is_empty() {
        return Err(AppError::invalid("There are no changes to shelve"));
    }
    if sections.len() != changes.len() {
        return Err(AppError::invalid("Could not read the changes to shelve"));
    }
    let files: Vec<ShelvedFile> = changes
        .into_iter()
        .zip(&sections)
        .map(|(change, section)| ShelvedFile {
            path: change.path,
            old_path: change.old_path,
            change: change.change,
            binary: parse_section(section).binary,
            old_id: change.old_id,
        })
        .collect();
    let entry = ShelfEntry::new(shelf_id, name, branch, head_commit, files);

    // Saved first, then checked: the work tree is only touched once the patch is safe on disk
    // and is known to take the changes out again exactly.
    shelf.save(&entry, &patch)?;
    let mut check_args = vec!["apply", "--check", "-R"];
    check_args.extend(APPLY_FLAGS);
    check_args.push("-");
    let check = cli::run_raw(root, &check_args, Some(&patch));
    let check_error = match check {
        Ok(output) if output.success => None,
        Ok(output) => Some(output.text()),
        Err(err) => Some(err.to_string()),
    };
    if let Some(reason) = check_error {
        let _ = shelf.delete(&entry.id);
        return Err(AppError::Command {
            message: format!("Could not shelve: the changes would not revert cleanly. {reason}"),
        });
    }
    if keep_in_working_tree {
        return Ok(entry);
    }
    revert(repo_path, &patch, &entry, &selection.untracked).map_err(|err| AppError::Command {
        message: format!("The changes are on the shelf, but could not be reverted: {err}"),
    })?;
    Ok(entry)
}

/// Takes shelved changes out of the work tree, then puts the index of their tracked paths
/// back to HEAD. Paths without a section in the patch are never touched.
fn revert(repo_path: &str, patch: &[u8], entry: &ShelfEntry, untracked: &[String]) -> AppResult<()> {
    let root = Path::new(repo_path);
    let mut apply_args = vec!["apply", "-R"];
    apply_args.extend(APPLY_FLAGS);
    apply_args.push("-");
    cli::run_with_stdin(root, &apply_args, patch)?;
    let untracked: HashSet<&str> = untracked.iter().map(String::as_str).collect();
    let mut index_paths: Vec<String> = entry
        .files
        .iter()
        .flat_map(|file| std::iter::once(file.path.clone()).chain(file.old_path.clone()))
        .filter(|file_path| !untracked.contains(file_path.as_str()))
        .collect();
    index_paths.sort();
    index_paths.dedup();
    if index_paths.is_empty() {
        return Ok(());
    }
    let unborn = git_repo::open(repo_path)?.head().is_err();
    if unborn {
        cli::run(root, &with_paths(&["rm", "--cached", "-r", "-q", "--ignore-unmatch"], &index_paths))?;
    } else {
        cli::run(root, &with_paths(&["reset", "-q"], &index_paths))?;
    }
    Ok(())
}

fn section_indexes(entry: &ShelfEntry, file_paths: Option<&[String]>) -> Vec<usize> {
    match file_paths {
        None => (0..entry.files.len()).collect(),
        Some(file_paths) => {
            let wanted: HashSet<&str> = file_paths.iter().map(String::as_str).collect();
            (0..entry.files.len()).filter(|index| wanted.contains(entry.files[*index].path.as_str())).collect()
        }
    }
}

fn loaded_sections(entry: &ShelfEntry, patch: &[u8]) -> AppResult<Vec<Vec<u8>>> {
    let sections: Vec<Vec<u8>> = split_sections(patch).into_iter().map(<[u8]>::to_vec).collect();
    if sections.len() != entry.files.len() {
        return Err(AppError::invalid("The shelved patch does not match its file list"));
    }
    Ok(sections)
}

/// Applies a patch to the work tree; when it does not fit, a 3-way merge with the blobs it
/// names, which may stop with conflicts (as Apply Patch does).
fn apply_patch_bytes(repo_path: &str, patch: &[u8]) -> AppResult<OpOutcome> {
    let root = Path::new(repo_path);
    let mut check_args = vec!["apply", "--check"];
    check_args.extend(APPLY_FLAGS);
    check_args.push("-");
    let check = cli::run_raw(root, &check_args, Some(patch))?;
    if check.success {
        let mut apply_args = vec!["apply"];
        apply_args.extend(APPLY_FLAGS);
        apply_args.push("-");
        let applied = cli::run_with_stdin(root, &apply_args, patch)?;
        return Ok(OpOutcome {
            output: applied.text(),
            conflicts: false,
        });
    }
    let mut merge_args = vec!["apply", "--3way"];
    merge_args.extend(APPLY_FLAGS);
    merge_args.push("-");
    let merged = cli::run_raw(root, &merge_args, Some(patch))?;
    let conflicts = has_conflicts(repo_path);
    if merged.success || conflicts {
        return Ok(OpOutcome {
            output: merged.text(),
            conflicts,
        });
    }
    let reason = check.text();
    let reason = if reason.is_empty() { merged.text() } else { reason };
    Err(AppError::Command {
        message: format!("The shelved changes do not apply: {reason}"),
    })
}

fn run_unshelve(
    repo_path: &str,
    shelf_id: &str,
    file_paths: Option<&[String]>,
    remove_from_shelf: bool,
) -> AppResult<OpOutcome> {
    let repo = git_repo::open(repo_path)?;
    let shelf = Shelf::of(&repo);
    let (mut entry, patch) = shelf.load(shelf_id)?;
    let sections = loaded_sections(&entry, &patch)?;
    let chosen = section_indexes(&entry, file_paths);
    if chosen.is_empty() {
        return Err(AppError::invalid("Choose the files to unshelve"));
    }
    let selected: Vec<u8> = chosen.iter().flat_map(|index| sections[*index].iter().copied()).collect();
    let outcome = apply_patch_bytes(repo_path, &selected)?;
    if !remove_from_shelf || outcome.conflicts {
        return Ok(outcome);
    }
    if chosen.len() == entry.files.len() {
        shelf.delete(shelf_id)?;
        return Ok(outcome);
    }
    let applied: HashSet<usize> = chosen.into_iter().collect();
    let mut rest = Vec::new();
    let mut files = Vec::new();
    for (index, (file, section)) in entry.files.iter().zip(&sections).enumerate() {
        if !applied.contains(&index) {
            rest.extend_from_slice(section);
            files.push(file.clone());
        }
    }
    entry.files = files;
    shelf.save(&entry, &rest)?;
    Ok(outcome)
}

/// A shelved file as a read-only diff: the blob it started from and that blob with the hunks applied.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShelfFileDiff {
    pub diff: FileDiff,
    pub file: ShelvedFile,
    /// The original is gone from the repository: only the changed lines and their context show.
    pub partial: bool,
}

fn blob_bytes(repo: &git2::Repository, object_id: Option<&str>) -> Option<Vec<u8>> {
    let object_id = git2::Oid::from_str(object_id?).ok()?;
    Some(repo.find_blob(object_id).ok()?.content().to_vec())
}

fn run_shelf_file_diff(repo_path: &str, shelf_id: &str, file_path: &str) -> AppResult<ShelfFileDiff> {
    let repo = git_repo::open(repo_path)?;
    let (entry, patch) = Shelf::of(&repo).load(shelf_id)?;
    let sections = loaded_sections(&entry, &patch)?;
    let index = entry
        .files
        .iter()
        .position(|file| file.path == file_path)
        .ok_or_else(|| AppError::invalid(format!("{file_path} is not in these shelved changes")))?;
    let file = entry.files[index].clone();
    let info = parse_section(&sections[index]);
    if info.binary {
        let mut diff = diff::from_bytes(file_path, None, None);
        diff.binary = true;
        return Ok(ShelfFileDiff { diff, file, partial: false });
    }
    let old_id = info.old_id.clone().or_else(|| file.old_id.clone());
    let original = match old_id.as_deref() {
        Some(object_id) if is_zero_id(object_id) => Some(Vec::new()),
        None if file.change == ShelvedChange::Added => Some(Vec::new()),
        other => blob_bytes(&repo, other),
    };
    let rebuilt = original.and_then(|original| {
        let modified = apply_hunks(&original, &info.hunks)?;
        Some((original, modified))
    });
    let (original, modified, partial) = match rebuilt {
        Some((original, modified)) => (original, modified, false),
        None => {
            let (original, modified) = hunk_sides(&info.hunks);
            (original, modified, true)
        }
    };
    Ok(ShelfFileDiff {
        diff: diff::from_bytes(file_path, Some(original), Some(modified)),
        file,
        partial,
    })
}

fn run_rename_shelf(repo_path: &str, shelf_id: &str, name: &str) -> AppResult<ShelfEntry> {
    let name = clean_name(name)?;
    let shelf = Shelf::of(&git_repo::open(repo_path)?);
    let (mut entry, _) = shelf.load(shelf_id)?;
    entry.name = name;
    shelf.save_meta(&entry)?;
    Ok(entry)
}

#[crate::command]
pub async fn shelve_changes(
    repo_path: String,
    name: String,
    file_paths: Vec<String>,
    keep_in_working_tree: bool,
) -> AppResult<ShelfEntry> {
    blocking(move || run_shelve(&repo_path, &name, &file_paths, keep_in_working_tree)).await
}

#[crate::command]
pub async fn list_shelf(repo_path: String) -> AppResult<Vec<ShelfEntry>> {
    blocking(move || Shelf::of(&git_repo::open(&repo_path)?).list()).await
}

/// Applies a shelved change list, or only `file_paths` of it. With `remove_from_shelf`, what
/// applied without conflicts leaves the shelf.
#[crate::command]
pub async fn unshelve(
    repo_path: String,
    shelf_id: String,
    file_paths: Option<Vec<String>>,
    remove_from_shelf: bool,
) -> AppResult<OpOutcome> {
    blocking(move || run_unshelve(&repo_path, &shelf_id, file_paths.as_deref(), remove_from_shelf)).await
}

#[crate::command]
pub async fn shelf_file_diff(repo_path: String, shelf_id: String, file_path: String) -> AppResult<ShelfFileDiff> {
    blocking(move || run_shelf_file_diff(&repo_path, &shelf_id, &file_path)).await
}

#[crate::command]
pub async fn rename_shelf(repo_path: String, shelf_id: String, name: String) -> AppResult<ShelfEntry> {
    blocking(move || run_rename_shelf(&repo_path, &shelf_id, &name)).await
}

/// Deletes shelved changes for good; the UI confirms first.
#[crate::command]
pub async fn delete_shelf(repo_path: String, shelf_id: String) -> AppResult<()> {
    blocking(move || Shelf::of(&git_repo::open(&repo_path)?).delete(&shelf_id)).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::{image_bytes, TestRepo};

    fn strings(values: &[&str]) -> Vec<String> {
        values.iter().map(|value| value.to_string()).collect()
    }

    fn all_changes(repo: &TestRepo) -> Vec<String> {
        let status = git_status::read(&repo.open()).unwrap();
        status.files.into_iter().map(|file| file.path).collect()
    }

    /// A repository with a committed base and one change of every kind in the work tree.
    fn changed_repo() -> TestRepo {
        let repo = TestRepo::new();
        repo.write("modified.txt", "one\ntwo\nthree\n");
        repo.write("deleted.txt", "bye\n");
        repo.write("image.bin", image_bytes(&[1, 2, 3]));
        repo.write("old name.txt", "a file that will move\nwith enough lines\nto be a rename\n");
        repo.write("staged.txt", "base\n");
        repo.commit_all("base");

        repo.write("modified.txt", "one\nTWO\nthree\n");
        repo.remove("deleted.txt");
        repo.write("image.bin", image_bytes(&[9, 8, 7, 0, 6]));
        repo.git(&["mv", "old name.txt", "new name.txt"]);
        repo.write("staged.txt", "staged\n");
        repo.git(&["add", "staged.txt"]);
        repo.write("staged.txt", "staged then edited\n");
        repo.write("untracked dir/new file.txt", "brand new\n");
        repo.write("added.txt", "added and staged\n");
        repo.git(&["add", "added.txt"]);
        repo
    }

    fn snapshot(repo: &TestRepo) -> Vec<(String, Option<Vec<u8>>)> {
        [
            "modified.txt",
            "deleted.txt",
            "image.bin",
            "old name.txt",
            "new name.txt",
            "staged.txt",
            "untracked dir/new file.txt",
            "added.txt",
        ]
        .iter()
        .map(|file_path| (file_path.to_string(), std::fs::read(repo.file(file_path)).ok()))
        .collect()
    }

    #[test]
    fn shelve_and_unshelve_round_trip_every_kind_of_change() {
        let repo = changed_repo();
        let before = snapshot(&repo);
        let entry = run_shelve(&repo.path_string(), "  Everything ", &all_changes(&repo), false).unwrap();
        assert_eq!(entry.name, "Everything");
        assert_eq!(entry.branch.as_deref(), Some("main"));

        // The work tree and the index are back at HEAD.
        assert_eq!(repo.porcelain(), "", "clean after shelving");
        assert_eq!(repo.read_text("modified.txt"), "one\ntwo\nthree\n");
        assert!(repo.exists("deleted.txt"));
        assert!(repo.exists("old name.txt") && !repo.exists("new name.txt"));
        assert!(!repo.exists("untracked dir/new file.txt"));

        let changes: Vec<(String, ShelvedChange)> =
            entry.files.iter().map(|file| (file.path.clone(), file.change)).collect();
        assert!(changes.contains(&("new name.txt".to_string(), ShelvedChange::Renamed)), "{changes:?}");
        assert!(changes.contains(&("untracked dir/new file.txt".to_string(), ShelvedChange::Added)));
        assert!(changes.contains(&("deleted.txt".to_string(), ShelvedChange::Deleted)));
        assert!(entry.files.iter().any(|file| file.path == "image.bin" && file.binary));

        let listed = block_list(&repo);
        assert_eq!(listed, vec![entry.clone()]);
        let stored = Shelf::of(&repo.open());
        assert!(stored.dir().join(format!("{}.patch", entry.id)).exists());
        assert!(stored.dir().join(format!("{}.json", entry.id)).exists());
        assert!(!stored.dir().join(format!("{}.index", entry.id)).exists(), "the scratch index is removed");

        let outcome = run_unshelve(&repo.path_string(), &entry.id, None, true).unwrap();
        assert!(!outcome.conflicts);
        assert_eq!(snapshot(&repo), before, "every file is back as it was");
        assert!(block_list(&repo).is_empty(), "removed from the shelf once applied");
        // Unshelving does not stage: the new files are untracked again.
        assert!(repo.porcelain().contains("?? added.txt"), "{}", repo.porcelain());
    }

    fn block_list(repo: &TestRepo) -> Vec<ShelfEntry> {
        crate::test_support::block_on(list_shelf(repo.path_string())).unwrap()
    }

    #[test]
    fn keep_in_working_tree_only_saves_the_patch() {
        let repo = changed_repo();
        let porcelain = repo.porcelain();
        let entry = run_shelve(&repo.path_string(), "Kept", &strings(&["modified.txt"]), true).unwrap();
        assert_eq!(repo.porcelain(), porcelain, "nothing changed on disk or in the index");
        assert_eq!(entry.files.len(), 1);

        // Only the chosen file is reverted when not kept; the rest stays.
        let second = run_shelve(&repo.path_string(), "Second", &strings(&["modified.txt"]), false).unwrap();
        assert_eq!(repo.read_text("modified.txt"), "one\ntwo\nthree\n");
        assert_eq!(repo.read_text("staged.txt"), "staged then edited\n");
        assert_eq!(block_list(&repo).iter().map(|entry| entry.id.clone()).collect::<Vec<_>>(), vec![second.id, entry.id]);
    }

    #[test]
    fn partial_unshelve_keeps_the_other_files_on_the_shelf() {
        let repo = changed_repo();
        let entry = run_shelve(&repo.path_string(), "Two", &strings(&["modified.txt", "untracked dir/new file.txt"]), false)
            .unwrap();
        assert_eq!(entry.files.len(), 2);
        let only = strings(&["untracked dir/new file.txt"]);
        run_unshelve(&repo.path_string(), &entry.id, Some(&only), true).unwrap();
        assert_eq!(repo.read_text("untracked dir/new file.txt"), "brand new\n");
        assert_eq!(repo.read_text("modified.txt"), "one\ntwo\nthree\n");
        let left = block_list(&repo);
        assert_eq!(left.len(), 1);
        assert_eq!(left[0].files.iter().map(|file| file.path.as_str()).collect::<Vec<_>>(), vec!["modified.txt"]);

        // Kept on the shelf when asked, so it can be applied again.
        run_unshelve(&repo.path_string(), &entry.id, None, false).unwrap();
        assert_eq!(repo.read_text("modified.txt"), "one\nTWO\nthree\n");
        assert_eq!(block_list(&repo).len(), 1);
        let none = run_unshelve(&repo.path_string(), &entry.id, Some(&strings(&["nope"])), true);
        assert!(none.is_err());
    }

    #[test]
    fn unshelve_onto_changed_lines_stops_with_conflicts_and_keeps_the_shelf() {
        let repo = TestRepo::new();
        repo.write("f.txt", "alpha\nbravo\ncharlie\n");
        repo.commit_all("base");
        repo.write("f.txt", "alpha\nBRAVO shelved\ncharlie\n");
        let entry = run_shelve(&repo.path_string(), "Conflicting", &strings(&["f.txt"]), false).unwrap();
        repo.write("f.txt", "alpha\nBRAVO committed\ncharlie\n");
        repo.commit_all("other change");

        let outcome = run_unshelve(&repo.path_string(), &entry.id, None, true).unwrap();
        assert!(outcome.conflicts);
        assert!(repo.read_text("f.txt").contains("<<<<<<<"));
        assert_eq!(block_list(&repo).len(), 1, "kept on the shelf while in conflict");
    }

    #[test]
    fn shelving_refuses_nothing_conflicts_and_escaping_paths() {
        let repo = TestRepo::new();
        repo.write("f.txt", "base\n");
        repo.commit_all("base");
        let nothing = run_shelve(&repo.path_string(), "Empty", &strings(&["f.txt"]), false).unwrap_err();
        assert_eq!(nothing.to_string(), "There are no changes to shelve");
        assert!(run_shelve(&repo.path_string(), "Bad", &strings(&["../x"]), false).is_err());
        assert!(run_shelve(&repo.path_string(), " ", &strings(&["f.txt"]), false).is_err());
        assert!(block_list(&repo).is_empty());

        let conflicted = crate::test_support::merge_conflict_repo();
        let error = run_shelve(&conflicted.path_string(), "Conflict", &strings(&["both.txt"]), false).unwrap_err();
        assert!(error.to_string().contains("Resolve the conflict"), "{error}");
    }

    #[test]
    fn works_before_the_first_commit() {
        let repo = TestRepo::new();
        repo.write("first.txt", "first\n");
        repo.git(&["add", "first.txt"]);
        repo.write("loose.txt", "loose\n");
        let entry = run_shelve(&repo.path_string(), "Unborn", &strings(&["first.txt", "loose.txt"]), false).unwrap();
        assert_eq!(repo.porcelain(), "");
        run_unshelve(&repo.path_string(), &entry.id, None, true).unwrap();
        assert_eq!(repo.read_text("first.txt"), "first\n");
        assert_eq!(repo.read_text("loose.txt"), "loose\n");
    }

    #[test]
    fn show_diff_rebuilds_both_sides_from_the_patch() {
        let repo = changed_repo();
        let entry = run_shelve(&repo.path_string(), "Diffs", &all_changes(&repo), false).unwrap();
        let diff = |file_path: &str| run_shelf_file_diff(&repo.path_string(), &entry.id, file_path).unwrap();

        let modified = diff("modified.txt");
        assert_eq!(modified.diff.original, "one\ntwo\nthree\n");
        assert_eq!(modified.diff.modified, "one\nTWO\nthree\n");
        assert!(!modified.partial);

        let added = diff("untracked dir/new file.txt");
        assert_eq!(added.diff.original, "");
        assert_eq!(added.diff.modified, "brand new\n");

        let deleted = diff("deleted.txt");
        assert_eq!(deleted.diff.original, "bye\n");
        assert_eq!(deleted.diff.modified, "");

        let renamed = diff("new name.txt");
        assert_eq!(renamed.diff.original, renamed.diff.modified);
        assert!(renamed.diff.original.starts_with("a file that will move"));

        assert!(diff("image.bin").diff.binary);
        assert!(run_shelf_file_diff(&repo.path_string(), &entry.id, "nope").is_err());
    }

    #[test]
    fn rename_and_delete() {
        let repo = changed_repo();
        let entry = run_shelve(&repo.path_string(), "Old", &strings(&["modified.txt"]), true).unwrap();
        let renamed = run_rename_shelf(&repo.path_string(), &entry.id, "New name").unwrap();
        assert_eq!(renamed.name, "New name");
        assert_eq!(block_list(&repo)[0].name, "New name");
        assert!(run_rename_shelf(&repo.path_string(), &entry.id, "  ").is_err());
        assert!(run_rename_shelf(&repo.path_string(), "../escape", "x").is_err());

        crate::test_support::block_on(delete_shelf(repo.path_string(), entry.id.clone())).unwrap();
        assert!(block_list(&repo).is_empty());
        assert!(run_unshelve(&repo.path_string(), &entry.id, None, true).is_err());
    }

    #[test]
    fn raw_listing_reads_renames_and_ids() {
        let raw = b":100644 100644 1111111111111111111111111111111111111111 0000000000000000000000000000000000000000 M\0a b.txt\0:000000 100644 0000000000000000000000000000000000000000 0000000000000000000000000000000000000000 A\0new\0:100644 100644 2222222222222222222222222222222222222222 2222222222222222222222222222222222222222 R100\0old\0moved\0";
        let changes = parse_raw(raw);
        assert_eq!(changes.len(), 3);
        assert_eq!(changes[0].path, "a b.txt");
        assert_eq!(changes[0].old_id.as_deref(), Some("1111111111111111111111111111111111111111"));
        assert_eq!(changes[1].change, ShelvedChange::Added);
        assert_eq!(changes[1].old_id, None);
        assert_eq!(changes[2].change, ShelvedChange::Renamed);
        assert_eq!(changes[2].path, "moved");
        assert_eq!(changes[2].old_path.as_deref(), Some("old"));
    }
}
