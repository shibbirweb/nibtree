//! Helpers for tests that drive real git repositories in temporary directories.

use crate::paths::RealPath;
use std::cell::Cell;
use std::future::Future;
use std::path::{Path, PathBuf};
use std::process::{Command, Output};
use std::sync::OnceLock;

use tempfile::TempDir;

use crate::git::cli;

struct Sandbox {
    home: PathBuf,
    global_config: PathBuf,
}

/// Isolates every git child process (and libgit2) from the user's own config.
/// Runs before any test touches git, so no other thread reads the environment
/// while it is being changed.
fn sandbox() -> &'static Sandbox {
    static SANDBOX: OnceLock<Sandbox> = OnceLock::new();
    SANDBOX.get_or_init(|| {
        let home = std::env::temp_dir().join("nibtree-test-home");
        std::fs::create_dir_all(&home).expect("create sandbox home");
        let home = home.real_path().expect("canonicalize sandbox home");
        let global_config = home.join("gitconfig");
        if !global_config.exists() {
            std::fs::write(&global_config, "").expect("write empty global config");
        }
        std::env::set_var("HOME", &home);
        // config::home_dir() reads USERPROFILE first on Windows.
        std::env::set_var("USERPROFILE", &home);
        std::env::set_var("XDG_CONFIG_HOME", home.join(".config"));
        std::env::set_var("GIT_CONFIG_NOSYSTEM", "1");
        std::env::set_var("GIT_CONFIG_GLOBAL", &global_config);
        crate::git::repo::configure_libgit2();
        std::env::set_var("LC_ALL", "C");
        std::env::set_var("LANG", "C");
        Sandbox { home, global_config }
    })
}

const START_TIME: i64 = 1_700_000_000;

fn git_command(dir: &Path, time: i64) -> Command {
    let sandbox = sandbox();
    let date = format!("{time} +0000");
    let mut command = cli::command(dir);
    command
        .env("HOME", &sandbox.home)
        .env("USERPROFILE", &sandbox.home)
        .env("GIT_CONFIG_NOSYSTEM", "1")
        .env("GIT_CONFIG_GLOBAL", &sandbox.global_config)
        .env("GIT_AUTHOR_DATE", &date)
        .env("GIT_COMMITTER_DATE", &date);
    command
}

fn describe(dir: &Path, args: &[&str], output: &Output) -> String {
    format!(
        "git {} in {} failed\nstdout:\n{}\nstderr:\n{}",
        args.join(" "),
        dir.display(),
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    )
}

/// Runs git in `dir` and asserts success, returning stdout.
pub fn git_in(dir: &Path, args: &[&str]) -> String {
    let output = git_command(dir, START_TIME).args(args).output().expect("spawn git");
    assert!(output.status.success(), "{}", describe(dir, args, &output));
    String::from_utf8_lossy(&output.stdout).into_owned()
}

/// A path as the app hands it to the page (`paths::to_ui`), for expected values and page-style arguments.
pub trait UiText {
    fn ui(&self) -> String;
}

impl UiText for Path {
    fn ui(&self) -> String {
        crate::paths::to_ui(self)
    }
}

pub fn block_on<F: Future>(future: F) -> F::Output {
    crate::commands::block_on(future)
}

pub fn canonical(path: &Path) -> PathBuf {
    path.real_path().expect("canonicalize path")
}

/// A bare repository usable as a local remote.
pub struct BareRemote {
    _root: TempDir,
    pub path: PathBuf,
}

impl BareRemote {
    pub fn new() -> BareRemote {
        sandbox();
        let root = TempDir::new().expect("create temp dir");
        let path = canonical(root.path()).join("remote.git");
        std::fs::create_dir_all(&path).expect("create bare dir");
        git_in(&path, &["init", "--bare", "-q", "-b", "main"]);
        BareRemote { _root: root, path }
    }

    /// The path as the page sends it (see paths.rs).
    pub fn path_string(&self) -> String {
        crate::paths::to_ui(&self.path)
    }
}

/// A plain (non-git) temporary folder used as a workspace; repositories are
/// created inside it with `init_repo`.
pub struct TestDir {
    _root: TempDir,
    pub path: PathBuf,
}

impl TestDir {
    pub fn new() -> TestDir {
        sandbox();
        let root = TempDir::new().expect("create temp dir");
        let path = canonical(root.path()).join("workspace");
        std::fs::create_dir_all(&path).expect("create workspace dir");
        TestDir { _root: root, path }
    }

    /// The path as the page sends it (see paths.rs).
    pub fn path_string(&self) -> String {
        crate::paths::to_ui(&self.path)
    }

    /// Absolute path of `relative_path` ("" is the folder itself).
    pub fn file(&self, relative_path: &str) -> PathBuf {
        if relative_path.is_empty() {
            self.path.clone()
        } else {
            self.path.join(relative_path)
        }
    }

    pub fn file_string(&self, relative_path: &str) -> String {
        crate::paths::to_ui(self.file(relative_path))
    }

    pub fn mkdir(&self, relative_path: &str) {
        std::fs::create_dir_all(self.file(relative_path)).expect("create dir");
    }

    pub fn write(&self, relative_path: &str, content: impl AsRef<[u8]>) {
        let full = self.file(relative_path);
        if let Some(parent) = full.parent() {
            std::fs::create_dir_all(parent).expect("create parent dir");
        }
        std::fs::write(full, content).expect("write file");
    }

    /// `git init -b main` in `relative_path`, creating it when needed.
    pub fn init_repo(&self, relative_path: &str) -> PathBuf {
        let dir = self.file(relative_path);
        std::fs::create_dir_all(&dir).expect("create repo dir");
        git_in(&dir, &["init", "-q", "-b", "main"]);
        dir
    }
}

pub struct TestRepo {
    _root: TempDir,
    pub path: PathBuf,
    hooks: PathBuf,
    clock: Cell<i64>,
}

impl TestRepo {
    fn scaffold() -> (TempDir, PathBuf, PathBuf) {
        sandbox();
        let root = TempDir::new().expect("create temp dir");
        let base = canonical(root.path());
        let hooks = base.join("hooks");
        std::fs::create_dir_all(&hooks).expect("create hooks dir");
        (root, base.join("repo"), hooks)
    }

    /// `git init -b main` with repo-local config only.
    pub fn new() -> TestRepo {
        let (root, path, hooks) = Self::scaffold();
        std::fs::create_dir_all(&path).expect("create repo dir");
        git_in(&path, &["init", "-q", "-b", "main"]);
        let repo = TestRepo {
            _root: root,
            path,
            hooks,
            clock: Cell::new(START_TIME),
        };
        repo.configure();
        repo
    }

    pub fn clone_from(remote: &BareRemote) -> TestRepo {
        let (root, path, hooks) = Self::scaffold();
        let base = path.parent().expect("repo parent").to_path_buf();
        git_in(&base, &["clone", "-q", &remote.path_string(), "repo"]);
        let repo = TestRepo {
            _root: root,
            path,
            hooks,
            clock: Cell::new(START_TIME + 10_000),
        };
        repo.configure();
        repo
    }

    fn configure(&self) {
        let hooks = self.hooks.to_string_lossy().into_owned();
        let settings = [
            ("user.name", "Test User"),
            ("user.email", "test@example.com"),
            ("commit.gpgsign", "false"),
            ("tag.gpgsign", "false"),
            ("core.hooksPath", hooks.as_str()),
            ("core.autocrlf", "false"),
            ("core.filemode", "true"),
            ("merge.conflictstyle", "merge"),
            ("pull.rebase", "false"),
            ("init.defaultBranch", "main"),
            ("rerere.enabled", "false"),
            ("advice.detachedHead", "false"),
        ];
        for (key, value) in settings {
            self.git(&["config", key, value]);
        }
    }

    /// The path as the page sends it (see paths.rs).
    pub fn path_string(&self) -> String {
        crate::paths::to_ui(&self.path)
    }

    pub fn open(&self) -> git2::Repository {
        git2::Repository::open(&self.path).expect("open repository")
    }

    pub fn git_raw(&self, args: &[&str]) -> Output {
        git_command(&self.path, self.clock.get()).args(args).output().expect("spawn git")
    }

    /// Runs git in the work tree and asserts success, returning stdout.
    pub fn git(&self, args: &[&str]) -> String {
        let output = self.git_raw(args);
        assert!(output.status.success(), "{}", describe(&self.path, args, &output));
        String::from_utf8_lossy(&output.stdout).into_owned()
    }

    pub fn file(&self, file_path: &str) -> PathBuf {
        self.path.join(file_path)
    }

    pub fn write(&self, file_path: &str, content: impl AsRef<[u8]>) {
        let full = self.file(file_path);
        if let Some(parent) = full.parent() {
            std::fs::create_dir_all(parent).expect("create parent dir");
        }
        std::fs::write(full, content).expect("write file");
    }

    pub fn read(&self, file_path: &str) -> Vec<u8> {
        std::fs::read(self.file(file_path)).expect("read file")
    }

    pub fn read_text(&self, file_path: &str) -> String {
        String::from_utf8(self.read(file_path)).expect("utf-8 file")
    }

    pub fn exists(&self, file_path: &str) -> bool {
        self.file(file_path).exists()
    }

    pub fn remove(&self, file_path: &str) {
        std::fs::remove_file(self.file(file_path)).expect("remove file");
    }

    /// Stages everything and commits with a deterministic, increasing date.
    pub fn commit_all(&self, message: &str) -> String {
        self.clock.set(self.clock.get() + 60);
        self.git(&["add", "-A"]);
        self.git(&["commit", "-q", "-m", message]);
        self.head()
    }

    pub fn head(&self) -> String {
        self.rev_parse("HEAD")
    }

    pub fn rev_parse(&self, revision: &str) -> String {
        self.git(&["rev-parse", revision]).trim().to_string()
    }

    pub fn branch(&self, branch_name: &str) {
        self.git(&["branch", branch_name]);
    }

    pub fn checkout(&self, branch_name: &str) {
        self.git(&["checkout", "-q", branch_name]);
    }

    /// Runs `git merge` and asserts it stopped with conflicts in the index.
    pub fn merge_expecting_conflict(&self, branch_name: &str) {
        let output = self.git_raw(&["merge", "--no-edit", branch_name]);
        assert!(!output.status.success(), "merge of {branch_name} unexpectedly succeeded");
        assert!(!self.unmerged().is_empty(), "{}", describe(&self.path, &["merge", branch_name], &output));
    }

    /// `git ls-files -u` output (empty when nothing is in conflict).
    pub fn unmerged(&self) -> String {
        self.git(&["ls-files", "-u"])
    }

    /// Content of the stage 0 index entry, `git show :path`.
    pub fn index_text(&self, file_path: &str) -> String {
        self.git(&["show", &format!(":{file_path}")])
    }

    pub fn index_bytes(&self, file_path: &str) -> Vec<u8> {
        self.git_raw(&["show", &format!(":{file_path}")]).stdout
    }

    /// `git ls-files -s path`, e.g. "100644 <oid> 0\tpath".
    pub fn index_entry(&self, file_path: &str) -> String {
        self.git(&["ls-files", "-s", "--", file_path]).trim().to_string()
    }

    pub fn porcelain(&self) -> String {
        self.git(&["status", "--porcelain"])
    }

    pub fn parent_count(&self, revision: &str) -> usize {
        let line = self.git(&["rev-list", "--parents", "-n", "1", revision]);
        line.split_whitespace().count() - 1
    }

    pub fn head_message(&self) -> String {
        self.git(&["log", "-1", "--format=%B"])
    }

    pub fn add_remote(&self, remote_name: &str, remote: &BareRemote) {
        self.git(&["remote", "add", remote_name, &remote.path_string()]);
    }
}

pub const BOTH_BASE: &str = "alpha\nbravo\ncharlie\ndelta\necho\nfoxtrot\ngolf\nhotel\nindia\njuliet\nkilo\nlima\n";
pub const BOTH_OURS: &str =
    "alpha\nBRAVO ours\ncharlie\ndelta\necho\nfoxtrot\ngolf\nhotel ours\nindia\njuliet\nkilo\nlima\n";
pub const BOTH_THEIRS: &str =
    "alpha\nbravo\ncharlie\ndelta\necho\nfoxtrot\ngolf\nhotel theirs\nindia\njuliet\nkilo\nLIMA theirs\n";
pub const CRLF_BASE: &str = "one\r\ntwo\r\nthree\r\n";
pub const CRLF_OURS: &str = "one\r\ntwo ours\r\nthree\r\n";
pub const CRLF_THEIRS: &str = "one\r\ntwo theirs\r\nthree\r\n";
pub const ADDED_OURS: &str = "added on main\n";
pub const ADDED_THEIRS: &str = "added on feature\n";
pub const DELETED_BY_US_THEIRS: &str = "This file is deleted on main\nand edited on feature.\nfeature edit\n";
pub const DELETED_BY_THEM_OURS: &str = "This file is edited on main\nand deleted on feature.\nmain edit\n";

pub fn image_bytes(tail: &[u8]) -> Vec<u8> {
    let mut bytes = b"\x89PNG\r\n\x1a\n\x00\x00\x00\x0dIHDR\x00\x00\x00\x01".to_vec();
    bytes.extend_from_slice(tail);
    bytes
}

/// A repository on `main` stopped in `git merge feature` with conflicts:
/// both.txt (both modified, one clean chunk per side plus one conflict),
/// added.txt (both added), deleted_by_us.txt, deleted_by_them.txt,
/// image.bin (binary) and crlf.txt (CRLF line endings).
pub fn merge_conflict_repo() -> TestRepo {
    let repo = TestRepo::new();
    repo.write("both.txt", BOTH_BASE);
    repo.write("deleted_by_us.txt", "This file is deleted on main\nand edited on feature.\n");
    repo.write("deleted_by_them.txt", "This file is edited on main\nand deleted on feature.\n");
    repo.write("image.bin", image_bytes(&[0, 1, 2, 3]));
    repo.write("crlf.txt", CRLF_BASE);
    repo.write("clean.txt", "untouched\n");
    repo.commit_all("base");
    repo.branch("feature");

    repo.write("both.txt", BOTH_OURS);
    repo.remove("deleted_by_us.txt");
    repo.write("deleted_by_them.txt", DELETED_BY_THEM_OURS);
    repo.write("image.bin", image_bytes(&[9, 9, 9]));
    repo.write("crlf.txt", CRLF_OURS);
    repo.write("added.txt", ADDED_OURS);
    repo.commit_all("main changes");

    repo.checkout("feature");
    repo.write("both.txt", BOTH_THEIRS);
    repo.write("deleted_by_us.txt", DELETED_BY_US_THEIRS);
    repo.remove("deleted_by_them.txt");
    repo.write("image.bin", image_bytes(&[7, 7, 7]));
    repo.write("crlf.txt", CRLF_THEIRS);
    repo.write("added.txt", ADDED_THEIRS);
    repo.commit_all("feature changes");

    repo.checkout("main");
    repo.merge_expecting_conflict("feature");
    repo
}

/// `main` and `feature` both edit f.txt from a shared base. `feature` has a
/// second, non-conflicting commit adding other.txt. Leaves `feature` checked out.
pub fn diverged_repo() -> TestRepo {
    let repo = TestRepo::new();
    repo.write("f.txt", "base\n");
    repo.commit_all("base");
    repo.branch("feature");
    repo.write("f.txt", "main\n");
    repo.commit_all("main change");
    repo.checkout("feature");
    repo.write("f.txt", "feature\n");
    repo.commit_all("feature change");
    repo.write("other.txt", "other\n");
    repo.commit_all("feature second");
    repo
}
