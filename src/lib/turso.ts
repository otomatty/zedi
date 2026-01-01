import { createClient, Client } from "@libsql/client/web";
import { createClient as createWasmClient } from "@libsql/client-wasm";
import { get, set } from "idb-keyval";

// Turso database configuration
const TURSO_DATABASE_URL = import.meta.env.VITE_TURSO_DATABASE_URL;

// Local database configuration
const LOCAL_DB_KEY = "zedi-local-db";
const LAST_SYNC_KEY = "zedi-last-sync";

// Note: Sync is triggered on page load and manual sync only (no background interval)

// Schema for database initialization
const SCHEMA_SQL = `
  -- 1. ページ（情報の最小単位）
  CREATE TABLE IF NOT EXISTS pages (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT,
    content TEXT,
    thumbnail_url TEXT,
    source_url TEXT,
    vector_embedding BLOB,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    is_deleted INTEGER DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_pages_title ON pages(title);
  CREATE INDEX IF NOT EXISTS idx_pages_created_at ON pages(created_at);
  CREATE INDEX IF NOT EXISTS idx_pages_user_id ON pages(user_id);
  CREATE INDEX IF NOT EXISTS idx_pages_user_created ON pages(user_id, created_at DESC);

  -- 2. リンク関係（グラフ構造）
  CREATE TABLE IF NOT EXISTS links (
    source_id TEXT NOT NULL,
    target_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (source_id, target_id)
  );

  CREATE INDEX IF NOT EXISTS idx_links_source ON links(source_id);
  CREATE INDEX IF NOT EXISTS idx_links_target ON links(target_id);

  -- 3. Ghost Links（未作成リンクのトラッキング）
  CREATE TABLE IF NOT EXISTS ghost_links (
    link_text TEXT NOT NULL,
    source_page_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (link_text, source_page_id)
  );

  CREATE INDEX IF NOT EXISTS idx_ghost_links_text ON ghost_links(link_text);
`;

// Create an authenticated Turso client using Clerk JWT (for remote sync only)
export function createAuthenticatedTursoClient(jwtToken: string): Client {
  if (!TURSO_DATABASE_URL) {
    throw new Error("Missing Turso Database URL");
  }

  return createClient({
    url: TURSO_DATABASE_URL,
    authToken: jwtToken,
  });
}

// ============================================================================
// Local-First Architecture with WASM Client
// ============================================================================

/**
 * Sync status for UI display
 */
export type SyncStatus = "idle" | "syncing" | "synced" | "error" | "offline";

let currentSyncStatus: SyncStatus = "idle";
let syncStatusListeners: Array<(status: SyncStatus) => void> = [];
let lastSyncTime: number | null = null;
let isSyncing = false;

export function getSyncStatus(): SyncStatus {
  return currentSyncStatus;
}

export function subscribeSyncStatus(
  listener: (status: SyncStatus) => void
): () => void {
  syncStatusListeners.push(listener);
  return () => {
    syncStatusListeners = syncStatusListeners.filter((l) => l !== listener);
  };
}

function setSyncStatus(status: SyncStatus): void {
  currentSyncStatus = status;
  syncStatusListeners.forEach((listener) => listener(status));
}

export function getLastSyncTime(): number | null {
  return lastSyncTime;
}

// Local WASM client (works in browser with in-memory + IndexedDB persistence)
let localWasmClient: Client | null = null;
let isLocalDbInitialized = false;
let currentUserId: string | null = null;

/**
 * Get or create local WASM database
 * This is the primary database for all read/write operations
 */
export async function getLocalClient(userId: string): Promise<Client> {
  // Return existing client if already initialized for this user
  if (localWasmClient && isLocalDbInitialized && currentUserId === userId) {
    return localWasmClient;
  }

  // Reset if user changed
  if (currentUserId !== userId) {
    localWasmClient = null;
    isLocalDbInitialized = false;
  }

  try {
    // Create WASM client (in-memory, browser-compatible)
    localWasmClient = createWasmClient({
      url: ":memory:",
    });

    // Try to restore from IndexedDB
    const dbKey = `${LOCAL_DB_KEY}-${userId}`;
    const savedData = await get<string>(dbKey);

    if (savedData) {
      try {
        const statements = parseSqlDump(savedData);
        for (const stmt of statements) {
          if (stmt.trim()) {
            await localWasmClient.execute(stmt);
          }
        }
        console.log("[LocalDB] Restored from IndexedDB");
      } catch (error) {
        console.error("[LocalDB] Failed to restore from IndexedDB:", error);
        await initializeSchema(localWasmClient);
      }
    } else {
      await initializeSchema(localWasmClient);
    }

    isLocalDbInitialized = true;
    currentUserId = userId;

    // Restore last sync time
    const savedSyncTime = await get<number>(`${LAST_SYNC_KEY}-${userId}`);
    if (savedSyncTime) {
      lastSyncTime = savedSyncTime;
    }

    return localWasmClient;
  } catch (error) {
    console.error("[LocalDB] Failed to create WASM client:", error);
    throw error;
  }
}

/**
 * Initialize database schema
 */
async function initializeSchema(client: Client): Promise<void> {
  const statements = SCHEMA_SQL.split(";").filter((s) => s.trim());
  for (const stmt of statements) {
    await client.execute(stmt);
  }
  console.log("[LocalDB] Schema initialized");
}

/**
 * Save local database to IndexedDB
 */
export async function saveLocalDatabase(): Promise<void> {
  if (!localWasmClient || !currentUserId) return;

  try {
    const dump = await createSqlDump(localWasmClient);
    await set(`${LOCAL_DB_KEY}-${currentUserId}`, dump);
  } catch (error) {
    console.error("[LocalDB] Failed to save to IndexedDB:", error);
  }
}

/**
 * Sync local database with remote Turso (Delta Sync)
 * - Only fetches/pushes changes since lastSyncTime
 * - Reduces Rows Read significantly
 */
export async function syncWithRemote(
  jwtToken: string,
  userId: string
): Promise<void> {
  if (isSyncing) return;

  try {
    isSyncing = true;
    setSyncStatus("syncing");

    const local = await getLocalClient(userId);
    const remote = createAuthenticatedTursoClient(jwtToken);

    // Get sync timestamp (use 0 for initial sync to get all data)
    const syncSince = lastSyncTime ?? 0;
    const isInitialSync = syncSince === 0;

    console.log(
      `[Sync] Starting ${isInitialSync ? "initial" : "delta"} sync (since: ${new Date(syncSince).toISOString()})`
    );

    // --- PULL: Fetch changes from remote since lastSyncTime ---
    const remoteChanges = await remote.execute({
      sql: `SELECT * FROM pages WHERE user_id = ? AND updated_at > ?`,
      args: [userId, syncSince],
    });

    console.log(`[Sync] Pulled ${remoteChanges.rows.length} changes from remote`);

    // Get local pages for comparison
    const localPages = await local.execute({
      sql: `SELECT id, updated_at FROM pages WHERE user_id = ?`,
      args: [userId],
    });
    const localPageMap = new Map(
      localPages.rows.map((r) => [r.id as string, r.updated_at as number])
    );

    // Merge remote changes into local (remote wins if newer)
    let pulledCount = 0;
    for (const row of remoteChanges.rows) {
      const localUpdatedAt = localPageMap.get(row.id as string);
      const remoteUpdatedAt = row.updated_at as number;

      if (!localUpdatedAt || remoteUpdatedAt > localUpdatedAt) {
        await local.execute({
          sql: `INSERT OR REPLACE INTO pages 
                (id, user_id, title, content, thumbnail_url, source_url, vector_embedding, created_at, updated_at, is_deleted)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            row.id,
            row.user_id,
            row.title,
            row.content,
            row.thumbnail_url,
            row.source_url,
            row.vector_embedding,
            row.created_at,
            row.updated_at,
            row.is_deleted,
          ],
        });
        pulledCount++;
      }
    }

    // --- PUSH: Send local changes since lastSyncTime to remote ---
    const localChanges = await local.execute({
      sql: `SELECT * FROM pages WHERE user_id = ? AND updated_at > ?`,
      args: [userId, syncSince],
    });

    console.log(`[Sync] Pushing ${localChanges.rows.length} local changes to remote`);

    // Get remote page updated_at for comparison
    const remotePageIds = await remote.execute({
      sql: `SELECT id, updated_at FROM pages WHERE user_id = ?`,
      args: [userId],
    });
    const remotePageMap = new Map(
      remotePageIds.rows.map((r) => [r.id as string, r.updated_at as number])
    );

    let pushedCount = 0;
    for (const p of localChanges.rows) {
      const remoteUpdatedAt = remotePageMap.get(p.id as string);
      const localUpdatedAt = p.updated_at as number;

      // Push if local is newer or doesn't exist in remote
      if (!remoteUpdatedAt || localUpdatedAt > remoteUpdatedAt) {
        await remote.execute({
          sql: `INSERT OR REPLACE INTO pages 
                (id, user_id, title, content, thumbnail_url, source_url, vector_embedding, created_at, updated_at, is_deleted)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            p.id,
            p.user_id,
            p.title,
            p.content,
            p.thumbnail_url,
            p.source_url,
            p.vector_embedding,
            p.created_at,
            p.updated_at,
            p.is_deleted,
          ],
        });
        pushedCount++;
      }
    }

    // Sync links (delta)
    await syncLinksDelta(local, remote, userId, syncSince);

    // Sync ghost links (delta)
    await syncGhostLinksDelta(local, remote, userId, syncSince);

    // Save to IndexedDB
    await saveLocalDatabase();

    // Update sync time
    lastSyncTime = Date.now();
    await set(`${LAST_SYNC_KEY}-${userId}`, lastSyncTime);

    setSyncStatus("synced");
    console.log(
      `[Sync] Completed: pulled ${pulledCount}, pushed ${pushedCount}`
    );
  } catch (error) {
    console.error("[Sync] Failed:", error);
    setSyncStatus("error");
    throw error;
  } finally {
    isSyncing = false;
  }
}

/**
 * Sync links between local and remote (Delta)
 * Only syncs links for pages that have been updated since lastSyncTime
 */
async function syncLinksDelta(
  local: Client,
  remote: Client,
  userId: string,
  syncSince: number
): Promise<void> {
  // Get page IDs that were updated since syncSince
  const updatedPages = await local.execute({
    sql: `SELECT id FROM pages WHERE user_id = ? AND updated_at > ?`,
    args: [userId, syncSince],
  });
  const updatedIds = updatedPages.rows.map((r) => r.id as string);

  // Also check for remote updated pages
  const remoteUpdatedPages = await remote.execute({
    sql: `SELECT id FROM pages WHERE user_id = ? AND updated_at > ?`,
    args: [userId, syncSince],
  });
  const remoteUpdatedIds = remoteUpdatedPages.rows.map((r) => r.id as string);

  // Combine both sets
  const allUpdatedIds = new Set([...updatedIds, ...remoteUpdatedIds]);
  if (allUpdatedIds.size === 0) return;

  // Pull links for updated pages from remote
  for (const pageId of allUpdatedIds) {
    const remoteLinks = await remote.execute({
      sql: `SELECT * FROM links WHERE source_id = ?`,
      args: [pageId],
    });

    // Replace local links for this page
    await local.execute({
      sql: `DELETE FROM links WHERE source_id = ?`,
      args: [pageId],
    });

    for (const row of remoteLinks.rows) {
      await local.execute({
        sql: `INSERT OR REPLACE INTO links (source_id, target_id, created_at) VALUES (?, ?, ?)`,
        args: [row.source_id, row.target_id, row.created_at],
      });
    }
  }

  // Push local links for updated pages to remote
  for (const pageId of updatedIds) {
    const localLinks = await local.execute({
      sql: `SELECT * FROM links WHERE source_id = ?`,
      args: [pageId],
    });

    for (const row of localLinks.rows) {
      await remote.execute({
        sql: `INSERT OR REPLACE INTO links (source_id, target_id, created_at) VALUES (?, ?, ?)`,
        args: [row.source_id, row.target_id, row.created_at],
      });
    }
  }
}

/**
 * Sync ghost links between local and remote (Delta)
 * Only syncs ghost links for pages that have been updated since lastSyncTime
 */
async function syncGhostLinksDelta(
  local: Client,
  remote: Client,
  userId: string,
  syncSince: number
): Promise<void> {
  // Get page IDs that were updated since syncSince
  const updatedPages = await local.execute({
    sql: `SELECT id FROM pages WHERE user_id = ? AND updated_at > ?`,
    args: [userId, syncSince],
  });
  const updatedIds = updatedPages.rows.map((r) => r.id as string);

  // Also check for remote updated pages
  const remoteUpdatedPages = await remote.execute({
    sql: `SELECT id FROM pages WHERE user_id = ? AND updated_at > ?`,
    args: [userId, syncSince],
  });
  const remoteUpdatedIds = remoteUpdatedPages.rows.map((r) => r.id as string);

  // Combine both sets
  const allUpdatedIds = new Set([...updatedIds, ...remoteUpdatedIds]);
  if (allUpdatedIds.size === 0) return;

  // Pull ghost links for updated pages from remote
  for (const pageId of allUpdatedIds) {
    const remoteGhostLinks = await remote.execute({
      sql: `SELECT * FROM ghost_links WHERE source_page_id = ?`,
      args: [pageId],
    });

    // Replace local ghost links for this page
    await local.execute({
      sql: `DELETE FROM ghost_links WHERE source_page_id = ?`,
      args: [pageId],
    });

    for (const row of remoteGhostLinks.rows) {
      await local.execute({
        sql: `INSERT OR REPLACE INTO ghost_links (link_text, source_page_id, created_at) VALUES (?, ?, ?)`,
        args: [row.link_text, row.source_page_id, row.created_at],
      });
    }
  }

  // Push local ghost links for updated pages to remote
  for (const pageId of updatedIds) {
    const localGhostLinks = await local.execute({
      sql: `SELECT * FROM ghost_links WHERE source_page_id = ?`,
      args: [pageId],
    });

    for (const row of localGhostLinks.rows) {
      await remote.execute({
        sql: `INSERT OR REPLACE INTO ghost_links (link_text, source_page_id, created_at) VALUES (?, ?, ?)`,
        args: [row.link_text, row.source_page_id, row.created_at],
      });
    }
  }
}

/**
 * Check if this is the first sync (never synced before)
 */
export function hasNeverSynced(): boolean {
  return lastSyncTime === null;
}

/**
 * Check if local database is ready
 */
export function isLocalClientReady(): boolean {
  return localWasmClient !== null && isLocalDbInitialized;
}

/**
 * Close local database
 */
export function closeLocalClient(): void {
  localWasmClient = null;
  isLocalDbInitialized = false;
  currentUserId = null;
  lastSyncTime = null;
  setSyncStatus("idle");
}

/**
 * Trigger manual sync
 */
export async function triggerSync(
  jwtToken: string,
  userId: string
): Promise<void> {
  await syncWithRemote(jwtToken, userId);
}

// ============================================================================
// SQL Dump Utilities for IndexedDB Persistence
// ============================================================================

/**
 * Create a SQL dump of the database for persistence
 */
async function createSqlDump(client: Client): Promise<string> {
  const statements: string[] = [];

  // Add schema
  statements.push(SCHEMA_SQL);

  // Dump pages table
  const pages = await client.execute("SELECT * FROM pages");
  for (const row of pages.rows) {
    const values = [
      sqlValue(row.id),
      sqlValue(row.user_id),
      sqlValue(row.title),
      sqlValue(row.content),
      sqlValue(row.thumbnail_url),
      sqlValue(row.source_url),
      sqlValue(row.vector_embedding),
      row.created_at,
      row.updated_at,
      row.is_deleted,
    ].join(", ");
    statements.push(
      `INSERT OR REPLACE INTO pages (id, user_id, title, content, thumbnail_url, source_url, vector_embedding, created_at, updated_at, is_deleted) VALUES (${values})`
    );
  }

  // Dump links table
  const links = await client.execute("SELECT * FROM links");
  for (const row of links.rows) {
    statements.push(
      `INSERT OR REPLACE INTO links (source_id, target_id, created_at) VALUES (${sqlValue(row.source_id)}, ${sqlValue(row.target_id)}, ${row.created_at})`
    );
  }

  // Dump ghost_links table
  const ghostLinks = await client.execute("SELECT * FROM ghost_links");
  for (const row of ghostLinks.rows) {
    statements.push(
      `INSERT OR REPLACE INTO ghost_links (link_text, source_page_id, created_at) VALUES (${sqlValue(row.link_text)}, ${sqlValue(row.source_page_id)}, ${row.created_at})`
    );
  }

  return statements.join(";\n");
}

/**
 * Parse SQL dump back into statements
 */
function parseSqlDump(dump: string): string[] {
  return dump.split(";\n").filter((s) => s.trim());
}

/**
 * Escape and quote a value for SQL
 */
function sqlValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "NULL";
  }
  if (typeof value === "number") {
    return String(value);
  }
  if (typeof value === "string") {
    // Escape single quotes
    return `'${value.replace(/'/g, "''")}'`;
  }
  if (value instanceof Uint8Array) {
    // Convert blob to hex
    return `X'${Array.from(value)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")}'`;
  }
  return `'${String(value).replace(/'/g, "''")}'`;
}
