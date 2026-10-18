// The browser server builds this crate without `desktop`: what only the desktop app calls (window sessions, the
// preview scheme, the old settings folder move) is unused there. The desktop build still reports dead code.
#![cfg_attr(not(feature = "desktop"), allow(dead_code))]

// First: `with_commands!` must be defined before the code that uses it.
#[macro_use]
mod command_list;
mod ai_usage;
mod keep_awake;
mod askpass;
pub mod browser;
mod child_process;
mod commands;
mod config;
mod legacy_config;
mod error;
mod file_ops;
mod file_search;
mod git;
mod git_console;
mod github;
pub mod host;
mod local_history;
mod media;
mod mcp;
mod memory;
mod memory_log;
mod merge;
mod run_process;
mod node_versions;
mod open_files;
mod paths;
#[cfg(any(windows, test))]
mod png_encode;
mod preview_scheme;
mod scripts;
mod shelf;
mod state;
mod symbols;
mod terminal;
mod terminal_flow;
mod terminal_link;
mod terminal_memory;
#[cfg(test)]
mod test_support;
mod text_search;
mod unsaved;
mod watcher;
mod windows;
mod workspace_file;

/// `#[crate::command]` on every command: see nibtree-macros and `host`.
use nibtree_macros::command;

#[cfg(feature = "desktop")]
use {
    state::{AppState, LaunchMode},
    std::sync::atomic::Ordering,
    tauri::{Manager, RunEvent},
};

/// The browser server's entry point for a command, or None when no command has that name.
pub fn browser_command(command_name: &str, call: host::Call) -> Option<host::Reply> {
    let handler = with_commands!(nibtree_macros::browser_handler);
    handler(command_name, call)
}

/// The desktop app (src/main.rs).
#[cfg(feature = "desktop")]
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Started by git or ssh as their askpass program: ask the running app, print the answer, exit.
    if let Some(code) = askpass::client_main() {
        std::process::exit(code);
    }
    let args: Vec<String> = std::env::args().skip(1).collect();
    // `nibtree cli ...` is the command line tool: no window, just its exit code.
    if args.first().map(String::as_str) == Some("cli") {
        std::process::exit(mcp::cli::run(&args[1..]));
    }
    let launch = LaunchMode::from_args(&args);
    git::repo::configure_libgit2();
    // Before anything reads settings: carry ~/.gitmanager over from the Git Manager days.
    if let Ok(home) = config::home_dir() {
        legacy_config::move_legacy_dir_in(&home);
    }

    let builder = tauri::Builder::default();
    // Registered first, as the plugin asks. Never for the merge tool: `git mergetool` starts it next to
    // the running app on purpose.
    #[cfg(windows)]
    let builder = if launch.is_mergetool() {
        builder
    } else {
        builder.plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
            commands::window::on_second_launch(app, &args, &cwd);
        }))
    };
    let app = builder
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(AppState::new(launch))
        // Images and PDFs for the previews, off the main thread (see preview_scheme.rs).
        // Each window's page reaches only the folders open in that window.
        .register_asynchronous_uri_scheme_protocol(preview_scheme::SCHEME, |context, request, responder| {
            let folders = context.app_handle().state::<AppState>().preview_folders.get(context.webview_label());
            tauri::async_runtime::spawn_blocking(move || {
                responder.respond(preview_scheme::http_response(&folders, &request));
            });
        })
        .setup(|app| {
            let host = std::sync::Arc::new(mcp::TauriHost::new(app.handle().clone()));
            app.state::<AppState>().mcp.attach_host(host);
            askpass::install(Box::new(commands::askpass::WindowHooks::new(host::HostApp::from_tauri(app.handle()))));
            commands::window::restore_at_start(app.handle());
            Ok(())
        })
        .invoke_handler(with_commands!(tauri::generate_handler))
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| match event {
        RunEvent::WindowEvent { label, event, .. } => commands::window::on_window_event(app_handle, &label, &event),
        // An explicit quit closes every window at once: they all stay in the session.
        RunEvent::ExitRequested { code: Some(_), .. } => commands::window::on_quit(app_handle),
        RunEvent::Exit => {
            // Cmd+Q on macOS ends the loop without closing the windows one by one.
            commands::window::on_quit(app_handle);
            let state = app_handle.state::<AppState>();
            // No orphan shells: every terminal process dies with the app.
            state.terminals.shutdown();
            // Frees the port and takes it out of mcp.json, so the command line tool sees the app is gone.
            state.mcp.shutdown();
            state.memory_log.stop();
            if state.launch.is_mergetool() {
                // git mergetool trusts the exit code: 0 only after an explicit save.
                std::process::exit(state.mergetool_exit_code.load(Ordering::SeqCst));
            }
        }
        _ => {}
    });
}

#[cfg(test)]
mod capability_tests {
    #[test]
    fn opener_may_open_web_links() {
        let capability: serde_json::Value = serde_json::from_str(include_str!("../capabilities/default.json")).unwrap();
        let permissions: Vec<&str> = capability["permissions"]
            .as_array()
            .map(|items| items.iter().filter_map(|item| item.as_str()).collect())
            .unwrap_or_default();
        // allow-open-url has no URL scope of its own, so without allow-default-urls every link is refused.
        assert!(permissions.contains(&"opener:allow-open-url"));
        assert!(permissions.contains(&"opener:allow-default-urls"));
    }
}
