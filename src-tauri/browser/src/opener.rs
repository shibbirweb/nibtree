//! The opener plugin's calls from the page (Reveal in Finder, open a file with its app), done on the machine
//! running the server, as tauri-plugin-opener does them for the desktop app. Opening a web link stays in the
//! browser (src/lib/browser/transport.ts).

use std::path::Path;
use std::process::Command;

use nibtree_lib::browser::AppError;
use serde_json::{Map, Value};

/// The answer to an opener call; None for every other command.
pub fn handle(command_name: &str, args: &Map<String, Value>) -> Option<Result<Value, AppError>> {
    let result = match command_name {
        "plugin:opener|open_path" => match args.get("path").and_then(Value::as_str) {
            Some(path) => open::that_detached(path).map_err(|err| failed(path, err)),
            None => Err(AppError::invalid("Argument path is missing")),
        },
        "plugin:opener|reveal_item_in_dir" => {
            let paths: Vec<&str> = args
                .get("paths")
                .and_then(Value::as_array)
                .map(|paths| paths.iter().filter_map(Value::as_str).collect())
                .unwrap_or_default();
            paths.iter().try_for_each(|path| reveal(path).map_err(|err| failed(path, err)))
        }
        _ => return None,
    };
    Some(result.map(|()| Value::Null))
}

fn failed(path: &str, err: std::io::Error) -> AppError {
    AppError::invalid(format!("Could not open {path}: {err}"))
}

/// Shows the item selected in its folder, in the system's file manager.
fn reveal(path: &str) -> std::io::Result<()> {
    if cfg!(target_os = "macos") {
        Command::new("open").arg("-R").arg(path).spawn().map(drop)
    } else if cfg!(windows) {
        Command::new("explorer").arg(format!("/select,{}", path.replace('/', "\\"))).spawn().map(drop)
    } else {
        // Linux file managers have no common way to select an item: open its folder.
        let folder = Path::new(path).parent().unwrap_or(Path::new(path));
        open::that_detached(folder)
    }
}

#[cfg(test)]
mod tests {
    use serde_json::{json, Map, Value};

    use super::handle;

    fn args(value: Value) -> Map<String, Value> {
        value.as_object().cloned().unwrap_or_default()
    }

    #[test]
    fn only_opener_calls_are_answered_here() {
        assert!(handle("get_status", &args(json!({}))).is_none());
        assert!(handle("plugin:opener|open_url", &args(json!({ "url": "https://example.com" }))).is_none());
    }

    #[test]
    fn missing_arguments_are_errors_not_panics() {
        assert!(handle("plugin:opener|open_path", &args(json!({}))).unwrap().is_err());
        assert!(handle("plugin:opener|reveal_item_in_dir", &args(json!({}))).unwrap().is_ok());
    }
}
