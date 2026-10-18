use std::sync::{Arc, Mutex};

use serde_json::{json, Map, Value};

use super::{ChannelBody, Channels, Events};
use crate::host::{Args, Bus, Call, HostApp, HostWindow, Target};
use crate::state::{AppState, LaunchMode};
use crate::test_support::TestRepo;

/// The browser's bus without a server: events are only recorded.
struct RecordingBus {
    state: AppState,
    events: Events,
}

impl Bus for RecordingBus {
    fn state(&self) -> &AppState {
        &self.state
    }

    fn emit(&self, target: Target<'_>, event: &str, payload: Value) -> crate::error::AppResult<()> {
        (self.events)(target, event, payload);
        Ok(())
    }

    fn exit(&self, _code: i32) {}
}

fn app() -> HostApp {
    let events: Events = Arc::new(|_, _, _| {});
    HostApp::new(Arc::new(RecordingBus {
        state: AppState::new(LaunchMode::App { repo_path: None }),
        events,
    }))
}

fn call(app: &HostApp, command_name: &str, args: Value) -> Result<Value, Value> {
    let channels: Channels = Arc::new(|_, _| Ok(()));
    call_with(app, command_name, args, channels)
}

fn call_with(app: &HostApp, command_name: &str, args: Value, channels: Channels) -> Result<Value, Value> {
    let Value::Object(values) = args else {
        panic!("args must be an object");
    };
    let call = Call {
        args: Args::new(values, channels),
        window: HostWindow::new("tab-1".to_string()),
        app: app.clone(),
        raw: None,
    };
    let reply = crate::browser_command(command_name, call).expect("a known command");
    tauri::async_runtime::block_on(reply).map_err(|err| serde_json::to_value(err).unwrap())
}

#[test]
fn unknown_commands_have_no_entry() {
    let channels: Channels = Arc::new(|_, _| Ok(()));
    let call = Call {
        args: Args::new(Map::new(), channels),
        window: HostWindow::new("tab-1".to_string()),
        app: app(),
        raw: None,
    };
    assert!(crate::browser_command("no_such_command", call).is_none());
}

#[test]
fn data_commands_read_camel_case_arguments() {
    let repo = TestRepo::new();
    repo.write("a.txt", "one\n");
    let snapshot = call(&app(), "get_status", json!({ "repoPath": repo.path_string() })).unwrap();
    assert!(snapshot["hash"].is_string());
    assert!(snapshot["status"].is_object());
}

#[test]
fn a_missing_argument_is_an_invalid_call_and_a_missing_option_is_none() {
    let error = call(&app(), "get_status", json!({})).unwrap_err();
    assert_eq!(error["kind"], "invalid");
    assert!(error["message"].as_str().unwrap().contains("repoPath"), "{error}");
    // knownHash is an Option: leaving it out is fine.
    let repo = TestRepo::new();
    assert!(call(&app(), "get_status", json!({ "repoPath": repo.path_string() })).is_ok());
}

#[test]
fn window_and_state_arguments_come_from_the_tab() {
    let start = call(&app(), "window_startup", json!({})).unwrap();
    assert_eq!(start, json!({ "kind": "default", "label": "tab-1" }));
}

#[test]
fn desktop_only_commands_answer_with_an_error() {
    let error = call(&app(), "window_close", json!({})).unwrap_err();
    assert!(error["message"].as_str().unwrap().contains("desktop app"), "{error}");
}

#[test]
fn channels_reach_the_tab_that_called() {
    let repo = TestRepo::new();
    repo.write("notes.txt", "needle here\n");
    repo.commit_all("first");
    let received = Arc::new(Mutex::new(Vec::new()));
    let sink = received.clone();
    let channels: Channels = Arc::new(move |channel_id, body| {
        if let ChannelBody::Json(json) = body {
            sink.lock().unwrap().push((channel_id, json));
        }
        Ok(())
    });
    let args = json!({
        "workspaceRoots": [repo.path_string()],
        "searchId": 1,
        "query": "needle",
        "options": { "matchCase": false, "wholeWords": false, "regex": false },
        "results": "__CHANNEL__:7",
    });
    call_with(&app(), "text_search", args, channels).unwrap();
    let received = received.lock().unwrap();
    assert!(received.iter().all(|(channel_id, _)| *channel_id == 7));
    assert!(received.iter().any(|(_, json)| json.contains("notes.txt")), "{received:?}");
}
