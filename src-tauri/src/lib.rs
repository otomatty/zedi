mod claude_sidecar;
mod workspace_paths;

/// Tauri アプリケーション共通エントリポイント。
/// デスクトップ (main.rs) とモバイル (mobile entry point) の両方から呼ばれる。
///
/// Common entry point for the Tauri application.
/// Called from both desktop (main.rs) and mobile entry points.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .manage(claude_sidecar::ClaudeSidecarState::new())
        .invoke_handler(tauri::generate_handler![
            claude_sidecar::claude_query,
            claude_sidecar::claude_abort,
            claude_sidecar::claude_status,
            claude_sidecar::check_claude_installation,
            claude_sidecar::claude_list_models,
            workspace_paths::list_workspace_directory_entries,
            workspace_paths::register_note_workspace_root,
            workspace_paths::clear_note_workspace_root,
            workspace_paths::read_note_workspace_file,
            workspace_paths::list_note_workspace_entries,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
