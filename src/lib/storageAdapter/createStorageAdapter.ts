/**
 * Factory for StorageAdapter (§6.4 zedi-rearchitecture-spec.md).
 * Web: IndexedDBStorageAdapter. Tauri: TauriStorageAdapter (Phase D).
 */

import type { StorageAdapter } from "./StorageAdapter";
import { IndexedDBStorageAdapter } from "./IndexedDBStorageAdapter";

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/**
 *
 */
export function createStorageAdapter(): StorageAdapter {
  if (isTauri()) {
    // TODO(D2): TauriStorageAdapter 実装後に切り替え (#50)
    // Tauri 環境でも暫定的に IndexedDB を使用する
    // Replace with TauriStorageAdapter once #50 is implemented
    console.warn(
      "[StorageAdapter] Tauri detected but TauriStorageAdapter not yet available. Falling back to IndexedDB.",
    );
  }
  return new IndexedDBStorageAdapter();
}
