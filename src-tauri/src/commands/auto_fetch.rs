//! Background fetch for the auto fetch timer (src/lib/stores/autoFetch.svelte.ts). It runs
//! the same `git fetch --all --prune` as Fetch All Remotes, but never asks for anything:
//! no terminal prompt, no askpass window, no credential manager dialog, no SSH passphrase.
//! A fetch that would need one fails, and the timer backs off quietly.

use std::path::Path;

use git2::{Repository, RepositoryState};
use serde::Serialize;

use super::blocking;
use crate::error::AppResult;
use crate::git::bisect;
use crate::git::cli;
use crate::git::refs;
use crate::git::repo as git_repo;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum AutoFetchOutcome {
    Fetched,
    UpToDate,
    Skipped,
    Failed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum SkipReason {
    NoRemotes,
    Operation,
    Bisect,
    Busy,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum FetchErrorKind {
    Auth,
    Offline,
    Other,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AutoFetchResult {
    pub outcome: AutoFetchOutcome,
    pub skip_reason: Option<SkipReason>,
    pub error_kind: Option<FetchErrorKind>,
    /// Git's last error line when the fetch failed, else empty.
    pub message: String,
}

impl AutoFetchResult {
    fn plain(outcome: AutoFetchOutcome) -> AutoFetchResult {
        AutoFetchResult {
            outcome,
            skip_reason: None,
            error_kind: None,
            message: String::new(),
        }
    }

    fn skipped(reason: SkipReason) -> AutoFetchResult {
        AutoFetchResult {
            skip_reason: Some(reason),
            ..AutoFetchResult::plain(AutoFetchOutcome::Skipped)
        }
    }
}

fn skip_reason(repo: &Repository) -> Option<SkipReason> {
    let has_remote = repo.remotes().map(|names| !names.is_empty()).unwrap_or(false);
    if !has_remote {
        return Some(SkipReason::NoRemotes);
    }
    if bisect::is_active(repo) {
        return Some(SkipReason::Bisect);
    }
    if repo.state() != RepositoryState::Clean {
        return Some(SkipReason::Operation);
    }
    // Another git command is writing right now; try again next time.
    if repo.path().join("index.lock").exists() {
        return Some(SkipReason::Busy);
    }
    None
}

/// What a failed fetch's stderr says went wrong.
pub fn classify_error(stderr: &str) -> FetchErrorKind {
    let text = stderr.to_ascii_lowercase();
    let auth = [
        "could not read username",
        "could not read password",
        "terminal prompts disabled",
        "authentication failed",
        "permission denied",
        "host key verification failed",
        "invalid username or password",
        "http basic: access denied",
        "403",
        "401",
    ];
    let offline = [
        "could not resolve host",
        "couldn't connect",
        "failed to connect",
        "network is unreachable",
        "connection refused",
        "connection timed out",
        "operation timed out",
        "timed out",
        "no route to host",
    ];
    if auth.iter().any(|needle| text.contains(needle)) {
        return FetchErrorKind::Auth;
    }
    if offline.iter().any(|needle| text.contains(needle)) {
        return FetchErrorKind::Offline;
    }
    FetchErrorKind::Other
}

/// The last non-empty line, which is where git puts its "fatal:" reason.
fn last_line(text: &str) -> String {
    text.lines()
        .map(str::trim)
        .rfind(|line| !line.is_empty())
        .unwrap_or_default()
        .to_string()
}

/// True when the user set up their own SSH command, which must be left alone.
fn custom_ssh(repo: &Repository) -> bool {
    let from_env = ["GIT_SSH_COMMAND", "GIT_SSH"]
        .iter()
        .any(|name| std::env::var_os(name).is_some_and(|value| !value.is_empty()));
    let from_config = repo
        .config()
        .ok()
        .and_then(|config| config.get_string("core.sshCommand").ok())
        .is_some_and(|value| !value.trim().is_empty());
    from_env || from_config
}

pub(crate) fn run_auto_fetch(repo_path: &str) -> AppResult<AutoFetchResult> {
    let (before, ssh_batch) = {
        let repo = git_repo::open(repo_path)?;
        if let Some(reason) = skip_reason(&repo) {
            return Ok(AutoFetchResult::skipped(reason));
        }
        (refs::fingerprint(&repo), !custom_ssh(&repo))
    };
    let mut envs = vec![
        // Git Credential Manager: fail instead of opening its sign-in window.
        ("GCM_INTERACTIVE", "never"),
        // An empty askpass also turns off core.askpass and SSH_ASKPASS for git's own prompts.
        ("GIT_ASKPASS", ""),
        ("SSH_ASKPASS", ""),
        ("SSH_ASKPASS_REQUIRE", "never"),
    ];
    if ssh_batch {
        envs.push(("GIT_SSH_COMMAND", "ssh -o BatchMode=yes -o ConnectTimeout=20"));
    }
    let output = cli::run_raw_with_env(Path::new(repo_path), &["fetch", "--all", "--prune", "--quiet"], &envs, None)?;
    if !output.success {
        return Ok(AutoFetchResult {
            error_kind: Some(classify_error(&output.stderr)),
            message: last_line(&output.stderr),
            ..AutoFetchResult::plain(AutoFetchOutcome::Failed)
        });
    }
    let after = refs::fingerprint(&git_repo::open(repo_path)?);
    let outcome = if after == before {
        AutoFetchOutcome::UpToDate
    } else {
        AutoFetchOutcome::Fetched
    };
    Ok(AutoFetchResult::plain(outcome))
}

/// One quiet background fetch of every remote of `repo_path`.
#[crate::command]
pub async fn auto_fetch(repo_path: String) -> AppResult<AutoFetchResult> {
    blocking(move || run_auto_fetch(&repo_path)).await
}

#[cfg(test)]
mod tests {
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::time::{Duration, Instant};

    use super::*;
    use crate::test_support::{BareRemote, TestRepo};

    fn remote_with_clone() -> (BareRemote, TestRepo, TestRepo) {
        let remote = BareRemote::new();
        let seed = TestRepo::new();
        seed.git(&["remote", "add", "origin", &remote.path_string()]);
        seed.write("a.txt", "1\n");
        seed.commit_all("First");
        seed.git(&["push", "-q", "-u", "origin", "main"]);
        let local = TestRepo::clone_from(&remote);
        (remote, seed, local)
    }

    #[test]
    fn fetches_new_commits_then_reports_up_to_date() {
        let (_remote, seed, local) = remote_with_clone();
        let path = local.path_string();
        assert_eq!(run_auto_fetch(&path).unwrap().outcome, AutoFetchOutcome::UpToDate);
        seed.write("a.txt", "2\n");
        let second = seed.commit_all("Second");
        seed.git(&["push", "-q"]);
        assert_eq!(run_auto_fetch(&path).unwrap().outcome, AutoFetchOutcome::Fetched);
        assert_eq!(local.rev_parse("origin/main"), second);
        assert_eq!(local.git(&["rev-list", "--count", "main..origin/main"]).trim(), "1");
        assert_eq!(run_auto_fetch(&path).unwrap().outcome, AutoFetchOutcome::UpToDate);
    }

    #[test]
    fn prunes_deleted_remote_branches() {
        let (_remote, seed, local) = remote_with_clone();
        seed.git(&["push", "-q", "origin", "main:gone"]);
        run_auto_fetch(&local.path_string()).unwrap();
        assert!(local.git(&["branch", "-r"]).contains("origin/gone"));
        seed.git(&["push", "-q", "origin", "--delete", "gone"]);
        assert_eq!(run_auto_fetch(&local.path_string()).unwrap().outcome, AutoFetchOutcome::Fetched);
        assert!(!local.git(&["branch", "-r"]).contains("origin/gone"));
    }

    #[test]
    fn skips_repositories_it_should_leave_alone() {
        let lonely = TestRepo::new();
        lonely.write("a.txt", "1\n");
        lonely.commit_all("First");
        let result = run_auto_fetch(&lonely.path_string()).unwrap();
        assert_eq!(result.outcome, AutoFetchOutcome::Skipped);
        assert_eq!(result.skip_reason, Some(SkipReason::NoRemotes));

        let (_remote, _seed, local) = remote_with_clone();
        local.write("a.txt", "2\n");
        local.commit_all("Second");
        local.git(&["bisect", "start", "HEAD", "HEAD~1"]);
        assert_eq!(run_auto_fetch(&local.path_string()).unwrap().skip_reason, Some(SkipReason::Bisect));
        local.git(&["bisect", "reset"]);

        std::fs::write(local.path.join(".git/index.lock"), "").unwrap();
        assert_eq!(run_auto_fetch(&local.path_string()).unwrap().skip_reason, Some(SkipReason::Busy));
        std::fs::remove_file(local.path.join(".git/index.lock")).unwrap();
        local.git(&["switch", "-q", "-c", "side", "HEAD~1"]);
        local.write("b.txt", "b\n");
        local.commit_all("Side");
        local.checkout("main");
        local.git(&["merge", "-q", "--no-commit", "--no-ff", "side"]);
        assert_eq!(run_auto_fetch(&local.path_string()).unwrap().skip_reason, Some(SkipReason::Operation));
    }

    /// An HTTP server on 127.0.0.1 that asks every request for a password.
    fn password_server() -> (u16, std::thread::JoinHandle<usize>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        listener.set_nonblocking(true).unwrap();
        let handle = std::thread::spawn(move || {
            let deadline = Instant::now() + Duration::from_secs(20);
            let mut requests = 0;
            while Instant::now() < deadline {
                match listener.accept() {
                    Ok((mut stream, _)) => {
                        stream.set_nonblocking(false).unwrap();
                        stream.set_read_timeout(Some(Duration::from_secs(2))).unwrap();
                        let mut buffer = [0u8; 4096];
                        let _ = stream.read(&mut buffer);
                        requests += 1;
                        let reply = "HTTP/1.1 401 Unauthorized\r\nWWW-Authenticate: Basic realm=\"test\"\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
                        let _ = stream.write_all(reply.as_bytes());
                        if requests >= 3 {
                            break;
                        }
                    }
                    Err(_) => std::thread::sleep(Duration::from_millis(10)),
                }
            }
            requests
        });
        (port, handle)
    }

    #[test]
    fn fails_without_asking_for_a_password() {
        let local = TestRepo::new();
        local.write("a.txt", "1\n");
        local.commit_all("First");
        let (port, server) = password_server();
        local.git(&["remote", "add", "origin", &format!("http://127.0.0.1:{port}/private.git")]);
        let started = Instant::now();
        let result = run_auto_fetch(&local.path_string()).unwrap();
        assert!(started.elapsed() < Duration::from_secs(15), "the fetch waited for a prompt");
        assert_eq!(result.outcome, AutoFetchOutcome::Failed);
        assert_eq!(result.error_kind, Some(FetchErrorKind::Auth), "{}", result.message);
        assert!(!result.message.is_empty());
        drop(server);
    }

    #[test]
    fn reports_an_unreachable_remote_as_offline() {
        let local = TestRepo::new();
        local.write("a.txt", "1\n");
        local.commit_all("First");
        // Port 1 is privileged and unused, so the connection is refused. A freed ephemeral port
        // could be taken by another test's server running in parallel.
        local.git(&["remote", "add", "origin", "http://127.0.0.1:1/gone.git"]);
        let result = run_auto_fetch(&local.path_string()).unwrap();
        assert_eq!(result.outcome, AutoFetchOutcome::Failed);
        assert_eq!(result.error_kind, Some(FetchErrorKind::Offline), "{}", result.message);
    }

    #[test]
    fn classifies_git_errors() {
        let cases = [
            ("fatal: could not read Username for 'https://github.com': terminal prompts disabled", FetchErrorKind::Auth),
            ("git@github.com: Permission denied (publickey).\nfatal: Could not read from remote repository.", FetchErrorKind::Auth),
            ("fatal: Authentication failed for 'https://example.com/x.git/'", FetchErrorKind::Auth),
            ("fatal: unable to access 'https://github.com/x/': Could not resolve host: github.com", FetchErrorKind::Offline),
            ("ssh: connect to host github.com port 22: Network is unreachable", FetchErrorKind::Offline),
            ("fatal: 'origin' does not appear to be a git repository", FetchErrorKind::Other),
        ];
        for (stderr, kind) in cases {
            assert_eq!(classify_error(stderr), kind, "{stderr}");
        }
        assert_eq!(last_line("warning: x\nfatal: y\n\n"), "fatal: y");
    }
}
