import { createClient, Client, InValue } from "@libsql/client/web";
import type { Database as SqlJsDatabase } from "sql.js";
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

// Get a Turso client (for unauthenticated access - throws error if no URL configured)
export function getTursoClient(): Client {
  if (!TURSO_DATABASE_URL) {
    throw new Error("Missing Turso Database URL - user must be signed in");
  }

  return createClient({
    url: TURSO_DATABASE_URL,
  });
}

// ============================================================================
// Local-First Architecture with sql.js
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

// ============================================================================
// sql.js Client Wrapper (compatible with libsql Client interface)
// ============================================================================

interface SqlJsRow {
  [key: string]: unknown;
}

interface SqlJsResult {
  columns: string[];
  values: unknown[][];
}

/**
 * Wrapper around sql.js Database that mimics libsql Client interface
 */
class SqlJsClientWrapper {
  private db: SqlJsDatabase;

  constructor(db: SqlJsDatabase) {
    this.db = db;
  }

  async execute(
    stmtOrSql: string | { sql: string; args?: unknown[] }
  ): Promise<{ rows: SqlJsRow[]; columns: string[] }> {
    const sql = typeof stmtOrSql === "string" ? stmtOrSql : stmtOrSql.sql;
    const args =
      typeof stmtOrSql === "string" ? [] : (stmtOrSql.args ?? []);

    try {
      const stmt = this.db.prepare(sql);
      if (args.length > 0) {
        stmt.bind(args as (string | number | null | Uint8Array)[]);
      }

      const rows: SqlJsRow[] = [];
      const columns: string[] = stmt.getColumnNames();

      while (stmt.step()) {
        const row = stmt.getAsObject() as SqlJsRow;
        rows.push(row);
      }

      stmt.free();
      return { rows, columns };
    } catch (error) {
      // For INSERT/UPDATE/DELETE statements that don't return rows
      if (
        sql.trim().toUpperCase().startsWith("INSERT") ||
        sql.trim().toUpperCase().startsWith("UPDATE") ||
        sql.trim().toUpperCase().startsWith("DELETE") ||
        sql.trim().toUpperCase().startsWith("CREATE") ||
        sql.trim().toUpperCase().startsWith("DROP")
      ) {
        this.db.run(sql, args as (string | number | null | Uint8Array)[]);
        return { rows: [], columns: [] };
      }
      throw error;
    }
  }

  /**
   * Export the database to a Uint8Array for persistence
   */
  export(): Uint8Array {
    return this.db.export();
  }

  /**
   * Close the database
   */
  close(): void {
    this.db.close();
  }
}

// Local sql.js client
let localSqlJsClient: SqlJsClientWrapper | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sqlJs: any = null;
let isLocalDbInitialized = false;
let currentUserId: string | null = null;

/**
 * Initialize sql.js (load WASM) using dynamic import
 */
async function initializeSqlJs(): Promise<{ Database: new (data?: ArrayLike<number> | Buffer | null) => SqlJsDatabase }> {
  if (sqlJs) return sqlJs;

  // Dynamic import to avoid issues with static analysis
  const initSqlJs = (await import("sql.js")).default;
  
  sqlJs = await initSqlJs({
    // Load WASM from CDN for reliability
    locateFile: (file: string) =>
      `https://sql.js.org/dist/${file}`,
  });

  return sqlJs;
}

/**
 * Get or create local sql.js database
 * This is the primary database for all read/write operations
 */
export async function getLocalClient(userId: string): Promise<SqlJsClientWrapper> {
  // Return existing client if already initialized for this user
  if (localSqlJsClient && isLocalDbInitialized && currentUserId === userId) {
    return localSqlJsClient;
  }

  // Reset if user changed
  if (currentUserId !== userId) {
    if (localSqlJsClient) {
      localSqlJsClient.close();
    }
    localSqlJsClient = null;
    isLocalDbInitialized = false;
  }

  try {
    const SQL = await initializeSqlJs();

    // Try to restore from IndexedDB
    const dbKey = `${LOCAL_DB_KEY}-${userId}`;
    const savedData = await get<Uint8Array>(dbKey);

    let db: SqlJsDatabase;
    if (savedData) {
      try {
        db = new SQL.Database(savedData);
        console.log("[LocalDB] Restored from IndexedDB");
      } catch (error) {
        console.error("[LocalDB] Failed to restore from IndexedDB:", error);
        db = new SQL.Database();
        initializeSchema(db);
      }
    } else {
      db = new SQL.Database();
      initializeSchema(db);
    }

    localSqlJsClient = new SqlJsClientWrapper(db);
    isLocalDbInitialized = true;
    currentUserId = userId;

    // Restore last sync time
    const savedSyncTime = await get<number>(`${LAST_SYNC_KEY}-${userId}`);
    if (savedSyncTime) {
      lastSyncTime = savedSyncTime;
    }

    return localSqlJsClient;
  } catch (error) {
    console.error("[LocalDB] Failed to create sql.js client:", error);
    throw error;
  }
}

/**
 * Initialize database schema
 */
function initializeSchema(db: SqlJsDatabase): void {
  const statements = SCHEMA_SQL.split(";").filter((s) => s.trim());
  for (const stmt of statements) {
    db.run(stmt);
  }
  console.log("[LocalDB] Schema initialized");
}

/**
 * Save local database to IndexedDB
 */
export async function saveLocalDatabase(): Promise<void> {
  if (!localSqlJsClient || !currentUserId) return;

  try {
    const data = localSqlJsClient.export();
    await set(`${LOCAL_DB_KEY}-${currentUserId}`, data);
    console.log("[LocalDB] Saved to IndexedDB");
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
          ] as InValue[],
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
  local: SqlJsClientWrapper,
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
        args: [row.source_id, row.target_id, row.created_at] as InValue[],
      });
    }
  }
}

/**
 * Sync ghost links between local and remote (Delta)
 * Only syncs ghost links for pages that have been updated since lastSyncTime
 */
async function syncGhostLinksDelta(
  local: SqlJsClientWrapper,
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
        args: [row.link_text, row.source_page_id, row.created_at] as InValue[],
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
  return localSqlJsClient !== null && isLocalDbInitialized;
}

/**
 * Close local database
 */
export function closeLocalClient(): void {
  if (localSqlJsClient) {
    localSqlJsClient.close();
  }
  localSqlJsClient = null;
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
// Type exports for compatibility with existing code
// ============================================================================

// Export the wrapper type as the local client type
export type LocalClient = SqlJsClientWrapper;
