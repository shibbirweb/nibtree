use std::time::Instant;

use serde::Serialize;
use tauri::{State, Window};

use super::blocking;
use crate::error::AppResult;
use crate::host::{ChannelBody, HostChannel};
use crate::state::AppState;
use crate::terminal::{self, ShellProfile, TerminalInfo, TerminalRegistry};
use crate::terminal_link::{Delivery, Sink, TerminalLinks, TerminalStash, DETACHED_TIMEOUT};
use crate::terminal_memory::TerminalMemory;

/// The last message on a terminal's output channel; None when the shell was killed or its code is unknown.
#[derive(Debug, Serialize)]
struct TerminalExitMessage {
    exit: Option<i32>,
}

/// A terminal's or a run's page channel: merged output as raw bytes (an ArrayBuffer in JS), then
/// the exit as a `{ exit }` JSON message, after every byte of output.
pub(crate) fn channel_sink(output: HostChannel<ChannelBody>) -> Sink {
    Box::new(move |delivery| {
        let _ = match delivery {
            Delivery::Output(bytes) => output.send_body(ChannelBody::Raw(bytes)),
            Delivery::Exit(exit_code) => match serde_json::to_string(&TerminalExitMessage { exit: exit_code }) {
                Ok(json) => output.send_body(ChannelBody::Json(json)),
                Err(_) => Ok(()),
            },
        };
    })
}

#[crate::command]
pub async fn terminal_shells() -> AppResult<Vec<ShellProfile>> {
    blocking(|| Ok(terminal::shell_profiles())).await
}

/// Output goes to `output` as raw bytes, then the exit as `{ exit }` (see `send_output` and `send_exit`).
/// The view acknowledges written output with `terminal_ack`.
#[crate::command]
pub async fn terminal_spawn(
    window: Window,
    state: State<'_, AppState>,
    shell_id: Option<String>,
    cwd: Option<String>,
    cols: u16,
    rows: u16,
    output: Channel<ChannelBody>,
) -> AppResult<TerminalInfo> {
    let terminals = state.terminals.clone();
    let links = state.terminal_links.clone();
    let window_label = window.label().to_string();
    blocking(move || {
        let (link, on_output, on_exit) = links.link(channel_sink(output));
        let info = terminal::start_terminal(&terminals, shell_id.as_deref(), cwd.as_deref(), cols, rows, on_output, on_exit)?;
        links.register(info.terminal_id, link);
        terminals.adopt(info.terminal_id, &window_label);
        Ok(info)
    })
    .await
}

/// Runs on every keystroke: it only queues the bytes for the terminal's writer thread,
/// so it stays a cheap synchronous command and keeps keystrokes in order.
#[crate::command]
pub fn terminal_write(state: State<'_, AppState>, terminal_id: u32, data: String) {
    state.terminals.write(terminal_id, data.into_bytes());
}

/// The view wrote `byte_count` more bytes of output (sent about every 128 KB), so a
/// terminal paused by flow control can read on. Cheap and synchronous, like `terminal_write`.
#[crate::command]
pub fn terminal_ack(state: State<'_, AppState>, terminal_id: u32, byte_count: usize) {
    state.terminals.ack(terminal_id, byte_count);
}

#[crate::command]
pub fn terminal_resize(state: State<'_, AppState>, terminal_id: u32, cols: u16, rows: u16) -> AppResult<()> {
    state.terminals.resize(terminal_id, cols, rows)
}

#[crate::command]
pub async fn terminal_close(state: State<'_, AppState>, terminal_id: u32) -> AppResult<()> {
    let terminals = state.terminals.clone();
    blocking(move || {
        terminals.close(terminal_id);
        Ok(())
    })
    .await
}

/// Memory of the asking window's terminals and runs, each with what its shell started, for the memory details.
#[crate::command]
pub async fn terminal_memory(window: Window, state: State<'_, AppState>) -> AppResult<Vec<TerminalMemory>> {
    let shells = state.terminals.window_shells(window.label());
    blocking(move || Ok(crate::terminal_memory::usage(&shells))).await
}

/// Closes the asking window's terminals and runs (it reloaded); other windows keep theirs, and
/// terminals waiting for this window after Clear Cache stay for `terminal_reattach`.
#[crate::command]
pub async fn terminal_close_all(window: Window, state: State<'_, AppState>) -> AppResult<()> {
    let terminals = state.terminals.clone();
    let links = state.terminal_links.clone();
    let window_label = window.label().to_string();
    blocking(move || {
        terminals.close_window_except(&window_label, &links.detached_ids());
        Ok(())
    })
    .await
}

/// Clear Cache, before the page restarts: the page's terminals keep running and hold their
/// output, and the layout and screens wait for the new page. A terminal nobody reconnects to
/// within `DETACHED_TIMEOUT` is closed.
pub(crate) fn stash_terminals(terminals: &TerminalRegistry, links: &TerminalLinks, window_label: &str, stash: TerminalStash) {
    let waiting = links.stash(window_label, stash, Instant::now());
    if waiting.is_empty() {
        return;
    }
    let terminals = terminals.clone();
    let links = links.clone();
    std::thread::spawn(move || {
        std::thread::sleep(DETACHED_TIMEOUT);
        for terminal_id in links.take_expired(Instant::now(), DETACHED_TIMEOUT) {
            terminals.close(terminal_id);
        }
    });
}

/// A starting page takes what its window left before Clear Cache, once; None after a normal start.
#[crate::command]
pub async fn terminal_unstash(window: Window, state: State<'_, AppState>) -> AppResult<Option<TerminalStash>> {
    let links = state.terminal_links.clone();
    let window_label = window.label().to_string();
    blocking(move || Ok(links.unstash(&window_label))).await
}

/// Connects a waiting terminal to the new page: what it printed meanwhile comes first, then
/// live output. False when the terminal is not waiting (it was closed or timed out).
#[crate::command]
pub async fn terminal_reattach(state: State<'_, AppState>, terminal_id: u32, output: Channel<ChannelBody>) -> AppResult<bool> {
    let links = state.terminal_links.clone();
    blocking(move || Ok(links.reattach(terminal_id, channel_sink(output)))).await
}

#[cfg(test)]
mod tests {
    use super::TerminalExitMessage;

    #[test]
    fn the_exit_message_matches_the_view() {
        // TerminalExitMessage in src/lib/types.ts.
        let json = |exit_code| serde_json::to_string(&TerminalExitMessage { exit: exit_code }).unwrap();
        assert_eq!(json(Some(3)), r#"{"exit":3}"#);
        assert_eq!(json(None), r#"{"exit":null}"#);
    }
}
