/**
 * Factory for StorageAdapter (§6.4 zedi-rearchitecture-spec.md).
 * Zedi is a web app, so the adapter is always IndexedDB.
 */

import type { StorageAdapter } from "./StorageAdapter";
import { IndexedDBStorageAdapter } from "./IndexedDBStorageAdapter";

/**
 * StorageAdapter を返す（Web アプリのため常に IndexedDB）。
 * Returns the StorageAdapter (always IndexedDB, since Zedi is a web app).
 */
export function createStorageAdapter(): StorageAdapter {
  return new IndexedDBStorageAdapter();
}
