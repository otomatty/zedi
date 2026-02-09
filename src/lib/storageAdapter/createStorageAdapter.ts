/**
 * Factory for StorageAdapter (§6.4 zedi-rearchitecture-spec.md).
 * Web: IndexedDBStorageAdapter. Tauri: TauriStorageAdapter (Phase D).
 */

import type { StorageAdapter } from "./StorageAdapter";
import { IndexedDBStorageAdapter } from "./IndexedDBStorageAdapter";

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function createStorageAdapter(): StorageAdapter {
  if (isTauri()) {
    // Phase D: TauriStorageAdapter
    throw new Error("TauriStorageAdapter is not implemented yet (Phase D).");
  }
  return new IndexedDBStorageAdapter();
}
