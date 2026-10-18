pub mod ai;
pub mod askpass;
pub mod auto_fetch;
pub mod bisect;
pub mod browse;
pub mod branch;
pub mod branch_actions;
pub mod commit_options;
pub mod compare;
pub mod config;
pub mod console;
pub mod editor;
pub mod file_ops;
pub mod files;
pub mod history;
pub mod identity;
pub mod ignore;
pub mod integrate;
pub mod lfs;
pub mod lines;
pub mod revision_lines;
pub mod local_history;
pub mod mcp;
pub mod merge;
pub mod patch;
pub mod rebase;
pub mod rebase_merges;
pub mod reflog;
pub mod remote;
pub mod repo;
pub mod scripts;
pub mod search;
pub mod shelf;
pub mod stash;
pub mod status;
pub mod submodule;
pub mod tag;
pub mod terminal;
pub mod unsaved;
pub mod window;
pub mod workspace;
pub mod worktree;

#[cfg(test)]
mod tests;

use std::path::{Component, Path, PathBuf};

use serde::de::DeserializeOwned;
use serde::Serialize;
use tauri::ipc::{InvokeBody, Request};

use crate::error::{AppError, AppResult};
use crate::git::{cli, repo as git_repo};

/// Runs blocking git work off the main thread so the UI never stalls.
pub async fn blocking<T, F>(work: F) -> AppResult<T>
where
    T: Send + 'static,
    F: FnOnce() -> AppResult<T> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(work)
        .await
        .map_err(|err| AppError::invalid(format!("Background task failed: {err}")))?
}

/// Result of an operation that may stop on conflicts (merge, rebase, pull...).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpOutcome {
    pub output: String,
    pub conflicts: bool,
}

pub fn has_conflicts(repo_path: &str) -> bool {
    git_repo::open(repo_path)
        .and_then(|repo| Ok(repo.index()?.has_conflicts()))
        .unwrap_or(false)
}

/// A failed command that left conflicts behind is a normal outcome, not an error.
pub fn outcome(repo_path: &str, result: AppResult<cli::GitOutput>) -> AppResult<OpOutcome> {
    match result {
        Ok(output) => Ok(OpOutcome {
            output: output.text(),
            conflicts: has_conflicts(repo_path),
        }),
        Err(AppError::Command { message }) if has_conflicts(repo_path) => Ok(OpOutcome {
            output: message,
            conflicts: true,
        }),
        Err(err) => Err(err),
    }
}

pub fn run_op(repo_path: &str, args: &[&str]) -> AppResult<OpOutcome> {
    outcome(repo_path, cli::run(Path::new(repo_path), args))
}

/// Joins a repo-relative path from the UI, refusing anything that escapes the work tree.
pub fn safe_join(repo_path: &str, file_path: &str) -> AppResult<PathBuf> {
    let relative = Path::new(file_path);
    let escapes = relative.is_absolute()
        || relative
            .components()
            // RootDir too: on Windows `\etc` is not absolute, yet joining it lands at the drive root.
            .any(|component| matches!(component, Component::ParentDir | Component::Prefix(_) | Component::RootDir));
    if escapes || file_path.is_empty() {
        return Err(AppError::invalid(format!("Invalid path: {file_path}")));
    }
    Ok(Path::new(repo_path).join(relative))
}

/// Refuses a user-given name or revision that git would read as an option.
pub fn reject_option(value: &str, what: &str) -> AppResult<()> {
    if value.starts_with('-') {
        return Err(AppError::invalid(format!("{what} cannot start with '-': {value}")));
    }
    Ok(())
}

/// Builds `git <args...> -- <paths...>`.
pub fn with_paths<'a>(args: &[&'a str], paths: &'a [String]) -> Vec<&'a str> {
    let mut all: Vec<&str> = args.to_vec();
    all.push("--");
    all.extend(paths.iter().map(String::as_str));
    all
}

/// The body of a command invoked with raw bytes, copied out so blocking work can own it.
pub fn raw_body(request: &Request<'_>) -> AppResult<Vec<u8>> {
    match request.body() {
        InvokeBody::Raw(bytes) => Ok(bytes.clone()),
        InvokeBody::Json(_) => Err(AppError::invalid("This command takes raw bytes")),
    }
}

/// Splits a raw body into its arguments (one line of JSON) and the bytes after it, usually an
/// editor's text: large texts cross the bridge without JSON escaping that way.
pub fn raw_parts<T: DeserializeOwned>(body: &[u8]) -> AppResult<(T, &[u8])> {
    let split = memchr::memchr(b'\n', body).ok_or_else(|| AppError::invalid("The request has no arguments line"))?;
    let args = serde_json::from_slice(&body[..split]).map_err(|err| AppError::invalid(format!("Bad arguments: {err}")))?;
    Ok((args, &body[split + 1..]))
}
