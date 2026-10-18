//! Who may use the server. The printed URL carries the token once; it is swapped for an HttpOnly
//! cookie and a clean URL, and every later request (the page, its files, the socket) needs that
//! cookie. On this machine only, the Host header must name the loopback, so another site's page
//! cannot reach the server through DNS rebinding.

use std::sync::Arc;

use axum::extract::{OriginalUri, Request, State};
use axum::http::{header, HeaderMap, HeaderValue, StatusCode};
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};
use nibtree_lib::browser;

use crate::Server;

const LOOPBACK_HOSTS: [&str; 3] = ["localhost", "127.0.0.1", "[::1]"];

pub async fn check(State(server): State<Arc<Server>>, request: Request, next: Next) -> Response {
    let host = request.headers().get(header::HOST).and_then(|value| value.to_str().ok()).unwrap_or_default();
    if server.options.is_loopback() && !is_loopback_host(host, server.port) {
        return (StatusCode::FORBIDDEN, "This server only answers on this machine.").into_response();
    }
    let uri = request.extensions().get::<OriginalUri>().map(|original| original.0.clone());
    let uri = uri.unwrap_or_else(|| request.uri().clone());
    if let Some(given) = query_value(uri.query().unwrap_or_default(), "token") {
        if !browser::tokens_match(&server.token, &given) {
            return denied();
        }
        let clean = uri.path().to_string();
        let cookie = format!(
            "{}={}; HttpOnly; SameSite=Strict; Path={}",
            cookie_name(server.port),
            server.token,
            server.options.base_path
        );
        let mut response = (StatusCode::SEE_OTHER, [(header::LOCATION, clean)]).into_response();
        if let Ok(value) = HeaderValue::from_str(&cookie) {
            response.headers_mut().insert(header::SET_COOKIE, value);
        }
        return response;
    }
    match cookie_value(request.headers(), &cookie_name(server.port)) {
        Some(given) if browser::tokens_match(&server.token, &given) => next.run(request).await,
        _ => denied(),
    }
}

/// Several servers on one machine differ only by port, and cookies ignore the port.
fn cookie_name(port: u16) -> String {
    format!("nibtree_browser_{port}")
}

fn denied() -> Response {
    let text = "Open Nibtree with the address it printed in the terminal (it carries the access token).";
    (StatusCode::UNAUTHORIZED, text).into_response()
}

pub fn is_loopback_host(host: &str, port: u16) -> bool {
    LOOPBACK_HOSTS.iter().any(|name| host == format!("{name}:{port}"))
}

fn query_value(query: &str, name: &str) -> Option<String> {
    query.split('&').find_map(|pair| {
        let (key, value) = pair.split_once('=')?;
        (key == name).then(|| value.to_string())
    })
}

fn cookie_value(headers: &HeaderMap, name: &str) -> Option<String> {
    headers.get_all(header::COOKIE).iter().filter_map(|value| value.to_str().ok()).find_map(|cookies| {
        cookies.split(';').find_map(|cookie| {
            let (key, value) = cookie.trim().split_once('=')?;
            (key == name).then(|| value.to_string())
        })
    })
}

#[cfg(test)]
mod tests {
    use axum::http::{header, HeaderMap, HeaderValue};

    use super::{cookie_value, is_loopback_host, query_value};

    #[test]
    fn only_loopback_names_with_the_right_port_pass() {
        assert!(is_loopback_host("127.0.0.1:4300", 4300));
        assert!(is_loopback_host("localhost:4300", 4300));
        assert!(is_loopback_host("[::1]:4300", 4300));
        assert!(!is_loopback_host("127.0.0.1:4301", 4300));
        assert!(!is_loopback_host("evil.example:4300", 4300));
        assert!(!is_loopback_host("", 4300));
    }

    #[test]
    fn reads_the_token_from_the_query_and_the_cookie() {
        assert_eq!(query_value("a=1&token=abc", "token").as_deref(), Some("abc"));
        assert_eq!(query_value("tokens=abc", "token"), None);
        let mut headers = HeaderMap::new();
        headers.insert(header::COOKIE, HeaderValue::from_static("other=1; nibtree_browser_4300=xyz"));
        assert_eq!(cookie_value(&headers, "nibtree_browser_4300").as_deref(), Some("xyz"));
        assert_eq!(cookie_value(&headers, "nibtree_browser_4301"), None);
    }
}
