//! What the MCP server needs from the running app, behind a trait so tests run without a window.

use serde_json::Value;
#[cfg(feature = "desktop")]
use tauri::{AppHandle, Emitter, EventTarget, Manager};

pub trait Host: Send + Sync {
    /// To every window.
    fn emit(&self, event: &str, payload: Value);
    /// To one window only (a UI tool call is answered by the window it acts on).
    fn emit_to(&self, window_label: &str, event: &str, payload: Value) {
        let _ = window_label;
        self.emit(event, payload);
    }
    /// A window exists that can answer UI tool calls.
    fn window_ready(&self) -> bool;
    /// The first window as PNG bytes.
    fn screenshot_png(&self) -> Result<Vec<u8>, String>;
    /// One window as PNG bytes.
    fn screenshot_window_png(&self, window_label: &str) -> Result<Vec<u8>, String> {
        let _ = window_label;
        self.screenshot_png()
    }
}

#[cfg(feature = "desktop")]
pub struct TauriHost {
    app: AppHandle,
}

#[cfg(feature = "desktop")]
impl TauriHost {
    pub fn new(app: AppHandle) -> TauriHost {
        TauriHost { app }
    }
}

#[cfg(feature = "desktop")]
impl Host for TauriHost {
    fn emit(&self, event: &str, payload: Value) {
        let _ = self.app.emit(event, payload);
    }

    fn emit_to(&self, window_label: &str, event: &str, payload: Value) {
        let _ = self.app.emit_to(EventTarget::webview_window(window_label), event, payload);
    }

    fn window_ready(&self) -> bool {
        !self.app.webview_windows().is_empty()
    }

    fn screenshot_png(&self) -> Result<Vec<u8>, String> {
        screenshot::capture(&self.app, None)
    }

    fn screenshot_window_png(&self, window_label: &str) -> Result<Vec<u8>, String> {
        screenshot::capture(&self.app, Some(window_label))
    }
}

/// The window to capture: the one asked for, else the main one, else any.
#[cfg(all(feature = "desktop", any(target_os = "macos", windows)))]
fn screenshot_window(app: &tauri::AppHandle, window_label: Option<&str>) -> Result<tauri::WebviewWindow, String> {
    use tauri::Manager;
    window_label
        .and_then(|label| app.get_webview_window(label))
        .or_else(|| app.get_webview_window(crate::windows::MAIN_LABEL))
        .or_else(|| app.webview_windows().into_values().next())
        .ok_or_else(|| "The app window is not ready".to_string())
}

#[cfg(all(feature = "desktop", target_os = "macos"))]
mod screenshot {
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::sync::mpsc;
    use std::time::Duration;

    use objc2::msg_send;
    use objc2::runtime::AnyObject;
    use tauri::AppHandle;

    /// The CGWindowID of a window (else the main one), read on the main thread as AppKit requires.
    fn window_number(app: &AppHandle, window_label: Option<&str>) -> Result<isize, String> {
        let window = super::screenshot_window(app, window_label)?;
        let (sender, receiver) = mpsc::channel();
        app.run_on_main_thread(move || {
            let number = window.ns_window().ok().filter(|pointer| !pointer.is_null()).map(|pointer| {
                // SAFETY: tauri hands out the live NSWindow of this window; windowNumber is a plain getter.
                let ns_window = unsafe { &*(pointer as *const AnyObject) };
                let number: isize = unsafe { msg_send![ns_window, windowNumber] };
                number
            });
            let _ = sender.send(number);
        })
        .map_err(|err| err.to_string())?;
        receiver
            .recv_timeout(Duration::from_secs(5))
            .ok()
            .flatten()
            .filter(|number| *number > 0)
            .ok_or_else(|| "Could not find the app window".to_string())
    }

    pub fn capture(app: &AppHandle, window_label: Option<&str>) -> Result<Vec<u8>, String> {
        static NEXT: AtomicU64 = AtomicU64::new(1);
        let number = window_number(app, window_label)?;
        let file = std::env::temp_dir().join(format!(
            "nibtree-screenshot-{}-{}.png",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        // -x: no sound, -o: no window shadow, -l: just this window, even when covered.
        let output = std::process::Command::new("/usr/sbin/screencapture")
            .args(["-x", "-o", "-l", &number.to_string()])
            .arg(&file)
            .output()
            .map_err(|err| format!("Could not run screencapture: {err}"))?;
        let bytes = std::fs::read(&file);
        let _ = std::fs::remove_file(&file);
        match bytes {
            Ok(bytes) if output.status.success() && !bytes.is_empty() => Ok(bytes),
            _ => {
                let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
                let reason = if stderr.is_empty() { "no image was made".to_string() } else { stderr };
                Err(format!(
                    "The screenshot failed ({reason}). Allow Nibtree in System Settings > Privacy & Security > Screen Recording."
                ))
            }
        }
    }
}

/// Windows: PrintWindow with PW_RENDERFULLCONTENT draws the window into a bitmap, WebView2 content
/// included and even when other windows cover it. The picture is cropped to the frame DWM shows,
/// which leaves out the invisible resize borders.
#[cfg(all(feature = "desktop", windows))]
mod screenshot {
    use std::ffi::c_void;

    use tauri::AppHandle;
    use windows_sys::Win32::Foundation::{HWND, RECT};
    use windows_sys::Win32::Graphics::Dwm::{DwmGetWindowAttribute, DWMWA_EXTENDED_FRAME_BOUNDS};
    use windows_sys::Win32::Graphics::Gdi::{
        CreateCompatibleDC, CreateDIBSection, DeleteDC, DeleteObject, GdiFlush, GetDC, ReleaseDC, SelectObject, BITMAPINFO,
        BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS,
    };
    use windows_sys::Win32::Storage::Xps::PrintWindow;
    use windows_sys::Win32::UI::WindowsAndMessaging::{GetWindowRect, IsIconic};

    /// Draws DirectComposition content (WebView2) too; windows-sys has no name for it.
    const PW_RENDERFULLCONTENT: u32 = 2;

    pub fn capture(app: &AppHandle, window_label: Option<&str>) -> Result<Vec<u8>, String> {
        let window = super::screenshot_window(app, window_label)?;
        let hwnd = window.hwnd().map_err(|err| format!("Could not find the app window: {err}"))?.0 as HWND;
        // SAFETY: Win32 calls on the app's own live window; every handle made here is released below.
        let (width, height, pixels) = unsafe { draw(hwnd)? };
        let rgba = to_rgba(&pixels);
        crate::png_encode::encode_rgba(width, height, &rgba).map_err(|err| format!("Could not encode the screenshot: {err}"))
    }

    /// The window's pixels as BGRA rows from the top, cropped to its visible frame.
    unsafe fn draw(hwnd: HWND) -> Result<(u32, u32, Vec<u8>), String> {
        if IsIconic(hwnd) != 0 {
            return Err("The app window is minimized; restore it first".to_string());
        }
        let mut outer: RECT = std::mem::zeroed();
        if GetWindowRect(hwnd, &mut outer) == 0 {
            return Err("Could not read the window size".to_string());
        }
        let mut frame: RECT = std::mem::zeroed();
        let framed = DwmGetWindowAttribute(
            hwnd,
            DWMWA_EXTENDED_FRAME_BOUNDS as u32,
            &mut frame as *mut RECT as *mut c_void,
            std::mem::size_of::<RECT>() as u32,
        ) == 0;
        if !framed {
            frame = outer;
        }
        let (full_width, full_height) = (outer.right - outer.left, outer.bottom - outer.top);
        if full_width <= 0 || full_height <= 0 {
            return Err("The app window has no size".to_string());
        }

        let screen = GetDC(std::ptr::null_mut());
        let memory = CreateCompatibleDC(screen);
        let mut info: BITMAPINFO = std::mem::zeroed();
        info.bmiHeader.biSize = std::mem::size_of::<BITMAPINFOHEADER>() as u32;
        info.bmiHeader.biWidth = full_width;
        // Negative: rows from the top.
        info.bmiHeader.biHeight = -full_height;
        info.bmiHeader.biPlanes = 1;
        info.bmiHeader.biBitCount = 32;
        info.bmiHeader.biCompression = BI_RGB;
        let mut bits: *mut c_void = std::ptr::null_mut();
        let bitmap = CreateDIBSection(memory, &info, DIB_RGB_COLORS, &mut bits, std::ptr::null_mut(), 0);
        let mut result = Err("Could not make a bitmap for the screenshot".to_string());
        if !bitmap.is_null() && !bits.is_null() {
            let previous = SelectObject(memory, bitmap);
            if PrintWindow(hwnd, memory, PW_RENDERFULLCONTENT) != 0 {
                GdiFlush();
                let all = std::slice::from_raw_parts(bits as *const u8, full_width as usize * full_height as usize * 4);
                result = Ok(crop(all, full_width, full_height, frame_inside(&outer, &frame)));
            } else {
                result = Err("Windows could not draw the app window".to_string());
            }
            SelectObject(memory, previous);
            DeleteObject(bitmap);
        }
        DeleteDC(memory);
        ReleaseDC(std::ptr::null_mut(), screen);
        result
    }

    /// The frame as (left, top, width, height) inside the window rectangle; the whole window when it does not fit.
    fn frame_inside(outer: &RECT, frame: &RECT) -> (i32, i32, i32, i32) {
        let (left, top) = (frame.left - outer.left, frame.top - outer.top);
        let (width, height) = (frame.right - frame.left, frame.bottom - frame.top);
        let (full_width, full_height) = (outer.right - outer.left, outer.bottom - outer.top);
        if left < 0 || top < 0 || width <= 0 || height <= 0 || left + width > full_width || top + height > full_height {
            return (0, 0, full_width, full_height);
        }
        (left, top, width, height)
    }

    fn crop(all: &[u8], full_width: i32, _full_height: i32, (left, top, width, height): (i32, i32, i32, i32)) -> (u32, u32, Vec<u8>) {
        let stride = full_width as usize * 4;
        let mut pixels = Vec::with_capacity(width as usize * height as usize * 4);
        for row in top as usize..(top + height) as usize {
            let start = row * stride + left as usize * 4;
            pixels.extend_from_slice(&all[start..start + width as usize * 4]);
        }
        (width as u32, height as u32, pixels)
    }

    /// GDI's BGRA with an alpha that is often 0, as opaque RGBA.
    fn to_rgba(bgra: &[u8]) -> Vec<u8> {
        let mut rgba = Vec::with_capacity(bgra.len());
        for [blue, green, red, _] in bgra.as_chunks::<4>().0 {
            rgba.extend_from_slice(&[*red, *green, *blue, 255]);
        }
        rgba
    }
}

#[cfg(all(feature = "desktop", not(any(target_os = "macos", windows))))]
mod screenshot {
    use tauri::AppHandle;

    pub fn capture(_app: &AppHandle, _window_label: Option<&str>) -> Result<Vec<u8>, String> {
        Err("Screenshots are not supported on this platform yet".to_string())
    }
}

