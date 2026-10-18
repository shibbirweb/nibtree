//! On Windows (MSVC), links the C runtime the way the desktop app does (tauri-build's static_vcruntime): the
//! Visual C++ runtime statically and the UCRT from Windows, so no Visual C++ redistributable is needed.
//!
//! It has to, too: whenever the app crate is built with its `desktop` feature (any workspace build), tauri-build
//! puts an empty msvcrt.lib on the library path of everything that links the app crate, but passes its own link
//! arguments to the app's programs only. Without these, the C runtime's symbols (memcpy, malloc...) go missing.
fn main() {
    if std::env::var("CARGO_CFG_TARGET_ENV").as_deref() != Ok("msvc") {
        return;
    }
    let left_out = [
        "libvcruntimed.lib",
        "vcruntime.lib",
        "vcruntimed.lib",
        "libcmtd.lib",
        "msvcrt.lib",
        "msvcrtd.lib",
        "libucrt.lib",
        "libucrtd.lib",
    ];
    for library in left_out {
        println!("cargo:rustc-link-arg=/NODEFAULTLIB:{library}");
    }
    for library in ["libcmt.lib", "libvcruntime.lib", "ucrt.lib"] {
        println!("cargo:rustc-link-arg=/DEFAULTLIB:{library}");
    }
}
