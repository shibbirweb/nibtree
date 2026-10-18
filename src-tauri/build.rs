fn main() {
    // Only the desktop app is a Tauri app (see the `desktop` feature in Cargo.toml).
    #[cfg(feature = "desktop")]
    tauri_build::build()
}
