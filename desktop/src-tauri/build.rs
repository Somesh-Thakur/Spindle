fn main() {
    // The site may call only these commands (see capabilities/site.json).
    tauri_build::try_build(
        tauri_build::Attributes::new().app_manifest(tauri_build::AppManifest::new().commands(&["now_playing", "open_url", "check_update", "install_update", "toggle_mini", "show_main"])),
    )
    .expect("failed to run the Tauri build script");
}
