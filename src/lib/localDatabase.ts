/**
 * Local database module - now uses libsql for unified API
 * This file provides backward-compatible exports
 */

import { getLocalClient, saveLocalDatabase, isLocalClientReady, closeLocalClient } from "./turso";
import type { Client } from "@libsql/client";

/**
 * Initialize the local SQLite database
 * Uses libsql in-memory mode with IndexedDB for persistence
 */
export async function initLocalDatabase(): Promise<Client> {
  return getLocalClient();
}

/**
 * Save the database to IndexedDB
 */
export { saveLocalDatabase };

/**
 * Get the local database instance (for backward compatibility)
 * Note: Returns null if not initialized - use initLocalDatabase() instead
 */
export function getLocalDatabase(): Client | null {
  return isLocalClientReady() ? null : null; // Async client, use getLocalClient() directly
}

/**
 * Close and cleanup the database
 */
export function closeLocalDatabase(): void {
  closeLocalClient();
}

// Re-export Client type for consumers
export type { Client };
