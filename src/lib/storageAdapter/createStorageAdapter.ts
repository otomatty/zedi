/**
 * Factory for StorageAdapter (§6.4 zedi-rearchitecture-spec.md).
 * Web: IndexedDBStorageAdapter. Tauri: TauriStorageAdapter (Phase D).
 */

import type { StorageAdapter } from "./StorageAdapter";
import { IndexedDBStorageAdapter } from "./IndexedDBStorageAdapter";

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** フォールバック警告はセッション中1回のみ（再マウントでのログ汚染を防ぐ） */
let tauriIndexedDbFallbackWarned = false;

/**
 * 実行環境に応じた StorageAdapter を返す。
 * Web では IndexedDB。Tauri では #50 まで暫定的に IndexedDB にフォールバックする。
 *
 * Returns a StorageAdapter for the current runtime.
 * Uses IndexedDB on web; in Tauri, falls back to IndexedDB until TauriStorageAdapter (#50) lands.
 */
export function createStorageAdapter(): StorageAdapter {
  if (isTauri()) {
    // TODO(D2): TauriStorageAdapter 実装後に切り替え (#50)
    if (!tauriIndexedDbFallbackWarned) {
      tauriIndexedDbFallbackWarned = true;
      console.warn(
        "[StorageAdapter] Tauri detected but TauriStorageAdapter not yet available. Falling back to IndexedDB.",
      );
    }
  }
  return new IndexedDBStorageAdapter();
}
