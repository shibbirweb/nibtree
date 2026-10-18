//! User configuration in `~/.nibtree/`:
//! `settings.json` holds preferences, `state.json` holds UI state such as
//! recent folders and panel sizes. The folder is created on first save.
//!
//! Several windows write these files. Each one sends only what it changed (`ConfigPatch`),
//! and the backend applies it to the file as it is on disk now, under one lock, so a window
//! never writes back another window's older values. A file that does not parse is never
//! written by a patch: the user may be fixing it by hand.

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

use crate::error::{AppError, AppResult};


/// Config files the frontend may read and write, by logical name.
const FILES: [(&str, &str); 2] = [("settings", "settings.json"), ("state", "state.json")];

pub fn home_dir() -> AppResult<PathBuf> {
    nibtree_cli::home::home_dir().map_err(AppError::invalid)
}

pub fn config_dir_in(home: &Path) -> PathBuf {
    nibtree_cli::home::config_dir_in(home)
}

fn file_name(config_name: &str) -> AppResult<&'static str> {
    FILES
        .iter()
        .find(|(name, _)| *name == config_name)
        .map(|(_, file)| *file)
        .ok_or_else(|| AppError::invalid(format!("Unknown config file: {config_name}")))
}

/// Reads a config file. Missing files return None; unreadable JSON is an error
/// so a hand-edited typo is reported instead of silently reset.
pub fn load_in(dir: &Path, config_name: &str) -> AppResult<Option<Value>> {
    let path = dir.join(file_name(config_name)?);
    let text = match std::fs::read_to_string(&path) {
        Ok(text) => text,
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(err) => return Err(err.into()),
    };
    if text.trim().is_empty() {
        return Ok(None);
    }
    serde_json::from_str(&text)
        .map(Some)
        .map_err(|err| AppError::invalid(format!("{} is not valid JSON: {err}", path.display())))
}

/// Writes a config file atomically (temp file + rename), creating the folder.
pub fn save_in(dir: &Path, config_name: &str, value: &Value) -> AppResult<()> {
    let _guard = write_lock();
    save_unlocked(dir, config_name, value)
}

/// One writer at a time, in this process: patches read the file, change it and write it back.
fn write_lock() -> std::sync::MutexGuard<'static, ()> {
    static LOCK: Mutex<()> = Mutex::new(());
    LOCK.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

/// One value set at a path of keys (`["openTabs", "<workspace id>"]`); null is a value too.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PatchSet {
    pub path: Vec<String>,
    pub value: Value,
}

/// What one window changed in a config file since it last wrote or heard of it.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct ConfigPatch {
    #[serde(default)]
    pub set: Vec<PatchSet>,
    /// Paths of keys that went away.
    #[serde(default)]
    pub remove: Vec<Vec<String>>,
}

impl ConfigPatch {
    pub fn is_empty(&self) -> bool {
        self.set.is_empty() && self.remove.is_empty()
    }
}

/// Applies `patch` to `target`: removals first, then sets. A set creates the objects along
/// its path (replacing a non-object in the way); an empty path replaces the whole value.
pub fn apply_patch(target: &mut Value, patch: &ConfigPatch) {
    for path in &patch.remove {
        remove_at(target, path);
    }
    for set in &patch.set {
        let Some((last, parents)) = set.path.split_last() else {
            *target = set.value.clone();
            continue;
        };
        let mut current = &mut *target;
        for key in parents {
            current = object_of(current).entry(key.clone()).or_insert_with(|| Value::Object(Map::new()));
        }
        object_of(current).insert(last.clone(), set.value.clone());
    }
}

fn remove_at(value: &mut Value, path: &[String]) {
    match path {
        [] => {}
        [last] => {
            if let Value::Object(object) = value {
                object.remove(last);
            }
        }
        [first, rest @ ..] => {
            if let Some(next) = value.get_mut(first.as_str()) {
                remove_at(next, rest);
            }
        }
    }
}

fn object_of(value: &mut Value) -> &mut Map<String, Value> {
    if !value.is_object() {
        *value = Value::Object(Map::new());
    }
    match value {
        Value::Object(object) => object,
        _ => unreachable!("just made an object"),
    }
}

/// Applies a window's changes to the file as it is now. A file that does not parse is an
/// error and stays untouched. Returns false when there was nothing to write.
pub fn update_in(dir: &Path, config_name: &str, patch: &ConfigPatch) -> AppResult<bool> {
    file_name(config_name)?;
    if patch.is_empty() {
        return Ok(false);
    }
    let _guard = write_lock();
    let mut value = load_in(dir, config_name)?.unwrap_or_else(|| Value::Object(Map::new()));
    if !value.is_object() {
        return Err(AppError::invalid(format!("{} does not hold a JSON object", file_name(config_name)?)));
    }
    apply_patch(&mut value, patch);
    save_unlocked(dir, config_name, &value)?;
    Ok(true)
}

fn save_unlocked(dir: &Path, config_name: &str, value: &Value) -> AppResult<()> {
    let file = file_name(config_name)?;
    std::fs::create_dir_all(dir)?;
    let path = dir.join(file);
    let temp = dir.join(format!(".{file}.tmp"));
    let mut text = serde_json::to_string_pretty(value).map_err(|err| AppError::invalid(err.to_string()))?;
    text.push('\n');
    std::fs::write(&temp, text)?;
    std::fs::rename(&temp, &path)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn missing_files_load_as_none_and_the_folder_is_created_on_save() {
        let home = tempfile::TempDir::new().unwrap();
        let dir = config_dir_in(home.path());
        assert_eq!(load_in(&dir, "settings").unwrap(), None);
        assert!(!dir.exists());

        save_in(&dir, "settings", &json!({ "theme": "dark", "tabSize": 2 })).unwrap();
        assert!(dir.join("settings.json").is_file());
        assert_eq!(load_in(&dir, "settings").unwrap(), Some(json!({ "theme": "dark", "tabSize": 2 })));
        assert!(!dir.join(".settings.json.tmp").exists());
    }

    #[test]
    fn files_are_pretty_printed_and_kept_separate() {
        let home = tempfile::TempDir::new().unwrap();
        let dir = config_dir_in(home.path());
        save_in(&dir, "state", &json!({ "recentFolders": ["/a"] })).unwrap();
        let text = std::fs::read_to_string(dir.join("state.json")).unwrap();
        assert!(text.contains("\n  \"recentFolders\""));
        assert_eq!(load_in(&dir, "settings").unwrap(), None);
    }

    #[test]
    fn unknown_names_and_bad_json_are_errors() {
        let home = tempfile::TempDir::new().unwrap();
        let dir = config_dir_in(home.path());
        assert!(load_in(&dir, "../secrets").is_err());
        assert!(save_in(&dir, "other", &json!({})).is_err());

        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("settings.json"), "{ not json").unwrap();
        assert!(matches!(load_in(&dir, "settings"), Err(AppError::Invalid(_))));
        std::fs::write(dir.join("settings.json"), "  \n").unwrap();
        assert_eq!(load_in(&dir, "settings").unwrap(), None);
    }

    fn set(path: &[&str], value: Value) -> PatchSet {
        PatchSet {
            path: path.iter().map(|key| key.to_string()).collect(),
            value,
        }
    }

    fn path(keys: &[&str]) -> Vec<String> {
        keys.iter().map(|key| key.to_string()).collect()
    }

    #[test]
    fn patches_set_nested_values_null_included_and_remove_keys() {
        let mut value = json!({ "theme": "dark", "openTabs": { "a": { "tabs": [1] }, "b": { "tabs": [2] } }, "x": 3 });
        apply_patch(
            &mut value,
            &ConfigPatch {
                set: vec![
                    set(&["openTabs", "c"], json!({ "tabs": [] })),
                    set(&["keybindings", "file.save"], Value::Null),
                    set(&["x", "deep"], json!(1)),
                ],
                remove: vec![path(&["openTabs", "a"]), path(&["missing", "key"]), path(&["theme"]), vec![]],
            },
        );
        assert_eq!(
            value,
            json!({
                "openTabs": { "b": { "tabs": [2] }, "c": { "tabs": [] } },
                "keybindings": { "file.save": null },
                "x": { "deep": 1 },
            })
        );
        let mut whole = json!({ "a": 1 });
        apply_patch(&mut whole, &ConfigPatch { set: vec![set(&[], json!({ "b": 2 }))], remove: vec![] });
        assert_eq!(whole, json!({ "b": 2 }));
    }

    #[test]
    fn two_windows_writing_different_keys_keep_both() {
        let home = tempfile::TempDir::new().unwrap();
        let dir = config_dir_in(home.path());
        save_in(&dir, "state", &json!({ "openTabs": { "one": 1 }, "sidebarWidth": 200 })).unwrap();
        // Each window only knew the file as it was at start.
        let first = ConfigPatch { set: vec![set(&["openTabs", "one"], json!(10))], remove: vec![] };
        let second = ConfigPatch { set: vec![set(&["openTabs", "two"], json!(2))], remove: vec![] };
        assert!(update_in(&dir, "state", &first).unwrap());
        assert!(update_in(&dir, "state", &second).unwrap());
        assert_eq!(
            load_in(&dir, "state").unwrap(),
            Some(json!({ "openTabs": { "one": 10, "two": 2 }, "sidebarWidth": 200 }))
        );
        assert!(!update_in(&dir, "state", &ConfigPatch::default()).unwrap(), "nothing to write");
        // A missing file starts empty.
        assert!(update_in(&dir, "settings", &ConfigPatch { set: vec![set(&["theme"], json!("light"))], remove: vec![] }).unwrap());
        assert_eq!(load_in(&dir, "settings").unwrap(), Some(json!({ "theme": "light" })));
    }

    #[test]
    fn a_patch_never_overwrites_a_file_that_does_not_parse() {
        let home = tempfile::TempDir::new().unwrap();
        let dir = config_dir_in(home.path());
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("settings.json"), "{ \"theme\": ").unwrap();
        let patch = ConfigPatch { set: vec![set(&["theme"], json!("dark"))], remove: vec![] };
        assert!(update_in(&dir, "settings", &patch).is_err());
        assert_eq!(std::fs::read_to_string(dir.join("settings.json")).unwrap(), "{ \"theme\": ");
        std::fs::write(dir.join("settings.json"), "[1, 2]").unwrap();
        assert!(update_in(&dir, "settings", &patch).is_err(), "not an object");
        assert!(update_in(&dir, "../secrets", &patch).is_err());
    }
}
