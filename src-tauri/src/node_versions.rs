//! Node versions installed by version managers (nvm, Herd, fnm, Volta, asdf, mise, nodenv,
//! n, Homebrew), so the Scripts panel can run a package with the version it needs. Only
//! folders are read; no `node` is started. An app opened from Finder does not get the
//! shell's variables (NVM_DIR...), so each manager's default folder is checked as well.

use crate::paths::RealPath;
use std::collections::HashSet;
use std::path::{Path, PathBuf};

use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NodeInstall {
    /// Without the "v": "20.11.1".
    pub version: String,
    /// Folder with `node`, `npm` and `npx`: put first on PATH to use this version.
    pub bin_dir: String,
    /// Which tool installed it: "nvm", "Herd", "fnm", "Volta", "asdf", "mise", "nodenv", "n" or "Homebrew".
    pub manager: String,
}

/// Where version folders live: `<root>/<versions>/<version folder>/<bin>`.
struct Layout {
    manager: &'static str,
    root: PathBuf,
    versions: &'static str,
    bin: &'static str,
}

/// Where to look; the variables are read through `env` so tests can give their own.
pub struct Locations<'a> {
    pub home: PathBuf,
    pub env: &'a dyn Fn(&str) -> Option<PathBuf>,
    pub brew_prefixes: Vec<PathBuf>,
    /// Where n installs when `N_PREFIX` is unset: `/usr/local` on a real machine. n has no Windows version.
    #[cfg_attr(windows, allow(dead_code))]
    pub n_prefix: PathBuf,
}

/// The Node program in a version's bin folder.
const NODE_PROGRAM: &str = if cfg!(windows) { "node.exe" } else { "node" };

impl Locations<'_> {
    /// nvm-windows, fnm, Volta and Scoop keep node.exe right in the version folder.
    #[cfg(windows)]
    fn layouts(&self) -> Vec<Layout> {
        let env_or = |name: &str, fallback: Option<PathBuf>| (self.env)(name).or(fallback);
        let app_data = (self.env)("APPDATA");
        let local_app_data = (self.env)("LOCALAPPDATA");
        let candidates = [
            ("nvm", env_or("NVM_HOME", app_data.as_ref().map(|folder| folder.join("nvm"))), "", ""),
            ("fnm", env_or("FNM_DIR", app_data.as_ref().map(|folder| folder.join("fnm"))), "node-versions", "installation"),
            ("Volta", env_or("VOLTA_HOME", local_app_data.as_ref().map(|folder| folder.join("Volta"))), "tools/image/node", ""),
            ("Scoop", Some(self.home.join("scoop")), "apps/nodejs", ""),
        ];
        candidates
            .into_iter()
            .filter_map(|(manager, root, versions, bin)| root.map(|root| Layout { manager, root, versions, bin }))
            .collect()
    }

    #[cfg(unix)]
    fn layouts(&self) -> Vec<Layout> {
        let home = &self.home;
        let mut layouts = Vec::new();
        let mut add = |manager: &'static str, root: Option<PathBuf>, versions: &'static str, bin: &'static str| {
            if let Some(root) = root {
                layouts.push(Layout { manager, root, versions, bin });
            }
        };
        let support = home.join("Library").join("Application Support");
        let herd_nvm = support.join("Herd").join("config").join("nvm");
        let env_nvm = (self.env)("NVM_DIR");
        let env_is_herd = env_nvm.as_deref() == Some(herd_nvm.as_path());
        if !env_is_herd {
            add("nvm", env_nvm, "versions/node", "bin");
        }
        add("nvm", Some(home.join(".nvm")), "versions/node", "bin");
        add("Herd", Some(herd_nvm), "versions/node", "bin");
        add("fnm", (self.env)("FNM_DIR"), "node-versions", "installation/bin");
        add("fnm", Some(home.join(".local/share/fnm")), "node-versions", "installation/bin");
        add("fnm", Some(support.join("fnm")), "node-versions", "installation/bin");
        add("fnm", Some(home.join(".fnm")), "node-versions", "installation/bin");
        add("Volta", Some((self.env)("VOLTA_HOME").unwrap_or_else(|| home.join(".volta"))), "tools/image/node", "bin");
        add("asdf", Some((self.env)("ASDF_DATA_DIR").unwrap_or_else(|| home.join(".asdf"))), "installs/nodejs", "bin");
        add("mise", Some((self.env)("MISE_DATA_DIR").unwrap_or_else(|| home.join(".local/share/mise"))), "installs/node", "bin");
        add("nodenv", Some((self.env)("NODENV_ROOT").unwrap_or_else(|| home.join(".nodenv"))), "versions", "bin");
        add("n", Some((self.env)("N_PREFIX").unwrap_or_else(|| self.n_prefix.clone())), "n/versions/node", "bin");
        layouts
    }
}

/// "v20.11.1" or "20.11.1" as "20.11.1"; anything else (aliases like "lts", "18") is not a version folder.
fn version_of(folder_name: &str) -> Option<String> {
    let version = folder_name.strip_prefix('v').unwrap_or(folder_name);
    let parts: Vec<&str> = version.split('.').collect();
    let numeric = parts.len() == 3 && parts.iter().all(|part| !part.is_empty() && part.bytes().all(|byte| byte.is_ascii_digit()));
    numeric.then(|| version.to_string())
}

fn numbers(version: &str) -> Vec<u64> {
    version.split('.').map(|part| part.parse().unwrap_or_default()).collect()
}

fn push_install(found: &mut Vec<NodeInstall>, seen: &mut HashSet<PathBuf>, version: String, bin_dir: &Path, manager: &str) {
    if !bin_dir.join(NODE_PROGRAM).is_file() {
        return;
    }
    let canonical = bin_dir.real_path().unwrap_or_else(|_| bin_dir.to_path_buf());
    if seen.insert(canonical) {
        found.push(NodeInstall {
            version,
            bin_dir: bin_dir.to_string_lossy().into_owned(),
            manager: manager.to_string(),
        });
    }
}

/// Every installed version, newest first.
pub fn installed(locations: &Locations) -> Vec<NodeInstall> {
    let mut found = Vec::new();
    let mut seen = HashSet::new();
    for layout in locations.layouts() {
        let Ok(entries) = std::fs::read_dir(layout.root.join(layout.versions)) else {
            continue;
        };
        for entry in entries.flatten() {
            // mise and asdf keep aliases ("20" -> "20.11.1") as links; the real folder is listed itself.
            if entry.file_type().map(|kind| kind.is_symlink()).unwrap_or(true) {
                continue;
            }
            let name = entry.file_name();
            if let Some(version) = version_of(&name.to_string_lossy()) {
                push_install(&mut found, &mut seen, version, &entry.path().join(layout.bin), layout.manager);
            }
        }
    }
    for prefix in &locations.brew_prefixes {
        brew_installs(prefix, &mut found, &mut seen);
    }
    found.sort_by(|a, b| numbers(&b.version).cmp(&numbers(&a.version)).then_with(|| a.manager.cmp(&b.manager)));
    found
}

/// Homebrew's `opt/node` and `opt/node@20` link to `Cellar/node@20/20.11.1`. The opt path is
/// kept: it still works after `brew upgrade`.
fn brew_installs(prefix: &Path, found: &mut Vec<NodeInstall>, seen: &mut HashSet<PathBuf>) {
    let Ok(entries) = std::fs::read_dir(prefix.join("opt")) else {
        return;
    };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        if name != "node" && !name.starts_with("node@") {
            continue;
        }
        let target = entry.path().real_path().ok();
        let version = target
            .as_deref()
            .and_then(Path::file_name)
            .and_then(|folder| version_of(&folder.to_string_lossy().replace('_', ".")));
        if let Some(version) = version {
            push_install(found, seen, version, &entry.path().join("bin"), "Homebrew");
        }
    }
}

/// The real machine's locations.
pub fn installed_here() -> Vec<NodeInstall> {
    let env = |name: &str| std::env::var_os(name).filter(|value| !value.is_empty()).map(PathBuf::from);
    let Some(home) = env(if cfg!(windows) { "USERPROFILE" } else { "HOME" }) else {
        return Vec::new();
    };
    let brew_prefixes = if cfg!(windows) {
        Vec::new()
    } else {
        vec![
            PathBuf::from("/opt/homebrew"),
            PathBuf::from("/usr/local"),
            PathBuf::from("/home/linuxbrew/.linuxbrew"),
        ]
    };
    let locations = Locations {
        home,
        env: &env,
        brew_prefixes,
        n_prefix: PathBuf::from("/usr/local"),
    };
    installed(&locations)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(unix)]
    fn node_at(bin_dir: &Path) {
        std::fs::create_dir_all(bin_dir).unwrap();
        std::fs::write(bin_dir.join("node"), "").unwrap();
    }

    #[test]
    fn reads_version_folders() {
        assert_eq!(version_of("v20.11.1").as_deref(), Some("20.11.1"));
        assert_eq!(version_of("18.20.4").as_deref(), Some("18.20.4"));
        assert_eq!(version_of("lts"), None);
        assert_eq!(version_of("20"), None);
        assert_eq!(version_of("v20.1.x"), None);
    }

    #[cfg(unix)]
    #[test]
    fn lists_every_manager_newest_first() {
        let temp = tempfile::tempdir().unwrap();
        let home = temp.path().join("home");
        node_at(&home.join(".nvm/versions/node/v18.20.4/bin"));
        node_at(&home.join(".nvm/versions/node/v20.11.1/bin"));
        // A version folder without node (a failed install) is left out.
        std::fs::create_dir_all(home.join(".nvm/versions/node/v21.0.0/bin")).unwrap();
        node_at(&home.join("Library/Application Support/Herd/config/nvm/versions/node/v16.20.2/bin"));
        node_at(&home.join(".local/share/fnm/node-versions/v22.1.0/installation/bin"));
        node_at(&home.join(".volta/tools/image/node/20.9.0/bin"));
        node_at(&home.join(".local/share/mise/installs/node/22.3.0/bin"));
        std::os::unix::fs::symlink(home.join(".local/share/mise/installs/node/22.3.0"), home.join(".local/share/mise/installs/node/22")).unwrap();
        let custom_asdf = temp.path().join("asdf");
        node_at(&custom_asdf.join("installs/nodejs/19.9.0/bin"));
        let brew = temp.path().join("brew");
        node_at(&brew.join("Cellar/node@18/18.19.1/bin"));
        std::fs::create_dir_all(brew.join("opt")).unwrap();
        std::os::unix::fs::symlink(brew.join("Cellar/node@18/18.19.1"), brew.join("opt/node@18")).unwrap();
        let n_prefix = temp.path().join("usr-local");
        node_at(&n_prefix.join("n/versions/node/17.9.1/bin"));

        let env = |name: &str| (name == "ASDF_DATA_DIR").then(|| custom_asdf.clone());
        let locations = Locations { home: home.clone(), env: &env, brew_prefixes: vec![brew.clone()], n_prefix };
        let listed: Vec<(String, String)> = installed(&locations)
            .into_iter()
            .map(|install| (install.version, install.manager))
            .collect();
        let expected: Vec<(String, String)> = [
            ("22.3.0", "mise"),
            ("22.1.0", "fnm"),
            ("20.11.1", "nvm"),
            ("20.9.0", "Volta"),
            ("19.9.0", "asdf"),
            ("18.20.4", "nvm"),
            ("18.19.1", "Homebrew"),
            ("17.9.1", "n"),
            ("16.20.2", "Herd"),
        ]
        .iter()
        .map(|(version, manager)| (version.to_string(), manager.to_string()))
        .collect();
        assert_eq!(listed, expected);
        let homebrew = installed(&locations).into_iter().find(|install| install.manager == "Homebrew").unwrap();
        assert_eq!(homebrew.bin_dir, brew.join("opt/node@18/bin").to_string_lossy());
    }

    #[cfg(unix)]
    #[test]
    fn nvm_dir_pointing_at_herd_is_listed_once_as_herd() {
        let temp = tempfile::tempdir().unwrap();
        let home = temp.path().to_path_buf();
        let herd = home.join("Library/Application Support/Herd/config/nvm");
        node_at(&herd.join("versions/node/v20.18.0/bin"));
        let env = |name: &str| (name == "NVM_DIR").then(|| herd.clone());
        let n_prefix = home.join("usr-local");
        let locations = Locations { home, env: &env, brew_prefixes: Vec::new(), n_prefix };
        let listed = installed(&locations);
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].manager, "Herd");
    }
}
