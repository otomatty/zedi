/**
 * Opens a native folder picker and returns the selected path (desktop only).
 * ネイティブのフォルダ選択を開き、選ばれたパスを返す（デスクトップのみ）。
 */

import { open } from "@tauri-apps/plugin-dialog";
import { isTauriDesktop } from "@/lib/platform";

/**
 * Shows directory picker; returns canonical path string or null if cancelled.
 * ディレクトリピッカーを表示し、正規化パスまたはキャンセル時 null。
 */
export async function pickNoteWorkspaceDirectory(): Promise<string | null> {
  if (!isTauriDesktop()) return null;
  try {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Select project folder",
    });
    if (selected === null) return null;
    const path = Array.isArray(selected) ? selected[0] : selected;
    return typeof path === "string" && path.length > 0 ? path : null;
  } catch {
    return null;
  }
}
