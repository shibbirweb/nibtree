//! `nibtree-browser [folder]`: serves the app's page and runs its commands for browser tabs on this
//! machine (or, with `--host`, on the network). Every request needs the token from the printed URL.

mod access;
mod assets;
mod opener;
mod options;
mod socket;

use std::net::SocketAddr;
use std::sync::Arc;

use axum::routing::get;
use axum::Router;
use nibtree_lib::browser::{self, Runtime};

use options::Options;
use socket::Tabs;

/// What every request handler shares.
pub struct Server {
    pub runtime: Runtime,
    pub tabs: Arc<Tabs>,
    pub token: String,
    pub options: Options,
    pub port: u16,
}

fn main() {
    if let Some(code) = browser::prepare() {
        std::process::exit(code);
    }
    let options = match Options::parse(std::env::args().skip(1)) {
        Ok(options) => options,
        Err(message) => {
            eprintln!("{message}\n\n{}", options::USAGE);
            std::process::exit(2);
        }
    };
    if options.help {
        println!("{}", options::USAGE);
        return;
    }
    if options.version {
        println!("nibtree {}", browser::app_version());
        return;
    }
    let runtime = tokio::runtime::Runtime::new().expect("a tokio runtime");
    std::process::exit(runtime.block_on(serve(options)));
}

async fn serve(options: Options) -> i32 {
    let listener = match options::bind(&options).await {
        Ok(listener) => listener,
        Err(message) => {
            eprintln!("{message}");
            return 1;
        }
    };
    let port = listener.local_addr().map(|address| address.port()).unwrap_or_default();
    let token = match options.token.clone().map(Ok).unwrap_or_else(browser::new_token) {
        Ok(token) => token,
        Err(err) => {
            eprintln!("{err}");
            return 1;
        }
    };
    let tabs = Arc::new(Tabs::default());
    let runtime = Runtime::start(options.folders.first().cloned(), tabs.clone().events());
    let url = format!("http://{}:{port}{}?token={token}", options.url_host(), options.base_path);
    let server = Arc::new(Server { runtime, tabs, token, options, port });

    println!("Nibtree is running at {url}");
    if !server.options.is_loopback() {
        println!("Anyone who can reach this address with the token can read and change files and run commands.");
    }
    if server.options.open_browser {
        let _ = open::that_detached(&url);
    }

    let routes = Router::new()
        .route("/__nibtree/socket", get(socket::upgrade))
        .fallback(get(assets::serve))
        .layer(axum::middleware::from_fn_with_state(server.clone(), access::check))
        .with_state(server.clone());
    let app = if server.options.base_path == "/" {
        routes
    } else {
        Router::new().nest(server.options.base_path.trim_end_matches('/'), routes)
    };
    let served = axum::serve(listener, app.into_make_service_with_connect_info::<SocketAddr>()).await;
    match served {
        Ok(()) => 0,
        Err(err) => {
            eprintln!("The server stopped: {err}");
            1
        }
    }
}
