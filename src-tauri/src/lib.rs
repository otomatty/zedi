/// Tauri アプリケーション共通エントリポイント。
/// デスクトップ (main.rs) とモバイル (mobile entry point) の両方から呼ばれる。
///
/// Common entry point for the Tauri application.
/// Called from both desktop (main.rs) and mobile entry points.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
