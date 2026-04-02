/**
 * Platform detection utilities.
 * プラットフォーム検出ユーティリティ。
 */

/**
 * Tauri デスクトップ環境かどうかを判定する。
 * Whether the current runtime is a Tauri desktop WebView.
 */
export function isTauriDesktop(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}
