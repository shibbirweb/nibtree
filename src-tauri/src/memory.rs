//! Memory used by the app, as Activity Monitor counts it: the app process plus
//! the WebKit helper processes (web content, GPU, networking) macOS runs for
//! its web view. Uses the physical footprint, Activity Monitor's "Memory".
//!
//! Windows counts the same way Task Manager does: the app plus the WebView2
//! processes it started, each with its private working set ("Memory").

use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessMemory {
    pub pid: i32,
    pub name: String,
    /// Human-friendly role, e.g. "Web content (UI)".
    pub label: String,
    pub bytes: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryUsage {
    pub total_bytes: u64,
    pub processes: Vec<ProcessMemory>,
    /// True when helpers were matched by start time (app started from a terminal).
    pub approximate: bool,
}

/// The app's own row.
#[cfg(any(target_os = "macos", windows, test))]
fn label_for_app() -> String {
    "Nibtree (app)".to_string()
}

#[cfg(any(target_os = "macos", test))]
pub fn label_for(name: &str, is_self: bool) -> String {
    if is_self {
        return label_for_app();
    }
    if name.contains("WebContent") {
        "Web content (UI)".to_string()
    } else if name.contains("GPU") {
        "Graphics".to_string()
    } else if name.contains("Networking") {
        "Networking".to_string()
    } else {
        name.to_string()
    }
}

/// The WebView2 program; its role comes from `--type` on its command line.
#[cfg(any(windows, test))]
const WEBVIEW_EXE: &str = "msedgewebview2.exe";

/// A WebView2 process's role, from its command line, named like the macOS helpers.
#[cfg(any(windows, test))]
pub fn webview_label(command_line: &str) -> String {
    let process_type = command_line
        .split_whitespace()
        .find_map(|word| word.trim_matches('"').strip_prefix("--type="))
        .unwrap_or_default();
    match process_type {
        "" => "WebView2 (browser)".to_string(),
        "renderer" => "Web content (UI)".to_string(),
        "gpu-process" => "Graphics".to_string(),
        "utility" if command_line.contains("network.mojom.NetworkService") => "Networking".to_string(),
        "utility" => "Utility".to_string(),
        "crashpad-handler" => "Crash reporter".to_string(),
        other => other.to_string(),
    }
}

/// The WebView2 processes below `own` in a process list of (pid, parent pid, file name):
/// the browser it started and that browser's helpers. Other children (terminal shells,
/// git) are left out, like on macOS.
#[cfg(any(windows, test))]
pub fn webview_processes(own: u32, all: &[(u32, u32, String)]) -> Vec<(u32, String)> {
    let mut found: Vec<(u32, String)> = Vec::new();
    let mut parents = vec![own];
    while let Some(parent) = parents.pop() {
        for (pid, parent_pid, name) in all {
            let new = *pid != own && !found.iter().any(|(seen, _)| seen == pid);
            if *parent_pid == parent && new && name.eq_ignore_ascii_case(WEBVIEW_EXE) {
                found.push((*pid, name.clone()));
                parents.push(*pid);
            }
        }
    }
    found
}

#[cfg(target_os = "macos")]
mod platform {
    use std::os::raw::{c_int, c_void};

    use super::{label_for, MemoryUsage, ProcessMemory};

    const RUSAGE_INFO_V2: c_int = 2;

    #[repr(C)]
    #[derive(Default)]
    struct RusageInfoV2 {
        uuid: [u8; 16],
        user_time: u64,
        system_time: u64,
        pkg_idle_wkups: u64,
        interrupt_wkups: u64,
        pageins: u64,
        wired_size: u64,
        resident_size: u64,
        phys_footprint: u64,
        proc_start_abstime: u64,
        proc_exit_abstime: u64,
        child_user_time: u64,
        child_system_time: u64,
        child_pkg_idle_wkups: u64,
        child_interrupt_wkups: u64,
        child_pageins: u64,
        child_elapsed_abstime: u64,
        diskio_bytesread: u64,
        diskio_byteswritten: u64,
    }

    extern "C" {
        fn proc_listallpids(buffer: *mut c_void, buffersize: c_int) -> c_int;
        fn proc_name(pid: c_int, buffer: *mut c_void, buffersize: u32) -> c_int;
        fn proc_pid_rusage(pid: c_int, flavor: c_int, buffer: *mut c_void) -> c_int;
        // Exported by libSystem; Activity Monitor uses it to group helper processes.
        fn responsibility_get_pid_responsible_for_pid(pid: c_int) -> c_int;
    }

    fn rusage(pid: c_int) -> Option<RusageInfoV2> {
        let mut info = RusageInfoV2::default();
        // SAFETY: `info` is a correctly sized, writable rusage_info_v2 buffer.
        let result = unsafe { proc_pid_rusage(pid, RUSAGE_INFO_V2, &mut info as *mut RusageInfoV2 as *mut c_void) };
        (result == 0).then_some(info)
    }

    fn name_of(pid: c_int) -> String {
        let mut buffer = [0u8; 256];
        // SAFETY: the buffer is writable and its length is passed along.
        let length = unsafe { proc_name(pid, buffer.as_mut_ptr() as *mut c_void, buffer.len() as u32) };
        String::from_utf8_lossy(&buffer[..length.max(0) as usize]).into_owned()
    }

    fn all_pids() -> Vec<c_int> {
        let mut pids = vec![0 as c_int; 4096];
        loop {
            let capacity = (pids.len() * std::mem::size_of::<c_int>()) as c_int;
            // SAFETY: the buffer holds `capacity` bytes.
            let count = unsafe { proc_listallpids(pids.as_mut_ptr() as *mut c_void, capacity) };
            if count < 0 {
                return Vec::new();
            }
            if (count as usize) < pids.len() {
                pids.truncate(count as usize);
                return pids;
            }
            pids.resize(pids.len() * 2, 0);
        }
    }

    pub fn usage() -> MemoryUsage {
        let own = std::process::id() as c_int;
        let own_info = rusage(own);
        let own_start = own_info.as_ref().map(|info| info.proc_start_abstime).unwrap_or(0);
        // SAFETY: plain query on a pid.
        let responsible = unsafe { responsibility_get_pid_responsible_for_pid(own) };
        // Launched from Finder the app is responsible for itself and helpers match
        // exactly; from a terminal the terminal is, so also require a later start.
        let approximate = responsible != own;

        let mut processes = vec![ProcessMemory {
            pid: own,
            name: name_of(own),
            label: label_for("", true),
            bytes: own_info.map(|info| info.phys_footprint).unwrap_or(0),
        }];
        for pid in all_pids() {
            if pid <= 0 || pid == own {
                continue;
            }
            // SAFETY: plain query on a pid.
            if unsafe { responsibility_get_pid_responsible_for_pid(pid) } != responsible {
                continue;
            }
            let name = name_of(pid);
            if !name.starts_with("com.apple.WebKit") {
                continue;
            }
            let Some(info) = rusage(pid) else {
                continue;
            };
            if approximate && info.proc_start_abstime < own_start {
                continue;
            }
            processes.push(ProcessMemory {
                pid,
                label: label_for(&name, false),
                name,
                bytes: info.phys_footprint,
            });
        }
        MemoryUsage {
            total_bytes: processes.iter().map(|process| process.bytes).sum(),
            processes,
            approximate,
        }
    }

    pub fn process_parents() -> Vec<(u32, u32)> {
        let size = std::mem::size_of::<libc::proc_bsdinfo>() as c_int;
        all_pids()
            .into_iter()
            .filter(|pid| *pid > 0)
            .filter_map(|pid| {
                // SAFETY: an all-zero proc_bsdinfo is valid; the call writes at most `size` bytes into it.
                let mut info: libc::proc_bsdinfo = unsafe { std::mem::zeroed() };
                let written =
                    unsafe { libc::proc_pidinfo(pid, libc::PROC_PIDTBSDINFO, 0, &mut info as *mut _ as *mut c_void, size) };
                (written == size).then_some((pid as u32, info.pbi_ppid))
            })
            .collect()
    }

    pub fn process_bytes(pid: u32) -> Option<u64> {
        rusage(pid as c_int).map(|info| info.phys_footprint)
    }

    /// A WebKit web content process of this app, the only kind Clear Cache may end.
    pub fn is_own_web_content(pid: c_int) -> bool {
        pid > 0
            && name_of(pid).starts_with("com.apple.WebKit.WebContent")
            && usage().processes.iter().any(|process| process.pid == pid)
    }
}

#[cfg(windows)]
mod platform {
    use std::ffi::c_void;

    use windows_sys::Wdk::System::Threading::{NtQueryInformationProcess, ProcessCommandLineInformation};
    use windows_sys::Win32::Foundation::{CloseHandle, HANDLE, INVALID_HANDLE_VALUE, STATUS_INFO_LENGTH_MISMATCH, UNICODE_STRING};
    use windows_sys::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W, TH32CS_SNAPPROCESS,
    };
    use windows_sys::Win32::System::ProcessStatus::{
        GetProcessMemoryInfo, PROCESS_MEMORY_COUNTERS, PROCESS_MEMORY_COUNTERS_EX, PROCESS_MEMORY_COUNTERS_EX2,
    };
    use windows_sys::Win32::System::Threading::{OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION, PROCESS_VM_READ};

    use super::{webview_label, webview_processes, MemoryUsage, ProcessMemory};

    /// Every process: (pid, parent pid, file name).
    fn snapshot() -> Vec<(u32, u32, String)> {
        let mut found = Vec::new();
        // SAFETY: a snapshot handle this function opens and closes; the entry carries its own size.
        unsafe {
            let snap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
            if snap == INVALID_HANDLE_VALUE {
                return found;
            }
            let mut entry: PROCESSENTRY32W = std::mem::zeroed();
            entry.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;
            let mut more = Process32FirstW(snap, &mut entry) != 0;
            while more {
                let end = entry.szExeFile.iter().position(|&unit| unit == 0).unwrap_or(entry.szExeFile.len());
                found.push((entry.th32ProcessID, entry.th32ParentProcessID, String::from_utf16_lossy(&entry.szExeFile[..end])));
                more = Process32NextW(snap, &mut entry) != 0;
            }
            CloseHandle(snap);
        }
        found
    }

    /// Task Manager's "Memory": the private working set (Windows 10 1809 and later), else the private bytes.
    unsafe fn private_bytes(process: HANDLE) -> u64 {
        let mut ex2: PROCESS_MEMORY_COUNTERS_EX2 = std::mem::zeroed();
        ex2.cb = std::mem::size_of::<PROCESS_MEMORY_COUNTERS_EX2>() as u32;
        if GetProcessMemoryInfo(process, &mut ex2 as *mut _ as *mut PROCESS_MEMORY_COUNTERS, ex2.cb) != 0 {
            return ex2.PrivateWorkingSetSize as u64;
        }
        let mut ex: PROCESS_MEMORY_COUNTERS_EX = std::mem::zeroed();
        ex.cb = std::mem::size_of::<PROCESS_MEMORY_COUNTERS_EX>() as u32;
        if GetProcessMemoryInfo(process, &mut ex as *mut _ as *mut PROCESS_MEMORY_COUNTERS, ex.cb) != 0 {
            return ex.PrivateUsage as u64;
        }
        0
    }

    /// The command line of another process, "" when it cannot be read.
    unsafe fn command_line(process: HANDLE) -> String {
        // u64 words keep the UNICODE_STRING at the start aligned.
        let mut buffer: Vec<u64> = vec![0; 512];
        let mut needed = 0u32;
        let mut status = NtQueryInformationProcess(
            process,
            ProcessCommandLineInformation,
            buffer.as_mut_ptr() as *mut c_void,
            (buffer.len() * 8) as u32,
            &mut needed,
        );
        if status == STATUS_INFO_LENGTH_MISMATCH && needed as usize > buffer.len() * 8 {
            buffer = vec![0; (needed as usize).div_ceil(8)];
            status = NtQueryInformationProcess(
                process,
                ProcessCommandLineInformation,
                buffer.as_mut_ptr() as *mut c_void,
                (buffer.len() * 8) as u32,
                &mut needed,
            );
        }
        if status < 0 {
            return String::new();
        }
        let text = &*(buffer.as_ptr() as *const UNICODE_STRING);
        if text.Buffer.is_null() {
            return String::new();
        }
        String::from_utf16_lossy(std::slice::from_raw_parts(text.Buffer, text.Length as usize / 2))
    }

    /// The process's memory and command line; None when it is gone or not ours to read.
    fn measure(pid: u32) -> Option<(u64, String)> {
        // SAFETY: a process handle this function opens and closes.
        unsafe {
            let process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION | PROCESS_VM_READ, 0, pid);
            if process.is_null() {
                return None;
            }
            let measured = (private_bytes(process), command_line(process));
            CloseHandle(process);
            Some(measured)
        }
    }

    pub fn process_parents() -> Vec<(u32, u32)> {
        snapshot().into_iter().map(|(pid, parent_pid, _)| (pid, parent_pid)).collect()
    }

    pub fn process_bytes(pid: u32) -> Option<u64> {
        // SAFETY: a process handle this function opens and closes.
        unsafe {
            let process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
            if process.is_null() {
                return None;
            }
            let bytes = private_bytes(process);
            CloseHandle(process);
            Some(bytes)
        }
    }

    pub fn usage() -> MemoryUsage {
        let own = std::process::id();
        let all = snapshot();
        let own_name = all
            .iter()
            .find(|(pid, _, _)| *pid == own)
            .map(|(_, _, name)| name.clone())
            .unwrap_or_else(|| "nibtree.exe".to_string());
        let mut processes = vec![ProcessMemory {
            pid: own as i32,
            name: own_name,
            label: super::label_for_app(),
            bytes: measure(own).map(|(bytes, _)| bytes).unwrap_or(0),
        }];
        for (pid, name) in webview_processes(own, &all) {
            if let Some((bytes, command_line)) = measure(pid) {
                processes.push(ProcessMemory {
                    pid: pid as i32,
                    name,
                    label: webview_label(&command_line),
                    bytes,
                });
            }
        }
        MemoryUsage {
            total_bytes: processes.iter().map(|process| process.bytes).sum(),
            processes,
            approximate: false,
        }
    }
}

#[cfg(not(any(target_os = "macos", windows)))]
mod platform {
    use super::MemoryUsage;

    pub fn usage() -> MemoryUsage {
        MemoryUsage {
            total_bytes: 0,
            processes: Vec::new(),
            approximate: true,
        }
    }

    pub fn process_parents() -> Vec<(u32, u32)> {
        Vec::new()
    }

    pub fn process_bytes(_pid: u32) -> Option<u64> {
        None
    }
}

pub fn usage() -> MemoryUsage {
    platform::usage()
}

/// Every process as (pid, parent pid), for the terminals' process trees (`terminal_memory.rs`).
pub fn process_parents() -> Vec<(u32, u32)> {
    platform::process_parents()
}

/// One process's memory, counted like the readout; None when it is gone or not ours to read.
pub fn process_bytes(pid: u32) -> Option<u64> {
    platform::process_bytes(pid)
}

/// Clear Cache: the pid of this window's web content process, checked to be ours. Ending it
/// (`end_web_content`) makes Tauri reload the page in a new process, which starts with only what
/// the page needs; a reload in the same process keeps what the old page held.
#[cfg(all(feature = "desktop", target_os = "macos"))]
pub fn web_content_pid(window: &tauri::WebviewWindow) -> crate::error::AppResult<i32> {
    use std::sync::mpsc;
    use std::time::Duration;

    use objc2::msg_send;
    use objc2::runtime::AnyObject;

    use crate::error::AppError;

    let (sender, receiver) = mpsc::channel();
    window
        .with_webview(move |webview| {
            let pointer = webview.inner();
            let pid = if pointer.is_null() {
                0
            } else {
                // SAFETY: tauri hands out the live WKWebView of this window on the main thread;
                // _webProcessIdentifier is a plain getter WebKit has had since macOS 10.12.
                let view = unsafe { &*(pointer as *const AnyObject) };
                let pid: i32 = unsafe { msg_send![view, _webProcessIdentifier] };
                pid
            };
            let _ = sender.send(pid);
        })
        .map_err(|err| AppError::invalid(format!("Could not reach the window: {err}")))?;
    let pid = receiver.recv_timeout(Duration::from_secs(5)).unwrap_or(0);
    if !platform::is_own_web_content(pid) {
        return Err(AppError::invalid("Could not find the window's web content process"));
    }
    Ok(pid)
}

/// Ends a web content process found by `web_content_pid`, a moment later so the command's answer
/// still reaches the page.
#[cfg(target_os = "macos")]
pub fn end_web_content(pid: i32) {
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(150));
        // SAFETY: plain signal to a pid checked above to be our own WebKit web content process.
        unsafe {
            libc::kill(pid, libc::SIGKILL);
        }
    });
}

#[cfg(all(feature = "desktop", not(target_os = "macos")))]
pub fn web_content_pid(_window: &tauri::WebviewWindow) -> crate::error::AppResult<i32> {
    Err(crate::error::AppError::invalid("Clear Cache is only available on macOS for now"))
}

#[cfg(not(target_os = "macos"))]
pub fn end_web_content(_pid: i32) {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names_webview2_processes_by_their_type() {
        let exe = r#""C:\Program Files (x86)\Microsoft\EdgeWebView\Application\140.0\msedgewebview2.exe""#;
        assert_eq!(webview_label(&format!("{exe} --embedded-browser-webview=1 --webview-exe-name=nibtree.exe")), "WebView2 (browser)");
        assert_eq!(webview_label(&format!("{exe} --type=renderer --lang=en-US")), "Web content (UI)");
        assert_eq!(webview_label(&format!("{exe} --type=gpu-process --gpu-preferences=x")), "Graphics");
        assert_eq!(
            webview_label(&format!("{exe} --type=utility --utility-sub-type=network.mojom.NetworkService")),
            "Networking"
        );
        assert_eq!(webview_label(&format!("{exe} --type=utility --utility-sub-type=storage.mojom.StorageService")), "Utility");
        assert_eq!(webview_label(&format!("{exe} --type=crashpad-handler")), "Crash reporter");
        assert_eq!(webview_label(""), "WebView2 (browser)");
    }

    #[test]
    fn finds_only_the_webview2_processes_below_the_app() {
        let process = |pid: u32, parent: u32, name: &str| (pid, parent, name.to_string());
        let all = vec![
            process(100, 1, "explorer.exe"),
            process(200, 100, "nibtree.exe"),
            process(300, 200, "msedgewebview2.exe"),
            process(301, 300, "msedgewebview2.exe"),
            process(302, 300, "MSEdgeWebView2.exe"),
            process(400, 200, "powershell.exe"),
            process(401, 400, "msedgewebview2.exe"),
            process(500, 100, "msedgewebview2.exe"),
            // A reused pid pointing back at a found process must not loop.
            process(300, 301, "msedgewebview2.exe"),
        ];
        let mut found: Vec<u32> = webview_processes(200, &all).into_iter().map(|(pid, _)| pid).collect();
        found.sort();
        assert_eq!(found, vec![300, 301, 302]);
        assert!(webview_processes(999, &all).is_empty());
    }

    #[test]
    fn labels_web_kit_helpers() {
        assert_eq!(label_for("com.apple.WebKit.WebContent", false), "Web content (UI)");
        assert_eq!(label_for("com.apple.WebKit.GPU", false), "Graphics");
        assert_eq!(label_for("com.apple.WebKit.Networking", false), "Networking");
        assert_eq!(label_for("anything", true), "Nibtree (app)");
    }

    #[cfg(any(target_os = "macos", windows))]
    #[test]
    fn measures_the_current_process() {
        let report = usage();
        assert!(!report.processes.is_empty());
        assert_eq!(report.processes[0].pid, std::process::id() as i32);
        assert!(report.processes[0].bytes > 0);
        assert!(report.total_bytes >= report.processes[0].bytes);
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn clear_cache_only_ends_our_web_content_process() {
        // Our own process, launchd and pids that do not exist are never a web content process.
        assert!(!platform::is_own_web_content(std::process::id() as i32));
        assert!(!platform::is_own_web_content(1));
        assert!(!platform::is_own_web_content(0));
        assert!(!platform::is_own_web_content(-1));
    }
}
