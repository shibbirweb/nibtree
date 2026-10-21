//! The MCP server over real HTTP on ephemeral ports, against real temporary repositories.

use crate::test_support::UiText;
use crate::paths::RealPath;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::TcpStream;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde_json::{json, Value};
use tempfile::TempDir;

use super::bridge::{NOT_READY, NO_ANSWER};
use super::dto::{McpClient, McpUiResult, McpUiToolDef};
use super::http::{CLI_OFF, MCP_OFF};
use super::paths::OUTSIDE;
use super::protocol::{self, TURNED_OFF};
use super::{cli, token, Host, Mcp};
use crate::test_support::{git_in, image_bytes, TestRepo};

mod git_tools;

#[derive(Default)]
struct TestHost {
    ready: bool,
    events: Mutex<Vec<(String, Value)>>,
    /// Answers every UI request with this result, from another thread like the frontend.
    answer: Mutex<Option<(Mcp, McpUiResult)>>,
}

impl Host for TestHost {
    fn emit(&self, event: &str, payload: Value) {
        self.events.lock().unwrap().push((event.to_string(), payload.clone()));
        if event != "mcp-ui-request" {
            return;
        }
        if let Some((mcp, result)) = self.answer.lock().unwrap().clone() {
            let request_id = payload["requestId"].as_u64().unwrap();
            std::thread::spawn(move || {
                assert!(mcp.ui_respond(request_id, result));
            });
        }
    }

    fn window_ready(&self) -> bool {
        self.ready
    }

    fn screenshot_png(&self) -> Result<Vec<u8>, String> {
        Ok(image_bytes(&[0, 0, 0, 2, 9, 9]))
    }
}

impl TestHost {
    fn events_named(&self, event: &str) -> Vec<Value> {
        self.events
            .lock()
            .unwrap()
            .iter()
            .filter(|(name, _)| name == event)
            .map(|(_, payload)| payload.clone())
            .collect()
    }
}

struct Fixture {
    _home: TempDir,
    config_dir: PathBuf,
    mcp: Mcp,
    host: Arc<TestHost>,
    port: u16,
    token: String,
}

impl Fixture {
    fn new(mcp_on: bool, cli_on: bool) -> Fixture {
        Fixture::with_states(mcp_on, cli_on, HashMap::new())
    }

    fn with_states(mcp_on: bool, cli_on: bool, tool_states: HashMap<String, bool>) -> Fixture {
        let home = TempDir::new().unwrap();
        let config_dir = home.path().real_path().unwrap().join(".nibtree");
        let mcp = Mcp::for_test(config_dir.clone(), Duration::from_millis(300));
        let host = Arc::new(TestHost {
            ready: true,
            ..TestHost::default()
        });
        mcp.attach_host(host.clone());
        let status = mcp.configure(mcp_on, cli_on, 0, tool_states);
        assert!(status.running, "{status:?}");
        assert_eq!(status.error, None);
        Fixture {
            _home: home,
            config_dir,
            port: status.port,
            token: status.token.clone().expect("token"),
            mcp,
            host,
        }
    }

    fn auth(&self) -> String {
        format!("Bearer {}", self.token)
    }

    /// A JSON-RPC request as an MCP client (no client header).
    fn rpc(&self, method: &str, params: Value) -> Value {
        let body = json!({ "jsonrpc": "2.0", "id": 7, "method": method, "params": params }).to_string();
        let (status, reply) = send(self.port, "POST", "/mcp", &[("Authorization", &self.auth())], &body);
        assert_eq!(status, 200, "{reply}");
        serde_json::from_str(&reply).unwrap()
    }

    fn call(&self, tool_name: &str, arguments: Value) -> Value {
        let reply = self.rpc("tools/call", json!({ "name": tool_name, "arguments": arguments }));
        reply["result"].clone()
    }
}

impl Drop for Fixture {
    fn drop(&mut self) {
        self.mcp.configure(false, false, 0, HashMap::new());
    }
}

fn text_of(result: &Value) -> String {
    result["content"][0]["text"].as_str().unwrap_or_default().to_string()
}

/// One raw HTTP/1.1 request on its own connection; returns the status and the body.
fn send(port: u16, method: &str, path: &str, headers: &[(&str, &str)], body: &str) -> (u16, String) {
    send_raw(port, method, path, headers, body, Some(body.len()))
}

fn send_raw(
    port: u16,
    method: &str,
    path: &str,
    headers: &[(&str, &str)],
    body: &str,
    content_length: Option<usize>,
) -> (u16, String) {
    let mut stream = TcpStream::connect(("127.0.0.1", port)).unwrap();
    stream.set_read_timeout(Some(Duration::from_secs(20))).unwrap();
    let mut request = format!("{method} {path} HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n");
    if let Some(length) = content_length {
        request.push_str(&format!("Content-Length: {length}\r\n"));
    }
    for (name, value) in headers {
        request.push_str(&format!("{name}: {value}\r\n"));
    }
    request.push_str("\r\n");
    request.push_str(body);
    let _ = stream.write_all(request.as_bytes());
    let mut response = String::new();
    let _ = stream.read_to_string(&mut response);
    let status = response
        .split_whitespace()
        .nth(1)
        .and_then(|code| code.parse().ok())
        .unwrap_or(0);
    let body = response.split_once("\r\n\r\n").map(|(_, body)| body.to_string()).unwrap_or_default();
    (status, body)
}

fn strings(values: &[&str]) -> Vec<String> {
    values.iter().map(|value| value.to_string()).collect()
}

// ---------------------------------------------------------------------------
// Protocol

fn offline_mcp() -> (TempDir, Mcp) {
    let home = TempDir::new().unwrap();
    let mcp = Mcp::for_test(home.path().join(".nibtree"), Duration::from_millis(200));
    (home, mcp)
}

fn handle(mcp: &Mcp, body: &str) -> (u16, Option<Value>) {
    protocol::handle_body(mcp.shared(), McpClient::Mcp, body.as_bytes())
}

#[test]
fn initialize_negotiates_the_protocol_version() {
    let (_home, mcp) = offline_mcp();
    let request = |version: &str| {
        let body = json!({ "jsonrpc": "2.0", "id": 1, "method": "initialize", "params": { "protocolVersion": version } });
        handle(&mcp, &body.to_string()).1.unwrap()
    };
    let known = request("2025-03-26");
    assert_eq!(known["result"]["protocolVersion"], "2025-03-26");
    assert_eq!(known["result"]["serverInfo"]["name"], "nibtree");
    assert_eq!(known["result"]["serverInfo"]["version"], env!("CARGO_PKG_VERSION"));
    assert_eq!(known["result"]["capabilities"]["tools"]["listChanged"], false);
    assert!(known["result"]["instructions"].as_str().unwrap().contains("list_workspace"));
    assert_eq!(request("1999-01-01")["result"]["protocolVersion"], "2025-06-18");

    let (status, reply) = handle(&mcp, r#"{"jsonrpc":"2.0","method":"notifications/initialized"}"#);
    assert_eq!((status, reply), (202, None));
    let pong = handle(&mcp, r#"{"jsonrpc":"2.0","id":"a","method":"ping"}"#).1.unwrap();
    assert_eq!(pong, json!({ "jsonrpc": "2.0", "id": "a", "result": {} }));
}

#[test]
fn errors_follow_json_rpc() {
    let (_home, mcp) = offline_mcp();
    let (status, reply) = handle(&mcp, "{ not json");
    assert_eq!(status, 400);
    assert_eq!(reply.unwrap()["error"]["code"], -32700);

    let unknown = handle(&mcp, r#"{"jsonrpc":"2.0","id":2,"method":"resources/list"}"#).1.unwrap();
    assert_eq!(unknown["error"]["code"], -32601);
    assert_eq!(unknown["id"], 2);

    let invalid = handle(&mcp, r#"{"id":3,"method":"ping"}"#).1.unwrap();
    assert_eq!(invalid["error"]["code"], -32600);
    assert_eq!(handle(&mcp, "[]").1.unwrap()["error"]["code"], -32600);

    let no_name = handle(&mcp, r#"{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{}}"#).1.unwrap();
    assert_eq!(no_name["error"]["code"], -32602);
    let unknown_tool = handle(&mcp, r#"{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"nope"}}"#).1.unwrap();
    assert_eq!(unknown_tool["error"]["code"], -32602);
    assert_eq!(unknown_tool["error"]["message"], "Unknown tool: nope");
}

#[test]
fn batches_answer_requests_and_skip_notifications() {
    let (_home, mcp) = offline_mcp();
    let batch = r#"[
        {"jsonrpc":"2.0","id":1,"method":"ping"},
        {"jsonrpc":"2.0","method":"notifications/initialized"},
        {"jsonrpc":"2.0","id":2,"method":"nope"}
    ]"#;
    let (status, reply) = handle(&mcp, batch);
    assert_eq!(status, 200);
    let replies = reply.unwrap();
    let replies = replies.as_array().unwrap();
    assert_eq!(replies.len(), 2);
    assert_eq!(replies[0]["result"], json!({}));
    assert_eq!(replies[1]["error"]["code"], -32601);

    let only_notifications = r#"[{"jsonrpc":"2.0","method":"notifications/initialized"}]"#;
    assert_eq!(handle(&mcp, only_notifications), (202, None));
}

fn listed_names(reply: &Value) -> Vec<String> {
    reply["result"]["tools"]
        .as_array()
        .unwrap()
        .iter()
        .map(|tool| tool["name"].as_str().unwrap().to_string())
        .collect()
}

#[test]
fn tools_list_hides_turned_off_tools_and_calls_to_them_fail() {
    let (_home, mcp) = offline_mcp();
    let list = r#"{"jsonrpc":"2.0","id":1,"method":"tools/list"}"#;
    let names = listed_names(&handle(&mcp, list).1.unwrap());
    assert!(names.contains(&"git_status".to_string()));
    assert!(!names.contains(&"git_push".to_string()), "destructive tools start off");

    let states = HashMap::from([("git_push".to_string(), true), ("git_status".to_string(), false)]);
    mcp.configure(false, false, 0, states);
    let reply = handle(&mcp, list).1.unwrap();
    let names = listed_names(&reply);
    assert!(names.contains(&"git_push".to_string()));
    assert!(!names.contains(&"git_status".to_string()));
    let push = reply["result"]["tools"]
        .as_array()
        .unwrap()
        .iter()
        .find(|tool| tool["name"] == "git_push")
        .unwrap()
        .clone();
    assert_eq!(push["annotations"]["destructiveHint"], true);
    assert_eq!(push["annotations"]["readOnlyHint"], false);
    assert_eq!(push["inputSchema"]["required"], json!(["repoPath"]));

    let everything = r#"{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{"_meta":{"nibtree/includeDisabled":true}}}"#;
    assert!(listed_names(&handle(&mcp, everything).1.unwrap()).contains(&"git_status".to_string()));

    let call = r#"{"jsonrpc":"2.0","id":9,"method":"tools/call","params":{"name":"git_status","arguments":{"repoPath":"/x"}}}"#;
    let result = handle(&mcp, call).1.unwrap()["result"].clone();
    assert_eq!(result["isError"], true);
    assert_eq!(text_of(&result), TURNED_OFF);
    let activity = mcp.activity();
    assert_eq!(activity.len(), 1);
    assert_eq!(activity[0].tool, "git_status");
    assert!(!activity[0].ok);
    assert_eq!(activity[0].error.as_deref(), Some(TURNED_OFF));

    let tools = mcp.tools();
    let status_info = tools.iter().find(|tool| tool.name == "git_status").unwrap();
    assert!(!status_info.enabled && status_info.read_only);
}

// ---------------------------------------------------------------------------
// HTTP, auth and the switches

#[test]
fn every_request_needs_the_token_and_no_origin() {
    let fixture = Fixture::new(true, false);
    let ping = r#"{"jsonrpc":"2.0","id":1,"method":"ping"}"#;
    assert_eq!(send(fixture.port, "POST", "/mcp", &[], ping).0, 401);
    assert_eq!(send(fixture.port, "POST", "/mcp", &[("Authorization", "Bearer nope")], ping).0, 401);
    let auth = fixture.auth();
    let with_origin = [("Authorization", auth.as_str()), ("Origin", "https://evil.example")];
    assert_eq!(send(fixture.port, "POST", "/mcp", &with_origin, ping).0, 403);

    let ok = [("Authorization", auth.as_str())];
    let (status, body) = send(fixture.port, "POST", "/mcp", &ok, ping);
    assert_eq!(status, 200);
    assert_eq!(serde_json::from_str::<Value>(&body).unwrap()["result"], json!({}));
    assert_eq!(send(fixture.port, "GET", "/mcp", &ok, "").0, 405);
    assert_eq!(send(fixture.port, "OPTIONS", "/mcp", &ok, "").0, 405);
    assert_eq!(send(fixture.port, "POST", "/other", &ok, ping).0, 404);
    let notification = r#"{"jsonrpc":"2.0","method":"notifications/initialized"}"#;
    assert_eq!(send(fixture.port, "POST", "/mcp", &ok, notification), (202, String::new()));
    assert_eq!(send_raw(fixture.port, "POST", "/mcp", &ok, "", None).0, 411);
    // The size is refused from the header, before any body is read.
    assert_eq!(send_raw(fixture.port, "POST", "/mcp", &ok, "", Some(2 * 1024 * 1024)).0, 413);
}

#[test]
fn keep_alive_connections_serve_several_requests() {
    let fixture = Fixture::new(true, false);
    let mut stream = TcpStream::connect(("127.0.0.1", fixture.port)).unwrap();
    stream.set_read_timeout(Some(Duration::from_secs(10))).unwrap();
    for id in 1..=3 {
        let body = format!(r#"{{"jsonrpc":"2.0","id":{id},"method":"ping"}}"#);
        let request = format!(
            "POST /mcp HTTP/1.1\r\nHost: x\r\nAuthorization: {}\r\nContent-Length: {}\r\n\r\n{body}",
            fixture.auth(),
            body.len()
        );
        stream.write_all(request.as_bytes()).unwrap();
        let mut head = Vec::new();
        let mut byte = [0u8; 1];
        while !head.ends_with(b"\r\n\r\n") {
            stream.read_exact(&mut byte).unwrap();
            head.push(byte[0]);
        }
        let head = String::from_utf8(head).unwrap();
        assert!(head.starts_with("HTTP/1.1 200 OK"), "{head}");
        assert!(head.contains("Connection: keep-alive"), "{head}");
        let length: usize = head
            .lines()
            .find_map(|line| line.strip_prefix("Content-Length: "))
            .unwrap()
            .parse()
            .unwrap();
        let mut body = vec![0u8; length];
        stream.read_exact(&mut body).unwrap();
        let reply: Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(reply["id"], id);
    }
    assert_eq!(fixture.mcp.open_connections(), 1);
}

#[test]
fn the_cli_header_needs_the_cli_switch_and_mcp_clients_need_the_mcp_switch() {
    let ping = r#"{"jsonrpc":"2.0","id":1,"method":"ping"}"#;
    let mcp_only = Fixture::new(true, false);
    let auth = mcp_only.auth();
    let cli_headers = [("Authorization", auth.as_str()), ("X-Nibtree-Client", "cli")];
    let (status, body) = send(mcp_only.port, "POST", "/mcp", &cli_headers, ping);
    assert_eq!(status, 403);
    assert_eq!(serde_json::from_str::<Value>(&body).unwrap()["error"], CLI_OFF);

    let cli_only = Fixture::new(false, true);
    let auth = cli_only.auth();
    let (status, body) = send(cli_only.port, "POST", "/mcp", &[("Authorization", auth.as_str())], ping);
    assert_eq!(status, 403);
    assert_eq!(serde_json::from_str::<Value>(&body).unwrap()["error"], MCP_OFF);
    let cli_headers = [("Authorization", auth.as_str()), ("X-Nibtree-Client", "cli")];
    assert_eq!(send(cli_only.port, "POST", "/mcp", &cli_headers, ping).0, 200);
}

#[test]
fn start_stop_and_the_mcp_file() {
    let fixture = Fixture::new(true, false);
    let file = token::read_in(&fixture.config_dir).unwrap();
    assert_eq!(file.token, fixture.token);
    assert_eq!(file.port, Some(fixture.port));
    assert_eq!(file.pid, Some(std::process::id()));

    // Changing the switches on the same port keeps the server.
    let status = fixture.mcp.configure(true, true, 0, HashMap::new());
    assert!(status.running && status.cli_enabled);
    assert_eq!(status.port, fixture.port);

    let regenerated = fixture.mcp.regenerate_token().unwrap();
    let new_token = regenerated.token.clone().unwrap();
    assert_ne!(new_token, fixture.token);
    assert_eq!(token::read_in(&fixture.config_dir).unwrap().token, new_token);
    let ping = r#"{"jsonrpc":"2.0","id":1,"method":"ping"}"#;
    assert_eq!(send(fixture.port, "POST", "/mcp", &[("Authorization", &fixture.auth())], ping).0, 401);
    let new_auth = format!("Bearer {new_token}");
    assert_eq!(send(fixture.port, "POST", "/mcp", &[("Authorization", new_auth.as_str())], ping).0, 200);

    let stopped = fixture.mcp.configure(false, false, 0, HashMap::new());
    assert!(!stopped.running);
    assert_eq!(stopped.token, None);
    assert!(TcpStream::connect(("127.0.0.1", fixture.port)).is_err(), "nothing listens once off");
    let file = token::read_in(&fixture.config_dir).unwrap();
    assert_eq!(file.token, new_token, "the token survives a stop");
    assert_eq!((file.port, file.pid), (None, None));
    assert!(fixture.mcp.activity().is_empty());

    let again = fixture.mcp.configure(true, false, 0, HashMap::new());
    assert!(again.running);
    assert_eq!(again.token.as_deref(), Some(new_token.as_str()), "the saved token is reused");
}

#[test]
fn a_busy_port_is_reported_and_a_low_port_refused() {
    let busy = std::net::TcpListener::bind(("127.0.0.1", 0)).unwrap();
    let port = busy.local_addr().unwrap().port();
    let (_home, mcp) = offline_mcp();
    let status = mcp.configure(true, false, port, HashMap::new());
    assert!(!status.running);
    assert_eq!(status.error.as_deref(), Some(format!("Port {port} is already in use. Choose another port in Settings.").as_str()));
    let low = mcp.configure(true, false, 80, HashMap::new());
    assert!(!low.running && low.error.is_some());
    let off = mcp.configure(false, false, port, HashMap::new());
    assert_eq!(off.error, None);
}

// ---------------------------------------------------------------------------
// UI bridge

fn ui_tool(tool_name: &str) -> McpUiToolDef {
    McpUiToolDef {
        name: tool_name.to_string(),
        title: "Open file".to_string(),
        description: "Opens a file in the editor.".to_string(),
        category: "App".to_string(),
        read_only: false,
        destructive: false,
        input_schema: json!({ "type": "object", "properties": { "filePath": { "type": "string" } } }),
    }
}

#[test]
fn ui_tools_go_through_the_window_and_come_back() {
    let fixture = Fixture::new(true, false);
    fixture.mcp.register_ui_tools(vec![ui_tool("open_file")]).unwrap();
    *fixture.host.answer.lock().unwrap() = Some((
        fixture.mcp.clone(),
        McpUiResult {
            ok: true,
            text: "Opened a.txt".to_string(),
            structured: Some(json!({ "tabs": 1 })),
            image_png_base64: None,
        },
    ));
    let result = fixture.call("open_file", json!({ "filePath": "/tmp/a.txt" }));
    assert_eq!(result["isError"], false, "{result}");
    assert_eq!(text_of(&result), "Opened a.txt");
    assert_eq!(result["structuredContent"]["tabs"], 1);
    let requests = fixture.host.events_named("mcp-ui-request");
    assert_eq!(requests.len(), 1);
    assert_eq!(requests[0]["tool"], "open_file");
    assert_eq!(requests[0]["arguments"]["filePath"], "/tmp/a.txt");
    assert!(requests[0]["requestId"].as_u64().unwrap() > 0);

    let activity = fixture.host.events_named("mcp-activity");
    assert_eq!(activity.last().unwrap()["tool"], "open_file");
    assert_eq!(activity.last().unwrap()["ok"], true);
    assert_eq!(activity.last().unwrap()["client"], "mcp");

    let listed = listed_names(&fixture.rpc("tools/list", json!({})));
    assert!(listed.contains(&"open_file".to_string()));
    let clash = fixture.mcp.register_ui_tools(vec![ui_tool("open_file"), ui_tool("git_status")]);
    assert!(clash.unwrap_err().to_string().contains("git_status is already a backend tool"));
    assert!(listed_names(&fixture.rpc("tools/list", json!({}))).contains(&"open_file".to_string()));
}

#[test]
fn an_unanswered_ui_call_times_out_and_is_forgotten() {
    let fixture = Fixture::new(true, false);
    fixture.mcp.register_ui_tools(vec![ui_tool("open_file")]).unwrap();
    let result = fixture.call("open_file", json!({}));
    assert_eq!(result["isError"], true);
    assert_eq!(text_of(&result), NO_ANSWER);
    assert_eq!(fixture.mcp.pending_ui_calls(), 0);
    let request_id = fixture.host.events_named("mcp-ui-request")[0]["requestId"].as_u64().unwrap();
    assert!(!fixture.mcp.ui_respond(request_id, McpUiResult::default()), "a late answer is dropped");
}

#[test]
fn ui_calls_fail_fast_without_a_window() {
    let (_home, mcp) = offline_mcp();
    mcp.register_ui_tools(vec![ui_tool("open_file")]).unwrap();
    let call = r#"{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"open_file"}}"#;
    let result = handle(&mcp, call).1.unwrap()["result"].clone();
    assert_eq!(text_of(&result), NOT_READY);
    mcp.attach_host(Arc::new(TestHost::default()));
    let result = handle(&mcp, call).1.unwrap()["result"].clone();
    assert_eq!(text_of(&result), NOT_READY);
}

// ---------------------------------------------------------------------------
// Backend tools end to end

#[test]
fn paths_outside_the_workspace_are_refused() {
    let fixture = Fixture::new(true, false);
    let inside = TestRepo::new();
    let outside = TestRepo::new();
    outside.write("secret.txt", "secret\n");
    fixture.mcp.set_workspace(&[inside.path_string()]);
    for (tool_name, arguments) in [
        ("read_file", json!({ "filePath": outside.file("secret.txt").ui() })),
        ("git_status", json!({ "repoPath": outside.path_string() })),
        ("list_directory", json!({ "folderPath": if cfg!(windows) { "C:/" } else { "/" } })),
    ] {
        let result = fixture.call(tool_name, arguments);
        assert_eq!(result["isError"], true, "{tool_name}");
        assert_eq!(text_of(&result), OUTSIDE, "{tool_name}");
    }
    let missing = fixture.call("git_status", json!({}));
    assert_eq!(text_of(&missing), "Missing required argument: repoPath");
}

#[test]
fn git_tools_read_and_commit_over_http() {
    let fixture = Fixture::new(true, false);
    let repo = TestRepo::new();
    repo.write("a.txt", "one\ntwo\nthree\n");
    repo.commit_all("first commit");
    repo.write("a.txt", "one\nTWO\nthree\n");
    repo.write("new.txt", "new\n");
    fixture.mcp.set_workspace(&[repo.path_string()]);
    let repo_path = repo.path_string();

    let workspace = fixture.call("list_workspace", json!({}));
    assert_eq!(workspace["structuredContent"]["folders"][0]["repos"][0]["root"], repo_path);

    let status = fixture.call("git_status", json!({ "repoPath": repo_path }));
    assert_eq!(status["isError"], false, "{status}");
    let files = status["structuredContent"]["files"].as_array().unwrap();
    let paths: Vec<&str> = files.iter().map(|file| file["path"].as_str().unwrap()).collect();
    assert_eq!(paths, ["a.txt", "new.txt"]);
    assert_eq!(status["structuredContent"]["head"]["branch"], "main");

    let diff = text_of(&fixture.call("git_diff", json!({ "repoPath": repo_path })));
    assert!(diff.contains("-two\n+TWO"), "{diff}");
    assert!(diff.contains("+new"), "{diff}");
    let only_a = text_of(&fixture.call("git_diff", json!({ "repoPath": repo_path, "filePaths": ["a.txt"] })));
    assert!(!only_a.contains("new.txt"), "{only_a}");

    let read = text_of(&fixture.call("read_file", json!({ "filePath": repo.file("a.txt").ui(), "startLine": 2, "endLine": 2 })));
    assert!(read.starts_with("TWO\n[Lines 2-2 of 3."), "{read}");

    let staged = fixture.call("git_stage", json!({ "repoPath": repo_path, "filePaths": [repo.file("a.txt").ui(), "new.txt"] }));
    assert_eq!(staged["isError"], false, "{staged}");
    let staged_diff = text_of(&fixture.call("git_diff", json!({ "repoPath": repo_path, "mode": "staged" })));
    assert!(staged_diff.contains("2 file(s) changed"), "{staged_diff}");
    let commit = fixture.call("git_commit", json!({ "repoPath": repo_path, "message": "second commit\n\nBody" }));
    assert_eq!(commit["isError"], false, "{commit}");
    assert_eq!(commit["structuredContent"]["commitId"], repo.head());
    assert_eq!(repo.porcelain(), "");

    let log = fixture.call("git_log", json!({ "repoPath": repo_path, "limit": 1 }));
    let commits = log["structuredContent"]["commits"].as_array().unwrap();
    assert_eq!(commits.len(), 1);
    assert_eq!(commits[0]["summary"], "second commit");
    assert_eq!(log["structuredContent"]["nextOffset"], 1);
    let file_log = fixture.call("git_log", json!({ "repoPath": repo_path, "filePath": "new.txt" }));
    assert_eq!(file_log["structuredContent"]["commits"].as_array().unwrap().len(), 1);

    let shown = fixture.call("git_show_commit", json!({ "repoPath": repo_path, "commitId": "HEAD", "includePatch": true }));
    assert_eq!(shown["structuredContent"]["message"], "second commit\n\nBody\n");
    assert!(shown["structuredContent"]["patch"].as_str().unwrap().contains("+TWO"));

    let blame = fixture.call("git_blame", json!({ "repoPath": repo_path, "filePath": "a.txt", "startLine": 2, "endLine": 3 }));
    let lines = blame["structuredContent"]["lines"].as_array().unwrap();
    assert_eq!(lines.len(), 2);
    assert_eq!(lines[0]["text"], "TWO");
    assert_eq!(lines[0]["summary"], "second commit");
    assert_eq!(lines[1]["summary"], "first commit");

    // A turned-off destructive tool stays off even for a valid call.
    let push = fixture.call("git_push", json!({ "repoPath": repo_path }));
    assert_eq!(text_of(&push), TURNED_OFF);
}

#[test]
fn file_search_and_performance_tools_answer() {
    let fixture = Fixture::with_states(true, false, HashMap::from([("write_file".to_string(), true)]));
    let repo = TestRepo::new();
    repo.write("src/cart.rs", "pub struct Cart;\nfn add_item() {}\n");
    repo.commit_all("cart");
    fixture.mcp.set_workspace(&[repo.path_string()]);

    let written = fixture.call("write_file", json!({ "filePath": repo.file("notes/todo.md").ui(), "content": "buy milk\n" }));
    assert_eq!(written["isError"], false, "{written}");
    assert_eq!(repo.read_text("notes/todo.md"), "buy milk\n");
    let into_git = fixture.call("write_file", json!({ "filePath": repo.file(".git/config").ui(), "content": "x" }));
    assert_eq!(into_git["isError"], true);

    let listing = fixture.call("list_directory", json!({ "folderPath": repo.path_string() }));
    let names: Vec<&str> = listing["structuredContent"]["entries"]
        .as_array()
        .unwrap()
        .iter()
        .map(|entry| entry["name"].as_str().unwrap())
        .collect();
    assert_eq!(names, ["notes", "src"]);
    assert_eq!(listing["structuredContent"]["entries"][0], json!({ "name": "notes", "isDir": true }));
    assert_eq!(listing["structuredContent"]["total"], 2);
    assert_eq!(listing["structuredContent"]["truncated"], false);

    // Pages: flags only when true, nextOffset until the last page.
    repo.write(".gitignore", "*.log\n");
    repo.write("a.log", "x");
    std::fs::create_dir_all(repo.file("inner")).unwrap();
    git_in(&repo.file("inner"), &["init", "-q"]);
    let page = |offset: u64| fixture.call("list_directory", json!({ "folderPath": repo.path_string(), "limit": 2, "offset": offset }));
    let first = page(0);
    assert_eq!(
        first["structuredContent"]["entries"],
        json!([{ "name": "inner", "isDir": true, "isRepo": true }, { "name": "notes", "isDir": true }]),
        "{first}"
    );
    assert_eq!(first["structuredContent"]["total"], 5);
    assert_eq!(first["structuredContent"]["truncated"], true);
    assert_eq!(first["structuredContent"]["nextOffset"], 2);
    let last = page(4);
    assert_eq!(last["structuredContent"]["entries"], json!([{ "name": "a.log", "isDir": false, "ignored": true }]));
    assert_eq!(last["structuredContent"]["truncated"], false);
    assert!(last["structuredContent"].get("nextOffset").is_none());
    assert_eq!(page(9)["structuredContent"]["entries"], json!([]));

    let found = fixture.call("search_files", json!({ "query": "cart" }));
    assert_eq!(found["structuredContent"]["items"][0]["relativePath"], "src/cart.rs");
    let text = fixture.call("search_text", json!({ "query": "add_item" }));
    assert_eq!(text["structuredContent"]["files"][0]["lines"][0]["line"], 2, "{text}");
    let bad_regex = fixture.call("search_text", json!({ "query": "((", "regex": true }));
    assert_eq!(bad_regex["isError"], true);
    let symbols = fixture.call("search_symbols", json!({ "query": "Cart" }));
    assert_eq!(symbols["structuredContent"]["items"][0]["name"], "Cart", "{symbols}");

    let memory = fixture.call("sample_memory", json!({ "durationMs": 250, "intervalMs": 100 }));
    assert_eq!(memory["isError"], false);
    assert!(memory["structuredContent"]["samples"].as_array().unwrap().len() >= 3);

    let shot = fixture.call("take_screenshot", json!({}));
    assert_eq!(shot["content"][0]["type"], "image");
    assert_eq!(shot["content"][0]["mimeType"], "image/png");
    assert!(shot["content"][1]["text"].as_str().unwrap().contains("1x2"));
}

// ---------------------------------------------------------------------------
// The command line tool

#[test]
fn cli_arguments_are_typed_and_checked() {
    let parsed = cli::parse(&strings(&[
        "call",
        "git_log",
        "--args",
        r#"{"repoPath":"/r","limit":1}"#,
        "limit=5",
        "allRefs=true",
        "paths=[\"a\",\"b\"]",
        "message=hello world",
        "quoted=\"42\"",
        "--json",
        "--out",
        "/tmp/x.png",
    ]))
    .unwrap();
    let cli::Command::Call { tool_name, arguments, json, out } = parsed else {
        panic!("not a call");
    };
    assert_eq!(tool_name, "git_log");
    assert_eq!(
        Value::Object(arguments),
        json!({ "repoPath": "/r", "limit": 5, "allRefs": true, "paths": ["a", "b"], "message": "hello world", "quoted": "42" })
    );
    assert!(json);
    assert_eq!(out, Some(PathBuf::from("/tmp/x.png")));

    assert_eq!(cli::parse(&strings(&["tools", "--all"])).unwrap(), cli::Command::Tools { json: false, all: true });
    assert_eq!(
        cli::parse(&strings(&["memory", "--interval", "20", "--duration", "5", "--json"])).unwrap(),
        cli::Command::Memory { interval_ms: 100, duration_s: Some(5), json: true },
    );
    assert!(cli::parse(&strings(&["memory", "--interval", "fast"])).is_err());
    let line = cli::memory_line(
        &serde_json::json!({ "totalBytes": 104857600u64, "processes": [{ "label": "Web content (UI)", "bytes": 52428800u64 }] }),
        1500,
    );
    assert_eq!(line, "    1.5s  total   100.0 MB  |  Web content 50.0");
    assert!(matches!(cli::parse(&strings(&["call", "x", "--help"])).unwrap(), cli::Command::Help(_)));
    for bad in [
        vec![],
        strings(&["frobnicate"]),
        strings(&["call"]),
        strings(&["call", "x", "novalue"]),
        strings(&["call", "x", "=1"]),
        strings(&["call", "x", "--args", "[1]"]),
        strings(&["call", "x", "--out"]),
        strings(&["tools", "--bogus"]),
        strings(&["describe"]),
        strings(&["screenshot"]),
    ] {
        assert!(cli::parse(&bad).is_err(), "{bad:?}");
        let (mut out, mut err) = (Vec::new(), Vec::new());
        assert_eq!(cli::run_with(&bad, std::path::Path::new("/nonexistent"), &mut out, &mut err), cli::EXIT_UNAVAILABLE);
    }
}

fn run_cli(config_dir: &std::path::Path, args: &[&str]) -> (i32, String, String) {
    let (mut out, mut err) = (Vec::new(), Vec::new());
    let code = cli::run_with(&strings(args), config_dir, &mut out, &mut err);
    (code, String::from_utf8(out).unwrap(), String::from_utf8(err).unwrap())
}

#[test]
fn the_cli_calls_tools_on_the_running_server() {
    let fixture = Fixture::new(false, true);
    let repo = TestRepo::new();
    repo.write("a.txt", "a\n");
    repo.commit_all("hello from the cli");
    fixture.mcp.set_workspace(&[repo.path_string()]);
    let repo_arg = format!("repoPath={}", repo.path_string());
    let dir = fixture.config_dir.as_path();

    let (code, out, _) = run_cli(dir, &["status"]);
    assert_eq!(code, cli::EXIT_OK, "{out}");
    assert!(out.contains("MCP server: off") && out.contains("Command line tool: on"), "{out}");

    let (code, out, _) = run_cli(dir, &["call", "git_log", &repo_arg, "limit=1"]);
    assert_eq!(code, cli::EXIT_OK);
    assert!(out.contains("hello from the cli"), "{out}");
    let (code, out, _) = run_cli(dir, &["call", "git_log", &repo_arg, "--json"]);
    assert_eq!(code, cli::EXIT_OK);
    assert_eq!(serde_json::from_str::<Value>(&out).unwrap()["commits"][0]["summary"], "hello from the cli");

    let elsewhere = if cfg!(windows) { "repoPath=C:/elsewhere" } else { "repoPath=/elsewhere" };
    let (code, _, err) = run_cli(dir, &["call", "git_status", elsewhere]);
    assert_eq!(code, cli::EXIT_TOOL_ERROR);
    assert!(err.contains(OUTSIDE), "{err}");
    let (code, _, err) = run_cli(dir, &["call", "no_such_tool"]);
    assert_eq!(code, cli::EXIT_UNAVAILABLE);
    assert!(err.contains("Unknown tool"), "{err}");

    let (code, out, _) = run_cli(dir, &["tools"]);
    assert_eq!(code, cli::EXIT_OK);
    assert!(out.contains("git_status") && !out.contains("git_push"), "{out}");
    let (_, all, _) = run_cli(dir, &["tools", "--all"]);
    assert!(all.lines().any(|line| line.starts_with("git_push") && line.ends_with("(off)")), "{all}");
    let (code, described, _) = run_cli(dir, &["describe", "git_commit"]);
    assert_eq!(code, cli::EXIT_OK);
    assert!(described.contains("\"message\""), "{described}");

    // Live memory: one line per sample and a summary when a duration is given.
    let (code, out, _) = run_cli(dir, &["memory", "--interval", "100", "--duration", "1"]);
    assert_eq!(code, cli::EXIT_OK, "{out}");
    assert!(out.lines().filter(|line| line.contains("total") && line.contains(" MB")).count() >= 3, "{out}");
    assert!(out.lines().last().unwrap_or_default().contains("peak"), "{out}");

    let shot_path = fixture.config_dir.join("shot.png");
    let (code, out, _) = run_cli(dir, &["screenshot", &shot_path.to_string_lossy()]);
    assert_eq!(code, cli::EXIT_OK, "{out}");
    assert_eq!(std::fs::read(&shot_path).unwrap(), image_bytes(&[0, 0, 0, 2, 9, 9]));

    let calls: Vec<_> = fixture.mcp.activity().into_iter().filter(|entry| entry.tool == "git_log").collect();
    assert!(calls.iter().all(|entry| entry.client == McpClient::Cli));

    fixture.mcp.configure(false, false, 0, HashMap::new());
    let (code, out, _) = run_cli(dir, &["status"]);
    assert_eq!(code, cli::EXIT_UNAVAILABLE);
    assert!(out.contains("not running"), "{out}");
}

#[test]
fn the_cli_asks_for_the_newest_protocol_the_server_speaks() {
    assert_eq!(cli::PROTOCOL_VERSION, super::protocol::PROTOCOL_VERSIONS[0]);
}

#[test]
fn the_cli_reports_a_switched_off_tool() {
    let fixture = Fixture::new(true, false);
    let (code, _, err) = run_cli(&fixture.config_dir, &["tools"]);
    assert_eq!(code, cli::EXIT_UNAVAILABLE);
    assert!(err.contains(CLI_OFF), "{err}");
}

#[test]
fn clone_repository_starts_off_and_clones_outside_the_workspace() {
    let source = TestRepo::new();
    source.write("readme.md", "hello\n");
    source.commit_all("first");
    let parent = TempDir::new().unwrap();
    let parent_path = parent.path().real_path().unwrap();
    let arguments = json!({ "url": source.path_string(), "parentPath": parent_path.ui() });

    let off = Fixture::new(true, false);
    let result = off.call("clone_repository", arguments.clone());
    assert_eq!(text_of(&result), TURNED_OFF);
    let listed = off.mcp.tools().into_iter().find(|tool| tool.name == "clone_repository").expect("listed");
    assert!(!listed.default_enabled && !listed.enabled && !listed.destructive);
    drop(off);

    let fixture = Fixture::with_states(true, false, HashMap::from([("clone_repository".to_string(), true)]));
    let source_name = source.path.file_name().unwrap().to_string_lossy().into_owned();
    let cloned = fixture.call("clone_repository", arguments.clone());
    assert_eq!(cloned["isError"], false, "{cloned}");
    let cloned_path = parent_path.join(&source_name);
    assert_eq!(cloned["structuredContent"]["clonedPath"], cloned_path.ui().as_str());
    assert!(cloned_path.join("readme.md").exists());
    assert!(fixture.host.events_named("mcp-open-folder").is_empty());

    // The same folder again is refused; a named folder can be opened in the window.
    let again = fixture.call("clone_repository", arguments);
    assert_eq!(again["isError"], true);
    assert!(text_of(&again).contains("not an empty folder"), "{again}");
    fixture.mcp.set_workspace(&[]);
    let opened = fixture.call(
        "clone_repository",
        json!({ "url": source.path_string(), "parentPath": parent_path.ui(), "folderName": "second", "open": "window" }),
    );
    assert_eq!(opened["isError"], false, "{opened}");
    let events = fixture.host.events_named("mcp-open-folder");
    assert_eq!(events.len(), 1, "{events:?}");
    assert_eq!(events[0]["folderPath"], parent_path.join("second").ui().as_str());
    assert_eq!(events[0]["mode"], "window");

    for (bad, message) in [
        (json!({ "url": "ext::sh -c touch% /tmp/x", "parentPath": parent_path.ui() }), "Remote helper"),
        (json!({ "url": source.path_string(), "parentPath": "relative/dir" }), "absolute path"),
        (json!({ "url": source.path_string(), "parentPath": parent_path.ui(), "open": "tab" }), "open must be"),
    ] {
        let refused = fixture.call("clone_repository", bad);
        assert_eq!(refused["isError"], true);
        assert!(text_of(&refused).contains(message), "{refused}");
    }
}

#[test]
fn the_cli_clones_into_the_given_or_current_folder() {
    assert_eq!(
        cli::parse(&strings(&["clone", "https://h/r.git", "name", "--into", "dir", "--open", "workspace"])).unwrap(),
        cli::Command::Clone {
            url: "https://h/r.git".to_string(),
            folder_name: Some("name".to_string()),
            into: Some(PathBuf::from("dir")),
            open: Some("workspace".to_string()),
        },
    );
    for bad in [&["clone"][..], &["clone", "a", "b", "c"], &["clone", "u", "--open", "tab"], &["clone", "u", "--into"], &["clone", "u", "--bogus"]] {
        assert!(cli::parse(&strings(bad)).is_err(), "{bad:?}");
    }
    let here = std::path::Path::new("/work");
    let relative = cli::clone_arguments("u", None, Some(std::path::Path::new("sub")), None, here);
    assert_eq!(relative["parentPath"], "/work/sub");
    assert!(!relative.contains_key("folderName") && !relative.contains_key("open"));
    let absolute = cli::clone_arguments("u", Some("n"), Some(std::path::Path::new("/abs")), Some("window"), here);
    assert_eq!(absolute["parentPath"], "/abs");
    assert_eq!(absolute["folderName"], "n");
    assert_eq!(absolute["open"], "window");
    assert_eq!(cli::clone_arguments("u", None, None, None, here)["parentPath"], "/work");

    let source = TestRepo::new();
    source.write("a.txt", "a\n");
    source.commit_all("first");
    let parent = TempDir::new().unwrap();
    let parent_path = parent.path().real_path().unwrap();
    let off = Fixture::new(false, true);
    let (code, _, err) = run_cli(&off.config_dir, &["clone", &source.path_string(), "--into", &parent_path.ui()]);
    assert_eq!(code, cli::EXIT_TOOL_ERROR);
    assert!(err.contains(TURNED_OFF), "{err}");
    drop(off);

    let fixture = Fixture::with_states(false, true, HashMap::from([("clone_repository".to_string(), true)]));
    let (code, out, err) = run_cli(&fixture.config_dir, &["clone", &source.path_string(), "copy", "--into", &parent_path.ui()]);
    assert_eq!(code, cli::EXIT_OK, "{out}{err}");
    assert!(out.contains(&format!("Cloned into {}", parent_path.join("copy").ui())), "{out}");
    assert!(parent_path.join("copy/a.txt").exists());
}
