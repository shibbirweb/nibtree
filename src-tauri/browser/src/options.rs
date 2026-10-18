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
  --public-url <url>   the address to print when a proxy or Docker maps another one (http://host:port)
  --assets <folder>    serve the page from this folder (default: the page next to this program)
  --version            show the version
  --help               show this help

Environment: NIBTREE_HOST, NIBTREE_PORT, NIBTREE_TOKEN and NIBTREE_PUBLIC_URL set the same defaults as their
options, and NIBTREE_NO_OPEN=1 is --no-open (the Docker image sets them).";

pub const DEFAULT_PORT: u16 = 4300;
/// The Docker image's port: `--port` may take it (the image does), moving on from a busy port never does.
pub const DOCKER_PORT: u16 = 4410;
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
    pub public_url: Option<String>,
    pub help: bool,
    pub version: bool,
}

impl Options {
    pub fn parse(args: impl Iterator<Item = String>) -> Result<Options, String> {
        Options::parse_with(args, |name| std::env::var(name).ok())
    }

    /// `env` looks up the NIBTREE_* defaults; options on the command line win over them.
    pub fn parse_with(
        args: impl Iterator<Item = String>,
        env: impl Fn(&str) -> Option<String>,
    ) -> Result<Options, String> {
        let env = |name: &str| env(name).filter(|value| !value.is_empty());
        let mut options = Options {
            folders: Vec::new(),
            host: env("NIBTREE_HOST").unwrap_or_else(|| "127.0.0.1".to_string()),
            port: env("NIBTREE_PORT").map(|text| port(&text)).transpose()?.unwrap_or(DEFAULT_PORT),
            strict_port: false,
            open_browser: env("NIBTREE_NO_OPEN").is_none_or(|value| value == "0"),
            token: env("NIBTREE_TOKEN"),
            base_path: "/".to_string(),
            assets: None,
            public_url: env("NIBTREE_PUBLIC_URL").map(|text| public_url(&text)).transpose()?,
            help: false,
            version: false,
        };
        let mut args = args.peekable();
        while let Some(arg) = args.next() {
            let mut value = |name: &str| args.next().ok_or_else(|| format!("{name} needs a value"));
            match arg.as_str() {
                "--host" => options.host = value("--host")?,
                "--port" => options.port = port(&value("--port")?)?,
                "--strict-port" => options.strict_port = true,
                "--no-open" => options.open_browser = false,
                "--token" => options.token = Some(value("--token")?),
                "--base-path" => options.base_path = base_path(&value("--base-path")?),
                "--assets" => options.assets = Some(PathBuf::from(value("--assets")?)),
                "--public-url" => options.public_url = Some(public_url(&value("--public-url")?)?),
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

/// The ports tried after a busy one, without the desktop app's and the Docker image's.
fn fallback_ports(busy_port: u16) -> impl Iterator<Item = u16> {
    (1..=PORTS_TRIED)
        .filter_map(move |step| busy_port.checked_add(step))
        .filter(|port| desktop_port_owner(*port).is_none() && *port != DOCKER_PORT)
}

fn port(text: &str) -> Result<u16, String> {
    let port: u16 = text.parse().map_err(|_| format!("Not a port number: {text}"))?;
    if let Some(owner) = desktop_port_owner(port) {
        return Err(format!("Port {port} belongs to {owner}: pick another one"));
    }
    Ok(port)
}

/// `http://localhost:9000/` -> `http://localhost:9000`: the base path and token are added after it.
fn public_url(text: &str) -> Result<String, String> {
    if !(text.starts_with("http://") || text.starts_with("https://")) {
        return Err(format!("The public URL must start with http:// or https://: {text}"));
    }
    Ok(text.trim_end_matches('/').to_string())
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
    use super::{base_path, desktop_port_owner, fallback_ports, Options, DEFAULT_PORT, DESKTOP_PORTS, DOCKER_PORT};

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
        assert!(fallback_ports(4400).all(|port| port != DOCKER_PORT));
        assert_eq!(parse(&["--port", "4410"]).port, DOCKER_PORT);
    }

    #[test]
    fn reads_defaults_from_the_environment_and_lets_options_win() {
        let docker = |name: &str| match name {
            "NIBTREE_HOST" => Some("0.0.0.0".to_string()),
            "NIBTREE_PORT" => Some("4410".to_string()),
            "NIBTREE_NO_OPEN" => Some("1".to_string()),
            "NIBTREE_PUBLIC_URL" => Some("http://localhost:9000/".to_string()),
            "NIBTREE_TOKEN" => Some(String::new()),
            _ => None,
        };
        let options = Options::parse_with(std::iter::empty(), docker).unwrap();
        assert_eq!((options.host.as_str(), options.port, options.open_browser), ("0.0.0.0", 4410, false));
        assert_eq!(options.public_url.as_deref(), Some("http://localhost:9000"));
        assert_eq!(options.token, None);
        let args = ["--port", "4999", "--public-url", "https://git.example.com"].map(String::from);
        let options = Options::parse_with(args.into_iter(), docker).unwrap();
        assert_eq!((options.port, options.public_url.as_deref()), (4999, Some("https://git.example.com")));
        let bad_port = |name: &str| (name == "NIBTREE_PORT").then(|| "1420".to_string());
        assert!(Options::parse_with(std::iter::empty(), bad_port).is_err());
        assert!(Options::parse(["--public-url", "localhost:9000"].map(String::from).into_iter()).is_err());
    }

    #[test]
    fn base_paths_get_both_slashes() {
        assert_eq!(base_path("/"), "/");
        assert_eq!(base_path("nibtree"), "/nibtree/");
        assert_eq!(base_path("/a/b/"), "/a/b/");
    }
}
