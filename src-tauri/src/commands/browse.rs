//! One folder's entries anywhere on the machine running the app, for the browser app's folder and file picker
//! (src/lib/browser/PathPicker.svelte): a browser tab cannot show the system's open and save dialogs.

use std::path::Path;

use serde::Serialize;

use super::blocking;
use crate::config;
use crate::error::{AppError, AppResult};
use crate::paths;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowseListing {
    pub folder_path: String,
    /// None at a root (`/`, `C:/`).
    pub parent_path: Option<String>,
    pub home_path: String,
    /// Folders first, then files, each by name ignoring case.
    pub entries: Vec<BrowseEntry>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowseEntry {
    pub name: String,
    pub is_dir: bool,
    /// A dot name, which the picker hides until asked.
    pub hidden: bool,
}

/// `folder_path` None (or empty) is the home folder.
#[crate::command]
pub async fn browse_folder(folder_path: Option<String>) -> AppResult<BrowseListing> {
    blocking(move || {
        let home = config::home_dir()?;
        let wanted = folder_path.filter(|folder| !folder.trim().is_empty());
        match wanted {
            Some(folder) => list_folder(Path::new(&folder), &home),
            None => list_folder(&home, &home),
        }
    })
    .await
}

pub fn list_folder(folder: &Path, home: &Path) -> AppResult<BrowseListing> {
    let folder = paths::real(folder).map_err(|err| AppError::invalid(format!("Could not open the folder: {err}")))?;
    if !folder.is_dir() {
        return Err(AppError::invalid("Not a folder"));
    }
    let mut entries: Vec<BrowseEntry> = std::fs::read_dir(&folder)?
        .filter_map(Result::ok)
        .map(|entry| {
            let name = entry.file_name().to_string_lossy().into_owned();
            // A link to a folder opens like one.
            let is_dir = entry.path().is_dir();
            BrowseEntry { hidden: name.starts_with('.'), name, is_dir }
        })
        .collect();
    entries.sort_by(|left, right| {
        right.is_dir.cmp(&left.is_dir).then_with(|| left.name.to_lowercase().cmp(&right.name.to_lowercase()))
    });
    Ok(BrowseListing {
        folder_path: paths::to_ui(&folder),
        parent_path: folder.parent().map(paths::to_ui),
        home_path: paths::to_ui(home),
        entries,
    })
}

#[cfg(test)]
mod tests {
    use super::list_folder;
    use crate::test_support::TestDir;

    #[test]
    fn lists_folders_first_by_name_and_marks_dot_names() {
        let dir = TestDir::new();
        dir.write("b.txt", "b");
        dir.write("A.md", "a");
        dir.write("zeta/x", "x");
        dir.write("Alpha/x", "x");
        dir.write(".git/config", "");
        let listing = list_folder(&dir.path, &dir.path).unwrap();
        let names: Vec<(&str, bool, bool)> =
            listing.entries.iter().map(|entry| (entry.name.as_str(), entry.is_dir, entry.hidden)).collect();
        assert_eq!(
            names,
            vec![
                (".git", true, true),
                ("Alpha", true, false),
                ("zeta", true, false),
                ("A.md", false, false),
                ("b.txt", false, false),
            ]
        );
        assert!(listing.parent_path.is_some());
        assert_eq!(listing.home_path, listing.folder_path);
    }

    #[test]
    fn a_file_or_a_missing_folder_is_an_error() {
        let dir = TestDir::new();
        dir.write("file.txt", "x");
        assert!(list_folder(&dir.path.join("file.txt"), &dir.path).is_err());
        assert!(list_folder(&dir.path.join("missing"), &dir.path).is_err());
    }
}
