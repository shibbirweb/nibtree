//! Backend tools: each one calls the same Rust functions the app's own commands use.

mod files;
mod git_read;
mod git_write;
mod patch;
mod performance;
mod recorder;

#[cfg(not(test))]
pub use recorder::stop_sampler as recorder_stop;
mod scripts;
mod search;
mod workspace;

use std::future::Future;
use std::path::PathBuf;

use serde::Serialize;
use serde_json::{json, Map, Value};

use super::host::Host;
use super::paths;
use super::Shared;
use crate::error::AppResult;

pub const WORKSPACE: &str = "Workspace";
pub const GIT: &str = "Git";
pub const FILES: &str = "Files";
pub const SEARCH: &str = "Search";
pub const SCRIPTS: &str = "Scripts";
pub const PERFORMANCE: &str = "Performance";

pub enum ToolOutput {
    /// Pretty JSON in the text block, and the object itself as structured content.
    Json(Value),
    Text(String),
    Image { png_base64: String, caption: String },
}

/// Err is a tool failure: an `isError` result with this message.
pub type ToolResult = Result<ToolOutput, String>;

pub struct BackendTool {
    pub name: &'static str,
    pub title: &'static str,
    pub description: &'static str,
    pub category: &'static str,
    pub read_only: bool,
    pub destructive: bool,
    pub schema: fn() -> Value,
    pub run: fn(&ToolCtx, &Args) -> ToolResult,
}

const GROUPS: [&[BackendTool]; 8] = [
    workspace::TOOLS,
    git_read::TOOLS,
    git_write::TOOLS,
    files::TOOLS,
    search::TOOLS,
    scripts::TOOLS,
    performance::TOOLS,
    recorder::TOOLS,
];

/// Tools that reach outside the workspace folders: they start off like the destructive ones.
const OUTSIDE_WORKSPACE: [&str; 1] = ["clone_repository"];

/// A tool's state until the user switches it: on, unless it is destructive or reaches outside
/// the workspace.
pub fn starts_on(tool_name: &str, destructive: bool) -> bool {
    !destructive && !OUTSIDE_WORKSPACE.contains(&tool_name)
}

pub fn all() -> impl Iterator<Item = &'static BackendTool> {
    GROUPS.iter().flat_map(|group| group.iter())
}

pub fn find(tool_name: &str) -> Option<&'static BackendTool> {
    all().find(|tool| tool.name == tool_name)
}

/// What a running tool may use: the workspace folders, the host and the server's own state.
pub struct ToolCtx<'a> {
    pub shared: &'a Shared,
}

impl ToolCtx<'_> {
    pub fn folders(&self) -> Vec<PathBuf> {
        self.shared.folders()
    }

    pub fn folder_strings(&self) -> Vec<String> {
        self.folders()
            .iter()
            .map(crate::paths::to_ui)
            .collect()
    }

    pub fn host(&self) -> Option<std::sync::Arc<dyn Host>> {
        self.shared.host()
    }

    /// The canonical root of the repository named by `repoPath`.
    pub fn repo(&self, args: &Args) -> Result<String, String> {
        let repo_path = args.str("repoPath")?;
        let root = paths::checked_repo(&self.folders(), repo_path)?;
        Ok(crate::paths::to_ui(&root))
    }

    /// An absolute path argument inside the workspace.
    pub fn path(&self, args: &Args, key: &str) -> Result<PathBuf, String> {
        paths::checked_path(&self.folders(), args.str(key)?)
    }

    /// File arguments (absolute or repo-relative) as repo-relative paths.
    pub fn repo_files(&self, repo_root: &str, file_paths: &[String]) -> Result<Vec<String>, String> {
        let root = PathBuf::from(repo_root);
        file_paths
            .iter()
            .map(|file_path| paths::repo_relative(&root, file_path))
            .collect()
    }
}

/// Typed access to a call's arguments; a wrong type is a tool error that names the argument.
pub struct Args<'a>(pub &'a Map<String, Value>);

impl Args<'_> {
    fn present(&self, key: &str) -> Option<&Value> {
        self.0.get(key).filter(|value| !value.is_null())
    }

    pub fn str(&self, key: &str) -> Result<&str, String> {
        match self.opt_str(key)? {
            Some(text) if !text.trim().is_empty() => Ok(text),
            _ => Err(format!("Missing required argument: {key}")),
        }
    }

    pub fn opt_str(&self, key: &str) -> Result<Option<&str>, String> {
        match self.present(key) {
            None => Ok(None),
            Some(Value::String(text)) => Ok(Some(text.as_str())),
            Some(_) => Err(format!("{key} must be a string")),
        }
    }

    /// A string that may be empty (file content, a message).
    pub fn text(&self, key: &str) -> Result<&str, String> {
        self.opt_str(key)?.ok_or_else(|| format!("Missing required argument: {key}"))
    }

    pub fn bool(&self, key: &str, default: bool) -> Result<bool, String> {
        match self.present(key) {
            None => Ok(default),
            Some(Value::Bool(flag)) => Ok(*flag),
            Some(_) => Err(format!("{key} must be true or false")),
        }
    }

    pub fn opt_u64(&self, key: &str) -> Result<Option<u64>, String> {
        match self.present(key) {
            None => Ok(None),
            Some(value) => value
                .as_u64()
                .map(Some)
                .ok_or_else(|| format!("{key} must be a whole number of 0 or more")),
        }
    }

    pub fn u64(&self, key: &str, default: u64) -> Result<u64, String> {
        Ok(self.opt_u64(key)?.unwrap_or(default))
    }

    pub fn usize(&self, key: &str, default: usize, max: usize) -> Result<usize, String> {
        Ok((self.u64(key, default as u64)? as usize).min(max))
    }

    pub fn str_list(&self, key: &str) -> Result<Vec<String>, String> {
        let list = self.opt_str_list(key)?;
        if list.is_empty() {
            return Err(format!("{key} needs at least one entry"));
        }
        Ok(list)
    }

    pub fn opt_str_list(&self, key: &str) -> Result<Vec<String>, String> {
        match self.present(key) {
            None => Ok(Vec::new()),
            Some(Value::Array(items)) => items
                .iter()
                .map(|item| item.as_str().map(str::to_string).ok_or_else(|| format!("{key} must be a list of strings")))
                .collect(),
            Some(Value::String(single)) => Ok(vec![single.clone()]),
            Some(_) => Err(format!("{key} must be a list of strings")),
        }
    }
}

/// Runs one of the app's async commands to completion on this (non-async) server thread.
pub fn wait<T>(future: impl Future<Output = AppResult<T>>) -> Result<T, String> {
    crate::commands::block_on(future).map_err(|err| err.to_string())
}

pub fn json_out(value: impl Serialize) -> ToolResult {
    serde_json::to_value(value)
        .map(ToolOutput::Json)
        .map_err(|err| format!("Could not encode the result: {err}"))
}

pub fn done(message: impl Into<String>) -> ToolResult {
    Ok(ToolOutput::Text(message.into()))
}

/// The JSON Schema of a tool's arguments.
pub fn object(properties: Value, required: &[&str]) -> Value {
    json!({
        "type": "object",
        "properties": properties,
        "required": required,
        "additionalProperties": false,
    })
}

pub fn repo_prop() -> Value {
    json!({
        "type": "string",
        "description": "Absolute path of the repository (its root or any folder inside it). Must be in an open workspace folder.",
    })
}

pub fn files_prop(what: &str) -> Value {
    json!({
        "type": "array",
        "items": { "type": "string" },
        "description": format!("{what} Absolute paths, or paths relative to repoPath."),
    })
}

pub fn no_args() -> Value {
    object(json!({}), &[])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_tool_is_well_formed_and_unique() {
        let mut names: Vec<&str> = Vec::new();
        let categories = [WORKSPACE, GIT, FILES, SEARCH, SCRIPTS, PERFORMANCE];
        for tool in all() {
            assert!(!names.contains(&tool.name), "duplicate tool {}", tool.name);
            names.push(tool.name);
            let snake = tool.name.bytes().all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'_');
            assert!(snake, "{} is not snake_case", tool.name);
            assert!(categories.contains(&tool.category), "{}", tool.name);
            assert!(!tool.description.is_empty() && !tool.title.is_empty(), "{}", tool.name);
            assert!(!(tool.read_only && tool.destructive), "{} cannot be both", tool.name);
            assert!(!tool.description.contains('\u{2014}'), "{} has an em-dash", tool.name);
            let schema = (tool.schema)();
            assert_eq!(schema["type"], "object", "{}", tool.name);
            let properties = schema["properties"].as_object().expect("properties");
            for required in schema["required"].as_array().expect("required") {
                let required = required.as_str().expect("required name");
                assert!(properties.contains_key(required), "{} requires unknown {required}", tool.name);
            }
            for (key, property) in properties {
                assert!(property["description"].is_string(), "{}.{key} needs a description", tool.name);
            }
        }
        assert!(names.len() >= 50, "{}", names.len());
    }
}
