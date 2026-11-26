fn main() {
    // Only these commands may be called from the webview.
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "send_to_sidecar",
            "start_listening",
            "stop_listening",
        ]),
    ))
    .expect("failed to run tauri-build");
}
