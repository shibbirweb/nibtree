//! Command line options.

use std::path::PathBuf;

use tokio::net::TcpListener;

pub const USAGE: &str = "Usage: nibtree [folder ...] [options]

Opens Nibtree in your browser. The folder defaults to the current one.

Options:
  --host <address>     where to listen (default 127.0.0.1; 0.0.0.0 for every network)
  --port <number>      port to listen on (default 4300; 0 lets the system pick); a busy port moves on
                       to the next free one
  --strict-port        stop instead of moving on when the port is busy
  --no-open            print the address without opening a browser
  --token <value>      a fixed access token (also NIBTREE_TOKEN); default: a new random one
  --base-path <path>   serve under a path, behind a reverse proxy (for example /nibtree/)
  --assets <folder>    serve the page from this folder (default: the page next to this program)
  --version            show the version
  --help               show this help";

pub const DEFAULT_PORT: u16 = 4300;
const PORTS_TRIED: u16 = 100;

/// The desktop (Tauri) app's ports: the browser server never takes them, so both run side by side.
const DESKTOP_PORTS: [(u16, &str); 5] = [
    (1420, "the desktop app's dev server"),
    (1421, "the desktop app's dev server (hot reload)"),
    (1430, "the UI library showcase"),
    (1433, "the Swift compare page"),
    (48731, "the desktop app's MCP server"),
];

pub struct Options {
    pub folders: Vec<String>,
    pub host: String,
    pub port: u16,
    pub strict_port: bool,
    pub open_browser: bool,
    pub token: Option<String>,
    pub base_path: String,
    pub assets: Option<PathBuf>,
    pub help: bool,
    pub version: bool,
}

impl Options {
    pub fn parse(args: impl Iterator<Item = String>) -> Result<Options, String> {
        let mut options = Options {
            folders: Vec::new(),
            host: "127.0.0.1".to_string(),
            port: DEFAULT_PORT,
            strict_port: false,
            open_browser: true,
            token: std::env::var("NIBTREE_TOKEN").ok().filter(|token| !token.is_empty()),
            base_path: "/".to_string(),
            assets: None,
            help: false,
            version: false,
        };
        let mut args = args.peekable();
        while let Some(arg) = args.next() {
            let mut value = |name: &str| args.next().ok_or_else(|| format!("{name} needs a value"));
            match arg.as_str() {
                "--host" => options.host = value("--host")?,
                "--port" => {
                    let text = value("--port")?;
                    options.port = text.parse().map_err(|_| format!("Not a port number: {text}"))?;
                    if let Some(owner) = desktop_port_owner(options.port) {
                        return Err(format!("Port {} belongs to {owner}: pick another one", options.port));
                    }
                }
                "--strict-port" => options.strict_port = true,
                "--no-open" => options.open_browser = false,
                "--token" => options.token = Some(value("--token")?),
                "--base-path" => options.base_path = base_path(&value("--base-path")?),
                "--assets" => options.assets = Some(PathBuf::from(value("--assets")?)),
                "--help" | "-h" => options.help = true,
                "--version" | "-V" => options.version = true,
                flag if flag.starts_with('-') => return Err(format!("Unknown option: {flag}")),
                folder => options.folders.push(absolute(folder)?),
            }
        }
        if options.folders.is_empty() {
            options.folders.push(absolute(".")?);
        }
        Ok(options)
    }

    pub fn is_loopback(&self) -> bool {
        matches!(self.host.as_str(), "127.0.0.1" | "localhost" | "::1")
    }

    /// The host in the printed URL: a wildcard address is reached through this machine's loopback.
    pub fn url_host(&self) -> &str {
        match self.host.as_str() {
            "0.0.0.0" | "::" => "127.0.0.1",
            host => host,
        }
    }
}

/// Binds the asked port; when it is busy (and not `--strict-port`), the next free one after it.
pub async fn bind(options: &Options) -> Result<TcpListener, String> {
    let host = options.host.as_str();
    let first = TcpListener::bind((host, options.port)).await;
    let busy = match first {
        Ok(listener) => return Ok(listener),
        Err(err) => err,
    };
    if options.strict_port || options.port == 0 {
        return Err(format!("Could not listen on {host}:{}: {busy}", options.port));
    }
    for port in fallback_ports(options.port) {
        if let Ok(listener) = TcpListener::bind((host, port)).await {
            println!("Port {} is busy, so Nibtree uses port {port}.", options.port);
            return Ok(listener);
        }
    }
    Err(format!("Port {} and the {PORTS_TRIED} after it are busy: pass a free one with --port", options.port))
}

/// The ports tried after a busy one, without the desktop app's.
fn fallback_ports(busy_port: u16) -> impl Iterator<Item = u16> {
    (1..=PORTS_TRIED)
        .filter_map(move |step| busy_port.checked_add(step))
        .filter(|port| desktop_port_owner(*port).is_none())
}

fn desktop_port_owner(port: u16) -> Option<&'static str> {
    DESKTOP_PORTS.iter().find(|(desktop_port, _)| *desktop_port == port).map(|(_, owner)| *owner)
}

/// `nibtree` -> `/nibtree/`: one leading and one trailing slash.
fn base_path(text: &str) -> String {
    let inner = text.trim_matches('/');
    if inner.is_empty() {
        "/".to_string()
    } else {
        format!("/{inner}/")
    }
}

fn absolute(folder: &str) -> Result<String, String> {
    let path = std::path::absolute(folder).map_err(|err| format!("Could not open {folder}: {err}"))?;
    if !path.is_dir() {
        return Err(format!("Not a folder: {folder}"));
    }
    Ok(nibtree_cli::home::to_ui(&path))
}

#[cfg(test)]
mod tests {
    use super::{base_path, desktop_port_owner, fallback_ports, Options, DEFAULT_PORT, DESKTOP_PORTS};

    fn parse(args: &[&str]) -> Options {
        Options::parse(args.iter().map(|arg| arg.to_string())).unwrap()
    }

    #[test]
    fn defaults_to_this_machine_and_the_current_folder() {
        let options = parse(&[]);
        assert_eq!(options.host, "127.0.0.1");
        assert_eq!(options.port, DEFAULT_PORT);
        assert!(!options.strict_port);
        assert!(options.is_loopback());
        assert!(options.open_browser);
        assert_eq!(options.folders.len(), 1);
    }

    #[test]
    fn reads_every_flag() {
        let options = parse(&["--host", "0.0.0.0", "--port", "4999", "--strict-port", "--no-open", "--base-path", "x"]);
        assert_eq!(options.port, 4999);
        assert!(options.strict_port);
        assert!(!options.is_loopback());
        assert_eq!(options.url_host(), "127.0.0.1");
        assert!(!options.open_browser);
        assert_eq!(options.base_path, "/x/");
        assert!(parse(&["--version"]).version && parse(&["-V"]).version && !options.version);
    }

    #[test]
    fn rejects_unknown_flags_and_missing_values() {
        assert!(Options::parse(["--nope".to_string()].into_iter()).is_err());
        assert!(Options::parse(["--port".to_string()].into_iter()).is_err());
        assert!(Options::parse(["--port".to_string(), "x".to_string()].into_iter()).is_err());
    }

    #[test]
    fn never_takes_the_desktop_apps_ports() {
        assert!(desktop_port_owner(DEFAULT_PORT).is_none());
        for (port, _) in DESKTOP_PORTS {
            let error = Options::parse(["--port".to_string(), port.to_string()].into_iter()).err().unwrap();
            assert!(error.contains("pick another"), "{error}");
        }
        let after_dev_server: Vec<u16> = fallback_ports(1419).take(3).collect();
        assert_eq!(after_dev_server, vec![1422, 1423, 1424]);
        assert!(fallback_ports(48730).all(|port| port != 48731));
        assert_eq!(fallback_ports(u16::MAX).count(), 0);
    }

    #[test]
    fn base_paths_get_both_slashes() {
        assert_eq!(base_path("/"), "/");
        assert_eq!(base_path("nibtree"), "/nibtree/");
        assert_eq!(base_path("/a/b/"), "/a/b/");
    }
}
