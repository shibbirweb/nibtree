//! Puts the command line tool on the PATH, never with sudo and never in /usr/local.
//! macOS and Linux: a `nibtree` link in `~/.local/bin` to the running binary (on Linux, to the AppImage
//! when the app runs from one).
//! Windows: a `nibtree.cmd` in `%LOCALAPPDATA%\Microsoft\WindowsApps`, which Windows puts on
//! every user's PATH, running the console program `nibtree-cli.exe` next to the app (the
//! app itself is a GUI program there, without a console).

use crate::paths::RealPath;
use std::path::{Path, PathBuf};

use crate::error::{AppError, AppResult};

#[cfg(not(windows))]
pub const LINK_NAME: &str = "nibtree";
#[cfg(windows)]
pub const LINK_NAME: &str = "nibtree.cmd";
/// The console program the Windows installer puts next to the app (src-tauri/cli).
pub const CONSOLE_NAME: &str = "nibtree-cli.exe";
/// The line that marks a `nibtree.cmd` as ours.
const SHIM_MARK: &str = "rem Nibtree command line tool";

/// Windows: the default `%LOCALAPPDATA%` below the home folder, so tests can use a temporary home.
pub fn bin_dir_in(home: &Path) -> PathBuf {
    if cfg!(windows) {
        home.join("AppData").join("Local").join("Microsoft").join("WindowsApps")
    } else {
        home.join(".local").join("bin")
    }
}

pub fn link_in(home: &Path) -> PathBuf {
    bin_dir_in(home).join(LINK_NAME)
}

/// A link we made: it points at this binary, or at a binary of the same name (an older copy of the app).
#[cfg(not(windows))]
fn is_ours(link: &Path, exe: &Path) -> bool {
    let Ok(target) = std::fs::read_link(link) else {
        return false;
    };
    target == exe || (target.file_name().is_some() && target.file_name() == exe.file_name())
}

#[cfg(windows)]
fn is_ours(link: &Path, _exe: &Path) -> bool {
    is_our_shim(link)
}

pub fn installed_link(home: &Path, exe: &Path) -> Option<PathBuf> {
    let link = link_in(home);
    is_ours(&link, exe).then_some(link)
}

/// The tool's folder is one of the folders in `path_var`.
pub fn on_path(home: &Path, path_var: &str) -> bool {
    let bin_dir = bin_dir_in(home);
    let canonical = bin_dir.real_path().ok();
    std::env::split_paths(path_var).any(|entry| entry == bin_dir || (canonical.is_some() && entry.real_path().ok() == canonical))
}

/// The `.cmd` file: runs the console program with every argument, `cli ...` or a folder to open.
fn shim_text(console: &Path) -> String {
    format!("@echo off\r\n{SHIM_MARK}\r\n\"{}\" %*\r\n", console.display())
}

fn is_our_shim(shim: &Path) -> bool {
    std::fs::read_to_string(shim).is_ok_and(|text| text.lines().any(|line| line.trim() == SHIM_MARK))
}

/// Windows' install: `exe` is the app; the console program must sit next to it.
#[cfg_attr(not(windows), allow(dead_code))]
fn install_shim(shim: &Path, exe: &Path) -> AppResult<PathBuf> {
    let console = exe.with_file_name(CONSOLE_NAME);
    if !console.is_file() {
        return Err(AppError::invalid(format!(
            "{} is missing next to Nibtree. It comes with the installer: reinstall Nibtree.",
            console.display()
        )));
    }
    if shim.exists() && !is_our_shim(shim) {
        return Err(AppError::invalid(format!("{} already exists and is not Nibtree's. Remove it first.", shim.display())));
    }
    if let Some(folder) = shim.parent() {
        std::fs::create_dir_all(folder)?;
    }
    std::fs::write(shim, shim_text(&console))?;
    Ok(shim.to_path_buf())
}

#[cfg_attr(not(windows), allow(dead_code))]
fn uninstall_shim(shim: &Path) -> AppResult<()> {
    if !shim.exists() {
        return Ok(());
    }
    if !is_our_shim(shim) {
        return Err(AppError::invalid(format!("{} is not Nibtree's, so it was left alone.", shim.display())));
    }
    std::fs::remove_file(shim)?;
    Ok(())
}

#[cfg(windows)]
pub fn install_in(home: &Path, exe: &Path) -> AppResult<PathBuf> {
    install_shim(&link_in(home), exe)
}

#[cfg(windows)]
pub fn uninstall_in(home: &Path, _exe: &Path) -> AppResult<()> {
    uninstall_shim(&link_in(home))
}

#[cfg(unix)]
pub fn install_in(home: &Path, exe: &Path) -> AppResult<PathBuf> {
    let link = link_in(home);
    if link.symlink_metadata().is_ok() {
        if !is_ours(&link, exe) {
            return Err(AppError::invalid(format!(
                "{} already exists and is not Nibtree's link. Remove it first.",
                link.display()
            )));
        }
        std::fs::remove_file(&link)?;
    }
    std::fs::create_dir_all(bin_dir_in(home))?;
    std::os::unix::fs::symlink(exe, &link)?;
    Ok(link)
}

#[cfg(unix)]
pub fn uninstall_in(home: &Path, exe: &Path) -> AppResult<()> {
    let link = link_in(home);
    if link.symlink_metadata().is_err() {
        return Ok(());
    }
    if !is_ours(&link, exe) {
        return Err(AppError::invalid(format!("{} is not Nibtree's link, so it was left alone.", link.display())));
    }
    std::fs::remove_file(&link)?;
    Ok(())
}


/// The program that runs the command line tool: this binary, or on Windows the console program
/// next to it, since the app itself has no console there.
pub fn cli_program(exe: &Path) -> PathBuf {
    if cfg!(windows) {
        exe.with_file_name(CONSOLE_NAME)
    } else {
        exe.to_path_buf()
    }
}

pub fn current_exe() -> PathBuf {
    if let Some(app_image) = app_image_in(std::env::var_os("APPIMAGE")) {
        return app_image;
    }
    std::env::current_exe()
        .and_then(|exe| exe.real_path())
        .unwrap_or_else(|_| PathBuf::from(LINK_NAME))
}

/// Linux AppImage: the binary runs from a mount that is gone once the app quits, so a link has to point at
/// the AppImage file itself, which its runtime names in `APPIMAGE`.
fn app_image_in(app_image: Option<std::ffi::OsString>) -> Option<PathBuf> {
    if !cfg!(target_os = "linux") {
        return None;
    }
    app_image.filter(|path| !path.is_empty()).map(PathBuf::from)
}

#[cfg(test)]
mod shim_tests {
    use super::*;

    #[test]
    fn the_windows_shim_runs_the_console_program_and_is_removed_only_when_ours() {
        let dir = tempfile::TempDir::new().unwrap();
        let exe = dir.path().join("app/nibtree.exe");
        std::fs::create_dir_all(exe.parent().unwrap()).unwrap();
        std::fs::write(&exe, "app").unwrap();
        let shim = dir.path().join("WindowsApps/nibtree.cmd");

        assert!(install_shim(&shim, &exe).unwrap_err().to_string().contains(CONSOLE_NAME), "the console program is missing");
        std::fs::write(exe.with_file_name(CONSOLE_NAME), "console").unwrap();
        install_shim(&shim, &exe).unwrap();
        let text = std::fs::read_to_string(&shim).unwrap();
        assert!(text.contains(&format!("\"{}\" %*", exe.with_file_name(CONSOLE_NAME).display())), "{text}");
        assert!(is_our_shim(&shim));
        install_shim(&shim, &exe).unwrap();

        uninstall_shim(&shim).unwrap();
        assert!(!shim.exists());
        uninstall_shim(&shim).unwrap();

        std::fs::write(&shim, "@echo off\r\nsomeone else\r\n").unwrap();
        assert!(install_shim(&shim, &exe).is_err());
        assert!(uninstall_shim(&shim).is_err());
        assert!(shim.is_file(), "a file that is not ours is never removed");
    }
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;

    #[test]
    fn installs_and_removes_only_our_link() {
        let home = tempfile::TempDir::new().unwrap();
        let home = home.path();
        let exe = home.join("app/nibtree");
        std::fs::create_dir_all(exe.parent().unwrap()).unwrap();
        std::fs::write(&exe, "binary").unwrap();

        assert_eq!(installed_link(home, &exe), None);
        let link = install_in(home, &exe).unwrap();
        assert_eq!(std::fs::read_link(&link).unwrap(), exe);
        assert_eq!(installed_link(home, &exe), Some(link.clone()));
        install_in(home, &exe).unwrap();

        uninstall_in(home, &exe).unwrap();
        assert!(link.symlink_metadata().is_err());
        uninstall_in(home, &exe).unwrap();

        std::fs::write(&link, "someone else's script").unwrap();
        assert!(install_in(home, &exe).is_err());
        assert!(uninstall_in(home, &exe).is_err());
        assert!(link.is_file(), "a file that is not our link is never removed");
    }

    #[test]
    fn finds_the_folder_on_the_path() {
        let home = Path::new("/Users/someone");
        assert!(on_path(home, "/usr/bin:/Users/someone/.local/bin:/bin"));
        assert!(!on_path(home, "/usr/bin:/bin"));
        assert!(!on_path(home, ""));
    }

    #[test]
    fn links_to_the_app_image_only_on_linux() {
        let app_image = Some(std::ffi::OsString::from("/home/someone/Apps/Nibtree.AppImage"));
        if cfg!(target_os = "linux") {
            assert_eq!(app_image_in(app_image), Some(PathBuf::from("/home/someone/Apps/Nibtree.AppImage")));
        } else {
            assert_eq!(app_image_in(app_image), None);
        }
        assert_eq!(app_image_in(Some(std::ffi::OsString::new())), None);
        assert_eq!(app_image_in(None), None);
    }
}
