//! The app's page: the static build (`bun run build` writes `build/`). Unknown paths get
//! index.html, as SvelteKit's SPA fallback expects, and index.html tells the page it runs here.

use std::path::{Component, Path, PathBuf};
use std::sync::Arc;

use axum::extract::State;
use axum::http::{header, StatusCode, Uri};
use axum::response::{IntoResponse, Response};

use nibtree_lib::browser;

use crate::Server;


/// SvelteKit puts a content hash in every file name under _app/immutable.
const IMMUTABLE: &str = "public, max-age=31536000, immutable";

pub async fn serve(State(server): State<Arc<Server>>, uri: Uri) -> Response {
    let root = assets_root(server.options.assets.as_deref());
    let Some(relative) = safe_relative(uri.path()) else {
        return StatusCode::NOT_FOUND.into_response();
    };
    let file = root.join(&relative);
    if relative.as_os_str().is_empty() || !file.is_file() {
        return index(&root, &server.options.base_path).await;
    }
    match tokio::fs::read(&file).await {
        Ok(bytes) => {
            let cache = if relative.starts_with("_app/immutable") { IMMUTABLE } else { "no-cache" };
            ([(header::CONTENT_TYPE, content_type(&file)), (header::CACHE_CONTROL, cache)], bytes).into_response()
        }
        Err(_) => StatusCode::NOT_FOUND.into_response(),
    }
}

/// index.html with the flag `src/lib/browser/transport.ts` reads before the app starts.
async fn index(root: &Path, base_path: &str) -> Response {
    match tokio::fs::read_to_string(root.join("index.html")).await {
        Ok(html) => {
            let flag = serde_json::json!({ "basePath": base_path, "version": browser::app_version() });
            let script = format!("<script>window.__NIBTREE_BROWSER__ = {flag};</script>");
            let html = html.replacen("<head>", &format!("<head>{script}"), 1);
            ([(header::CONTENT_TYPE, "text/html; charset=utf-8"), (header::CACHE_CONTROL, "no-cache")], html)
                .into_response()
        }
        Err(_) => {
            let text = format!("The page is missing from {}: run `bun run build` first.", root.display());
            (StatusCode::INTERNAL_SERVER_ERROR, text).into_response()
        }
    }
}

/// Until the page is embedded in the binary (the npm stage): `--assets`, else this checkout's build.
fn assets_root(assets: Option<&Path>) -> PathBuf {
    match assets {
        Some(folder) => folder.to_path_buf(),
        None => Path::new(env!("CARGO_MANIFEST_DIR")).join("../../build"),
    }
}

/// The URL path as a path inside the build folder; None when it tries to leave it.
fn safe_relative(url_path: &str) -> Option<PathBuf> {
    let mut relative = PathBuf::new();
    for component in Path::new(url_path.trim_start_matches('/')).components() {
        match component {
            Component::Normal(part) => relative.push(part),
            Component::CurDir => {}
            _ => return None,
        }
    }
    Some(relative)
}

fn content_type(file: &Path) -> &'static str {
    match file.extension().and_then(|extension| extension.to_str()).unwrap_or_default() {
        "html" => "text/html; charset=utf-8",
        "js" | "mjs" => "text/javascript; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "json" | "map" => "application/json",
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "ico" => "image/x-icon",
        "woff2" => "font/woff2",
        "woff" => "font/woff",
        "ttf" => "font/ttf",
        "wasm" => "application/wasm",
        "txt" => "text/plain; charset=utf-8",
        _ => "application/octet-stream",
    }
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use super::safe_relative;

    #[test]
    fn paths_stay_inside_the_build_folder() {
        assert_eq!(safe_relative("/_app/x.js"), Some(PathBuf::from("_app/x.js")));
        assert_eq!(safe_relative("/"), Some(PathBuf::new()));
        assert_eq!(safe_relative("/../secret"), None);
        assert_eq!(safe_relative("/a/../../secret"), None);
    }
}
