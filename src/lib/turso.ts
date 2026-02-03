import type {
  Client,
  InValue,
  InStatement,
  InArgs,
  ResultSet,
  Row,
  TransactionMode,
  Transaction,
  Replicated,
} from "@libsql/client/web";
import type { Database as SqlJsDatabase } from "sql.js";
import { get, set } from "idb-keyval";
import { getPageListPreview } from "@/lib/contentUtils";

// Turso database configuration
const TURSO_DATABASE_URL = import.meta.env.VITE_TURSO_DATABASE_URL;
// Fallback auth token - used when Clerk JWT authentication fails due to JWKS issues
// This is a temporary workaround until Turso JWKS configuration is fixed
const TURSO_FALLBACK_AUTH_TOKEN = import.meta.env.VITE_TURSO_AUTH_TOKEN;

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
    content_preview TEXT,
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

  -- 4. ノート（公開ノートのコンテナ）
  CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    owner_user_id TEXT NOT NULL,
    title TEXT,
    visibility TEXT NOT NULL DEFAULT 'private',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    is_deleted INTEGER DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_notes_owner_id ON notes(owner_user_id);
  CREATE INDEX IF NOT EXISTS idx_notes_visibility ON notes(visibility);

  -- 5. ノートとページの紐付け
  CREATE TABLE IF NOT EXISTS note_pages (
    note_id TEXT NOT NULL,
    page_id TEXT NOT NULL,
    added_by_user_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    is_deleted INTEGER DEFAULT 0,
    PRIMARY KEY (note_id, page_id)
  );

  CREATE INDEX IF NOT EXISTS idx_note_pages_note_id ON note_pages(note_id);
  CREATE INDEX IF NOT EXISTS idx_note_pages_page_id ON note_pages(page_id);

  -- 6. ノートメンバー（招待）
  CREATE TABLE IF NOT EXISTS note_members (
    note_id TEXT NOT NULL,
    member_email TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'viewer',
    invited_by_user_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    is_deleted INTEGER DEFAULT 0,
    PRIMARY KEY (note_id, member_email)
  );

  CREATE INDEX IF NOT EXISTS idx_note_members_note_id ON note_members(note_id);
  CREATE INDEX IF NOT EXISTS idx_note_members_email ON note_members(member_email);
`;

async function hasColumn(
  client: Client,
  tableName: string,
  columnName: string
): Promise<boolean> {
  const result = await client.execute({
    sql: `PRAGMA table_info(${tableName})`,
  });

  return result.rows.some((row) => row.name === columnName);
}

async function ensureContentPreviewColumn(client: Client): Promise<void> {
  const exists = await hasColumn(client, "pages", "content_preview");
  if (exists) return;

  await client.execute({
    sql: `ALTER TABLE pages ADD COLUMN content_preview TEXT`,
  });

  const pages = await client.execute({
    sql: `SELECT id, content FROM pages`,
  });

  for (const row of pages.rows) {
    const content = (row.content as string) || "";
    const contentPreview = getPageListPreview(content);
    await client.execute({
      sql: `UPDATE pages SET content_preview = ? WHERE id = ?`,
      args: [contentPreview, row.id as string],
    });
  }
}

async function ensureNoteSchema(client: Client): Promise<void> {
  await client.execute({
    sql: `
      CREATE TABLE IF NOT EXISTS notes (
        id TEXT PRIMARY KEY,
        owner_user_id TEXT NOT NULL,
        title TEXT,
        visibility TEXT NOT NULL DEFAULT 'private',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        is_deleted INTEGER DEFAULT 0
      )
    `,
  });

  await client.execute({
    sql: `CREATE INDEX IF NOT EXISTS idx_notes_owner_id ON notes(owner_user_id)`,
  });
  await client.execute({
    sql: `CREATE INDEX IF NOT EXISTS idx_notes_visibility ON notes(visibility)`,
  });

  await client.execute({
    sql: `
      CREATE TABLE IF NOT EXISTS note_pages (
        note_id TEXT NOT NULL,
        page_id TEXT NOT NULL,
        added_by_user_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        is_deleted INTEGER DEFAULT 0,
        PRIMARY KEY (note_id, page_id)
      )
    `,
  });
  await client.execute({
    sql: `CREATE INDEX IF NOT EXISTS idx_note_pages_note_id ON note_pages(note_id)`,
  });
  await client.execute({
    sql: `CREATE INDEX IF NOT EXISTS idx_note_pages_page_id ON note_pages(page_id)`,
  });

  await client.execute({
    sql: `
      CREATE TABLE IF NOT EXISTS note_members (
        note_id TEXT NOT NULL,
        member_email TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'viewer',
        invited_by_user_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        is_deleted INTEGER DEFAULT 0,
        PRIMARY KEY (note_id, member_email)
      )
    `,
  });
  await client.execute({
    sql: `CREATE INDEX IF NOT EXISTS idx_note_members_note_id ON note_members(note_id)`,
  });
  await client.execute({
    sql: `CREATE INDEX IF NOT EXISTS idx_note_members_email ON note_members(member_email)`,
  });
}

// Dynamic import for @libsql/client/web to avoid initialization errors
async function getLibsqlClient() {
  const { createClient } = await import("@libsql/client/web");
  return createClient;
}

// Create an authenticated Turso client using Clerk JWT (for remote sync only)
// Falls back to VITE_TURSO_AUTH_TOKEN if Clerk JWT fails (JWKS workaround)
export async function createAuthenticatedTursoClient(
  jwtToken: string
): Promise<Client> {
  if (!TURSO_DATABASE_URL) {
    throw new Error("Missing Turso Database URL");
  }

  const createClient = await getLibsqlClient();

  // If fallback token is available, use it directly (bypasses Clerk JWT issues)
  if (TURSO_FALLBACK_AUTH_TOKEN) {
    console.log("[Turso] Using fallback auth token (VITE_TURSO_AUTH_TOKEN)");
    return createClient({
      url: TURSO_DATABASE_URL,
      authToken: TURSO_FALLBACK_AUTH_TOKEN,
    });
  }

  // Otherwise, try Clerk JWT
  return createClient({
    url: TURSO_DATABASE_URL,
    authToken: jwtToken,
  });
}

// Get a Turso client (for unauthenticated access - throws error if no URL configured)
export async function getTursoClient(): Promise<Client> {
  if (!TURSO_DATABASE_URL) {
    throw new Error("Missing Turso Database URL - user must be signed in");
  }

  const createClient = await getLibsqlClient();
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
  console.log(`[Sync] Status -> ${status}`);
  syncStatusListeners.forEach((listener) => listener(status));
}

export function getLastSyncTime(): number | null {
  return lastSyncTime;
}

// ============================================================================
// sql.js Client Wrapper (compatible with libsql Client interface)
// ============================================================================

/**
 * Create a Row object that satisfies the @libsql/client Row interface
 */
function createRow(obj: Record<string, unknown>, columns: string[]): Row {
  const row = Object.create(null) as Row;

  // Set length property
  Object.defineProperty(row, "length", {
    value: columns.length,
    writable: false,
    enumerable: false,
  });

  // Add indexed access and named access
  columns.forEach((col, index) => {
    const value = obj[col] as Row[number];
    row[index] = value;
    row[col] = value;
  });

  return row;
}

/**
 * Create a ResultSet object that satisfies the @libsql/client ResultSet interface
 */
function createResultSet(
  rows: Row[],
  columns: string[],
  rowsAffected: number = 0,
  lastInsertRowid?: bigint
): ResultSet {
  return {
    columns,
    columnTypes: columns.map(() => ""), // sql.js doesn't provide column types
    rows,
    rowsAffected,
    lastInsertRowid,
    toJSON() {
      return {
        columns: this.columns,
        columnTypes: this.columnTypes,
        rows: this.rows,
        rowsAffected: this.rowsAffected,
        lastInsertRowid: this.lastInsertRowid?.toString(),
      };
    },
  };
}

/**
 * Wrapper around sql.js Database that implements the @libsql/client Client interface
 */
class SqlJsClientWrapper implements Client {
  private db: SqlJsDatabase;
  private _closed: boolean = false;

  constructor(db: SqlJsDatabase) {
    this.db = db;
  }

  get closed(): boolean {
    return this._closed;
  }

  get protocol(): string {
    return "file";
  }

  async execute(stmtOrSql: InStatement): Promise<ResultSet>;
  async execute(sql: string, args?: InArgs): Promise<ResultSet>;
  async execute(
    stmtOrSql: InStatement | string,
    args?: InArgs
  ): Promise<ResultSet> {
    const sql = typeof stmtOrSql === "string" ? stmtOrSql : stmtOrSql.sql;
    const stmtArgs =
      typeof stmtOrSql === "string"
        ? args
        : (stmtOrSql as { sql: string; args?: InArgs }).args;

    // Convert args to array format
    const argsArray: (string | number | null | Uint8Array)[] = [];
    if (stmtArgs) {
      if (Array.isArray(stmtArgs)) {
        for (const arg of stmtArgs) {
          argsArray.push(this.convertArg(arg));
        }
      } else {
        // Named parameters - need to extract in order they appear in SQL
        const paramNames = sql.match(/[?$:@][a-zA-Z0-9_]+/g) || [];
        for (const param of paramNames) {
          const key = param.slice(1); // Remove prefix
          const value = (stmtArgs as Record<string, InValue>)[key];
          argsArray.push(this.convertArg(value));
        }
      }
    }

    try {
      const stmt = this.db.prepare(sql);
      if (argsArray.length > 0) {
        stmt.bind(argsArray);
      }

      const rows: Row[] = [];
      const columns: string[] = stmt.getColumnNames();

      while (stmt.step()) {
        const obj = stmt.getAsObject() as Record<string, unknown>;
        rows.push(createRow(obj, columns));
      }

      stmt.free();
      return createResultSet(rows, columns);
    } catch (error) {
      // For INSERT/UPDATE/DELETE statements that don't return rows
      const upperSql = sql.trim().toUpperCase();
      if (
        upperSql.startsWith("INSERT") ||
        upperSql.startsWith("UPDATE") ||
        upperSql.startsWith("DELETE") ||
        upperSql.startsWith("CREATE") ||
        upperSql.startsWith("DROP")
      ) {
        this.db.run(sql, argsArray);
        return createResultSet([], []);
      }
      throw error;
    }
  }

  private convertArg(
    arg: InValue | undefined
  ): string | number | null | Uint8Array {
    if (arg === undefined || arg === null) return null;
    if (typeof arg === "boolean") return arg ? 1 : 0;
    if (arg instanceof Date) return arg.getTime();
    if (arg instanceof Uint8Array) return arg;
    if (arg instanceof ArrayBuffer) return new Uint8Array(arg);
    if (typeof arg === "bigint") return Number(arg);
    return arg as string | number;
  }

  async batch(
    stmts: Array<InStatement | [string, InArgs?]>,
    _mode?: TransactionMode
  ): Promise<Array<ResultSet>> {
    const results: ResultSet[] = [];
    for (const stmt of stmts) {
      if (Array.isArray(stmt)) {
        results.push(await this.execute(stmt[0], stmt[1]));
      } else {
        results.push(await this.execute(stmt));
      }
    }
    return results;
  }

  async migrate(stmts: Array<InStatement>): Promise<Array<ResultSet>> {
    // Execute PRAGMA foreign_keys=off before and on after
    await this.execute("PRAGMA foreign_keys=OFF");
    try {
      const results = await this.batch(stmts);
      await this.execute("PRAGMA foreign_keys=ON");
      return results;
    } catch (error) {
      await this.execute("PRAGMA foreign_keys=ON");
      throw error;
    }
  }

  async transaction(_mode?: TransactionMode): Promise<Transaction> {
    throw new Error(
      "transaction() is not supported in sql.js wrapper. Use batch() instead."
    );
  }

  async executeMultiple(sql: string): Promise<void> {
    const statements = sql.split(";").filter((s) => s.trim());
    for (const stmt of statements) {
      await this.execute(stmt);
    }
  }

  async sync(): Promise<Replicated> {
    // Local database doesn't need sync
    return undefined;
  }

  reconnect(): void {
    // No-op for local database
  }

  close(): void {
    if (!this._closed) {
      this.db.close();
      this._closed = true;
    }
  }

  /**
   * Export the database to a Uint8Array for persistence
   */
  export(): Uint8Array {
    return this.db.export();
  }
}

// Local sql.js client (implements Client interface)
let localSqlJsClient: SqlJsClientWrapper | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sqlJs: any = null;
let isLocalDbInitialized = false;
let currentUserId: string | null = null;
// Initialization lock to prevent race conditions
let initializationPromise: Promise<Client> | null = null;
/** userId を保持し、同一 userId の同時呼び出しで同じ promise を返す */
let initializingUserId: string | null = null;

/**
 * Initialize sql.js (load WASM) using dynamic import
 */
async function initializeSqlJs(): Promise<{
  Database: new (data?: ArrayLike<number> | Buffer | null) => SqlJsDatabase;
}> {
  if (sqlJs) return sqlJs;

  // Dynamic import to avoid issues with static analysis
  const initSqlJs = (await import("sql.js")).default;

  sqlJs = await initSqlJs({
    // Load WASM from CDN for reliability
    locateFile: (file: string) => `https://sql.js.org/dist/${file}`,
  });

  return sqlJs;
}

/**
 * Get or create local sql.js database
 * This is the primary database for all read/write operations
 *
 * Uses a lock to prevent race conditions during initialization
 */
export async function getLocalClient(userId: string): Promise<Client> {
  // Return existing client if already initialized for this user
  if (localSqlJsClient && isLocalDbInitialized && currentUserId === userId) {
    return localSqlJsClient;
  }

  // If initialization is in progress for the same user, wait for it
  // (currentUserId は init 完了後にしか設定されないため、initializingUserId で判定)
  if (initializationPromise && initializingUserId === userId) {
    return initializationPromise;
  }

  // Reset if user changed
  if (currentUserId !== userId && currentUserId !== null) {
    if (localSqlJsClient) {
      localSqlJsClient.close();
    }
    localSqlJsClient = null;
    isLocalDbInitialized = false;
    initializationPromise = null;
    initializingUserId = null;
  }

  initializingUserId = userId;
  // Create initialization promise to prevent concurrent initializations
  initializationPromise = (async () => {
    try {
      console.log(`[LocalDB] Initializing for user: ${userId}`);
      const SQL = await initializeSqlJs();

      // Try to restore from IndexedDB
      const dbKey = `${LOCAL_DB_KEY}-${userId}`;
      const savedData = await get<Uint8Array>(dbKey);

      let db: SqlJsDatabase;
      if (savedData) {
        try {
          db = new SQL.Database(savedData);
          console.log("[LocalDB] Restored from IndexedDB");

          // Debug: Check page count in restored DB
          const wrapper = new SqlJsClientWrapper(db);
          const countResult = await wrapper.execute({
            sql: `SELECT COUNT(*) as count FROM pages WHERE user_id = ?`,
            args: [userId],
          });
          console.log(
            `[LocalDB] Restored DB has ${countResult.rows[0]?.count ?? 0} pages`
          );
        } catch (error) {
          console.error("[LocalDB] Failed to restore from IndexedDB:", error);
          db = new SQL.Database();
          initializeSchema(db);
        }
      } else {
        console.log("[LocalDB] No saved data found, creating new database");
        db = new SQL.Database();
        initializeSchema(db);
      }

      localSqlJsClient = new SqlJsClientWrapper(db);
      await ensureContentPreviewColumn(localSqlJsClient);
      await ensureNoteSchema(localSqlJsClient);
      isLocalDbInitialized = true;
      currentUserId = userId;
      initializingUserId = null;

      // Restore last sync time
      const savedSyncTime = await get<number>(`${LAST_SYNC_KEY}-${userId}`);
      if (savedSyncTime) {
        lastSyncTime = savedSyncTime;
        console.log(
          `[LocalDB] Last sync time: ${new Date(savedSyncTime).toISOString()}`
        );
      } else {
        console.log("[LocalDB] No previous sync time found");
      }

      return localSqlJsClient;
    } catch (error) {
      console.error("[LocalDB] Failed to create sql.js client:", error);
      initializationPromise = null;
      initializingUserId = null;
      throw error;
    }
  })();

  return initializationPromise;
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

// ============================================================================
// Sync Configuration
// ============================================================================

/** Batch size for pagination when fetching from remote */
const SYNC_PAGE_SIZE = 500;

/** Batch size for IN clause queries */
const BATCH_IN_SIZE = 100;

/**
 * Row type from remote database
 */
interface RemotePageRow {
  id: string;
  user_id: string;
  title: string | null;
  content: string | null;
  content_preview?: string | null;
  thumbnail_url: string | null;
  source_url: string | null;
  vector_embedding: Uint8Array | null;
  created_at: number;
  updated_at: number;
  is_deleted: number;
}

interface RemoteLinkRow {
  source_id: string;
  target_id: string;
  created_at: number;
}

interface RemoteGhostLinkRow {
  link_text: string;
  source_page_id: string;
  created_at: number;
}

interface RemoteNoteRow {
  id: string;
  owner_user_id: string;
  title: string | null;
  visibility: string;
  created_at: number;
  updated_at: number;
  is_deleted: number;
}

interface RemoteNotePageRow {
  note_id: string;
  page_id: string;
  added_by_user_id: string;
  created_at: number;
  updated_at: number;
  is_deleted: number;
}

interface RemoteNoteMemberRow {
  note_id: string;
  member_email: string;
  role: string;
  invited_by_user_id: string;
  created_at: number;
  updated_at: number;
  is_deleted: number;
}

/**
 * Sync local database with remote Turso (Delta Sync - Optimized)
 *
 * Improvements:
 * - Pagination for initial sync (reduces memory usage)
 * - Batch IN queries for links (eliminates N+1)
 * - Progress logging
 */
export async function syncWithRemote(
  jwtToken: string,
  userId: string
): Promise<void> {
  if (isSyncing) {
    console.log("[Sync] Skipped: sync already in progress");
    return;
  }

  try {
    isSyncing = true;
    setSyncStatus("syncing");

    const local = await getLocalClient(userId);
    const remote = await createAuthenticatedTursoClient(jwtToken);
    const [localHasPreview, remoteHasPreview] = await Promise.all([
      hasColumn(local, "pages", "content_preview"),
      hasColumn(remote, "pages", "content_preview"),
    ]);

    // Get sync timestamp (use 0 for initial sync to get all data)
    const syncSince = lastSyncTime ?? 0;
    const isInitialSync = syncSince === 0;

    console.log(
      `[Sync] Starting ${
        isInitialSync ? "initial" : "delta"
      } sync (since: ${new Date(syncSince).toISOString()})`
    );
    console.log(
      `[Sync] userId=${userId}, lastSyncTime=${lastSyncTime ?? "none"}`
    );

    // --- PULL: Fetch changes from remote with pagination ---
    const pulledCount = await pullFromRemote(
      local,
      remote,
      userId,
      syncSince,
      {
        localHasPreview,
        remoteHasPreview,
      }
    );

    // --- PUSH: Send local changes to remote ---
    const pushedCount = await pushToRemote(
      local,
      remote,
      userId,
      syncSince,
      {
        localHasPreview,
        remoteHasPreview,
      }
    );

    const pulledNotesCount = await pullNotesFromRemote(
      local,
      remote,
      userId,
      syncSince
    );
    const pushedNotesCount = await pushNotesToRemote(
      local,
      remote,
      userId,
      syncSince
    );

    await syncNoteRelationsDeltaOptimized(local, remote, userId, syncSince);

    // --- Sync links and ghost links (optimized batch queries) ---
    await syncLinksDeltaOptimized(local, remote, userId, syncSince);
    await syncGhostLinksDeltaOptimized(local, remote, userId, syncSince);

    // Save to IndexedDB
    await saveLocalDatabase();

    // Update sync time
    lastSyncTime = Date.now();
    await set(`${LAST_SYNC_KEY}-${userId}`, lastSyncTime);

    setSyncStatus("synced");
    console.log(
      `[Sync] Completed: pulled ${pulledCount} pages, pushed ${pushedCount} pages`
    );
    console.log(
      `[Sync] Notes: pulled ${pulledNotesCount}, pushed ${pushedNotesCount}`
    );
    console.log(`[Sync] New lastSyncTime=${lastSyncTime}`);
  } catch (error) {
    console.error("[Sync] Failed:", error);
    setSyncStatus("error");
    throw error;
  } finally {
    isSyncing = false;
  }
}

/**
 * Pull changes from remote to local with pagination
 */
type ContentPreviewSupport = {
  localHasPreview: boolean;
  remoteHasPreview: boolean;
};

async function pullFromRemote(
  local: Client,
  remote: Client,
  userId: string,
  syncSince: number,
  previewSupport: ContentPreviewSupport
): Promise<number> {
  // Get local pages for comparison (only id and updated_at)
  const localPages = await local.execute({
    sql: `SELECT id, updated_at FROM pages WHERE user_id = ?`,
    args: [userId],
  });
  const localPageMap = new Map(
    localPages.rows.map((r) => [r.id as string, r.updated_at as number])
  );

  let offset = 0;
  let totalPulled = 0;
  let hasMore = true;

  while (hasMore) {
    // Fetch a batch of pages from remote
    const result = await remote.execute({
      sql: `SELECT * FROM pages 
            WHERE user_id = ? AND updated_at > ? 
            ORDER BY updated_at ASC 
            LIMIT ? OFFSET ?`,
      args: [userId, syncSince, SYNC_PAGE_SIZE, offset],
    });

    const rows = result.rows as unknown as RemotePageRow[];

    if (rows.length === 0) {
      hasMore = false;
      break;
    }

    // Filter rows that need to be updated
    const rowsToInsert = rows.filter((row) => {
      const localUpdatedAt = localPageMap.get(row.id);
      return !localUpdatedAt || row.updated_at > localUpdatedAt;
    });

    // Batch insert into local database
    for (const row of rowsToInsert) {
      const contentPreview =
        previewSupport.remoteHasPreview &&
        row.content_preview !== undefined &&
        row.content_preview !== null
          ? row.content_preview
          : getPageListPreview(row.content || "");

      const insertColumns = previewSupport.localHasPreview
        ? `(id, user_id, title, content, content_preview, thumbnail_url, source_url, vector_embedding, created_at, updated_at, is_deleted)`
        : `(id, user_id, title, content, thumbnail_url, source_url, vector_embedding, created_at, updated_at, is_deleted)`;

      const insertArgs = previewSupport.localHasPreview
        ? [
            row.id,
            row.user_id,
            row.title,
            row.content,
            contentPreview,
            row.thumbnail_url,
            row.source_url,
            row.vector_embedding,
            row.created_at,
            row.updated_at,
            row.is_deleted,
          ]
        : [
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
          ];

      await local.execute({
        sql: `INSERT OR REPLACE INTO pages ${insertColumns} VALUES (${insertArgs
          .map(() => "?")
          .join(", ")})`,
        args: insertArgs,
      });
    }

    totalPulled += rowsToInsert.length;
    offset += SYNC_PAGE_SIZE;

    if (rows.length < SYNC_PAGE_SIZE) {
      hasMore = false;
    }

    if (rows.length > 0) {
      console.log(`[Sync] Pulled ${totalPulled} pages so far...`);
    }
  }

  console.log(`[Sync] Total pulled: ${totalPulled} pages`);
  return totalPulled;
}

/**
 * Push local changes to remote
 */
async function pushToRemote(
  local: Client,
  remote: Client,
  userId: string,
  syncSince: number,
  previewSupport: ContentPreviewSupport
): Promise<number> {
  // Get local changes
  const localChanges = await local.execute({
    sql: `SELECT * FROM pages WHERE user_id = ? AND updated_at > ?`,
    args: [userId, syncSince],
  });

  if (localChanges.rows.length === 0) {
    console.log("[Sync] No local changes to push");
    return 0;
  }

  console.log(
    `[Sync] Pushing ${localChanges.rows.length} local changes to remote`
  );

  // Get remote page updated_at for comparison (only changed pages)
  const localIds = localChanges.rows.map((r) => r.id as string);
  const remotePageMap = new Map<string, number>();

  // Batch fetch remote pages in chunks
  for (let i = 0; i < localIds.length; i += BATCH_IN_SIZE) {
    const batchIds = localIds.slice(i, i + BATCH_IN_SIZE);
    const placeholders = batchIds.map(() => "?").join(",");

    const result = await remote.execute({
      sql: `SELECT id, updated_at FROM pages WHERE id IN (${placeholders})`,
      args: batchIds as InValue[],
    });

    for (const row of result.rows) {
      remotePageMap.set(row.id as string, row.updated_at as number);
    }
  }

  let pushedCount = 0;
  for (const p of localChanges.rows) {
    const remoteUpdatedAt = remotePageMap.get(p.id as string);
    const localUpdatedAt = p.updated_at as number;

    // Push if local is newer or doesn't exist in remote
    if (!remoteUpdatedAt || localUpdatedAt > remoteUpdatedAt) {
      const localPreview = previewSupport.localHasPreview
        ? (p.content_preview as string | null)
        : null;
      const contentPreview =
        localPreview ?? getPageListPreview((p.content as string) || "");

      const insertColumns = previewSupport.remoteHasPreview
        ? `(id, user_id, title, content, content_preview, thumbnail_url, source_url, vector_embedding, created_at, updated_at, is_deleted)`
        : `(id, user_id, title, content, thumbnail_url, source_url, vector_embedding, created_at, updated_at, is_deleted)`;

      const insertArgs = previewSupport.remoteHasPreview
        ? [
            p.id,
            p.user_id,
            p.title,
            p.content,
            contentPreview,
            p.thumbnail_url,
            p.source_url,
            p.vector_embedding,
            p.created_at,
            p.updated_at,
            p.is_deleted,
          ]
        : [
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
          ];

      await remote.execute({
        sql: `INSERT OR REPLACE INTO pages ${insertColumns} VALUES (${insertArgs
          .map(() => "?")
          .join(", ")})`,
        args: insertArgs as InValue[],
      });
      pushedCount++;
    }
  }

  console.log(`[Sync] Pushed ${pushedCount} pages`);
  return pushedCount;
}

/**
 * Pull notes changes from remote to local with pagination
 */
async function pullNotesFromRemote(
  local: Client,
  remote: Client,
  userId: string,
  syncSince: number
): Promise<number> {
  const localNotes = await local.execute({
    sql: `SELECT id, updated_at FROM notes WHERE owner_user_id = ?`,
    args: [userId],
  });
  const localNoteMap = new Map(
    localNotes.rows.map((r) => [r.id as string, r.updated_at as number])
  );

  let offset = 0;
  let totalPulled = 0;
  let hasMore = true;

  while (hasMore) {
    const result = await remote.execute({
      sql: `SELECT * FROM notes
            WHERE owner_user_id = ? AND updated_at > ?
            ORDER BY updated_at ASC
            LIMIT ? OFFSET ?`,
      args: [userId, syncSince, SYNC_PAGE_SIZE, offset],
    });

    const rows = result.rows as unknown as RemoteNoteRow[];
    if (rows.length === 0) {
      hasMore = false;
      break;
    }

    const rowsToInsert = rows.filter((row) => {
      const localUpdatedAt = localNoteMap.get(row.id);
      return !localUpdatedAt || row.updated_at > localUpdatedAt;
    });

    for (const row of rowsToInsert) {
      await local.execute({
        sql: `
          INSERT OR REPLACE INTO notes
          (id, owner_user_id, title, visibility, created_at, updated_at, is_deleted)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        args: [
          row.id,
          row.owner_user_id,
          row.title,
          row.visibility,
          row.created_at,
          row.updated_at,
          row.is_deleted,
        ],
      });
    }

    totalPulled += rowsToInsert.length;
    offset += SYNC_PAGE_SIZE;

    if (rows.length < SYNC_PAGE_SIZE) {
      hasMore = false;
    }
  }

  return totalPulled;
}

/**
 * Push notes changes from local to remote
 */
async function pushNotesToRemote(
  local: Client,
  remote: Client,
  userId: string,
  syncSince: number
): Promise<number> {
  const localChanges = await local.execute({
    sql: `SELECT * FROM notes WHERE owner_user_id = ? AND updated_at > ?`,
    args: [userId, syncSince],
  });

  if (localChanges.rows.length === 0) {
    return 0;
  }

  const localIds = localChanges.rows.map((r) => r.id as string);
  const remoteNoteMap = new Map<string, number>();

  for (let i = 0; i < localIds.length; i += BATCH_IN_SIZE) {
    const batchIds = localIds.slice(i, i + BATCH_IN_SIZE);
    const placeholders = batchIds.map(() => "?").join(",");
    const result = await remote.execute({
      sql: `SELECT id, updated_at FROM notes WHERE id IN (${placeholders})`,
      args: batchIds as InValue[],
    });

    for (const row of result.rows) {
      remoteNoteMap.set(row.id as string, row.updated_at as number);
    }
  }

  let pushedCount = 0;
  for (const n of localChanges.rows) {
    const remoteUpdatedAt = remoteNoteMap.get(n.id as string);
    const localUpdatedAt = n.updated_at as number;

    if (!remoteUpdatedAt || localUpdatedAt > remoteUpdatedAt) {
      await remote.execute({
        sql: `
          INSERT OR REPLACE INTO notes
          (id, owner_user_id, title, visibility, created_at, updated_at, is_deleted)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        args: [
          n.id,
          n.owner_user_id,
          n.title,
          n.visibility,
          n.created_at,
          n.updated_at,
          n.is_deleted,
        ] as InValue[],
      });
      pushedCount++;
    }
  }

  return pushedCount;
}

/**
 * Sync note pages and members (Delta)
 */
async function syncNoteRelationsDeltaOptimized(
  local: Client,
  remote: Client,
  userId: string,
  syncSince: number
): Promise<void> {
  const localUpdatedNotes = await local.execute({
    sql: `SELECT id FROM notes WHERE owner_user_id = ? AND updated_at > ?`,
    args: [userId, syncSince],
  });
  const localUpdatedIds = localUpdatedNotes.rows.map((r) => r.id as string);

  const remoteUpdatedNotes = await remote.execute({
    sql: `SELECT id FROM notes WHERE owner_user_id = ? AND updated_at > ?`,
    args: [userId, syncSince],
  });
  const remoteUpdatedIds = remoteUpdatedNotes.rows.map((r) => r.id as string);

  const allUpdatedIds = [...new Set([...localUpdatedIds, ...remoteUpdatedIds])];
  if (allUpdatedIds.length === 0) return;

  const allRemoteNotePages: RemoteNotePageRow[] = [];
  const allRemoteMembers: RemoteNoteMemberRow[] = [];

  for (let i = 0; i < allUpdatedIds.length; i += BATCH_IN_SIZE) {
    const batchIds = allUpdatedIds.slice(i, i + BATCH_IN_SIZE);
    const placeholders = batchIds.map(() => "?").join(",");

    const notePagesResult = await remote.execute({
      sql: `SELECT * FROM note_pages WHERE note_id IN (${placeholders})`,
      args: batchIds as InValue[],
    });
    for (const row of notePagesResult.rows) {
      allRemoteNotePages.push({
        note_id: row.note_id as string,
        page_id: row.page_id as string,
        added_by_user_id: row.added_by_user_id as string,
        created_at: row.created_at as number,
        updated_at: row.updated_at as number,
        is_deleted: row.is_deleted as number,
      });
    }

    const membersResult = await remote.execute({
      sql: `SELECT * FROM note_members WHERE note_id IN (${placeholders})`,
      args: batchIds as InValue[],
    });
    for (const row of membersResult.rows) {
      allRemoteMembers.push({
        note_id: row.note_id as string,
        member_email: row.member_email as string,
        role: row.role as string,
        invited_by_user_id: row.invited_by_user_id as string,
        created_at: row.created_at as number,
        updated_at: row.updated_at as number,
        is_deleted: row.is_deleted as number,
      });
    }
  }

  for (const noteId of allUpdatedIds) {
    await local.execute({
      sql: `DELETE FROM note_pages WHERE note_id = ?`,
      args: [noteId],
    });
    await local.execute({
      sql: `DELETE FROM note_members WHERE note_id = ?`,
      args: [noteId],
    });
  }

  for (const row of allRemoteNotePages) {
    await local.execute({
      sql: `
        INSERT OR REPLACE INTO note_pages
        (note_id, page_id, added_by_user_id, created_at, updated_at, is_deleted)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
      args: [
        row.note_id,
        row.page_id,
        row.added_by_user_id,
        row.created_at,
        row.updated_at,
        row.is_deleted,
      ],
    });
  }

  for (const row of allRemoteMembers) {
    await local.execute({
      sql: `
        INSERT OR REPLACE INTO note_members
        (note_id, member_email, role, invited_by_user_id, created_at, updated_at, is_deleted)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        row.note_id,
        row.member_email,
        row.role,
        row.invited_by_user_id,
        row.created_at,
        row.updated_at,
        row.is_deleted,
      ],
    });
  }

  if (localUpdatedIds.length > 0) {
    const allLocalNotePages: RemoteNotePageRow[] = [];
    const allLocalMembers: RemoteNoteMemberRow[] = [];

    for (let i = 0; i < localUpdatedIds.length; i += BATCH_IN_SIZE) {
      const batchIds = localUpdatedIds.slice(i, i + BATCH_IN_SIZE);
      const placeholders = batchIds.map(() => "?").join(",");

      const notePagesResult = await local.execute({
        sql: `SELECT * FROM note_pages WHERE note_id IN (${placeholders})`,
        args: batchIds,
      });
      for (const row of notePagesResult.rows) {
        allLocalNotePages.push({
          note_id: row.note_id as string,
          page_id: row.page_id as string,
          added_by_user_id: row.added_by_user_id as string,
          created_at: row.created_at as number,
          updated_at: row.updated_at as number,
          is_deleted: row.is_deleted as number,
        });
      }

      const membersResult = await local.execute({
        sql: `SELECT * FROM note_members WHERE note_id IN (${placeholders})`,
        args: batchIds,
      });
      for (const row of membersResult.rows) {
        allLocalMembers.push({
          note_id: row.note_id as string,
          member_email: row.member_email as string,
          role: row.role as string,
          invited_by_user_id: row.invited_by_user_id as string,
          created_at: row.created_at as number,
          updated_at: row.updated_at as number,
          is_deleted: row.is_deleted as number,
        });
      }
    }

    for (const row of allLocalNotePages) {
      await remote.execute({
        sql: `
          INSERT OR REPLACE INTO note_pages
          (note_id, page_id, added_by_user_id, created_at, updated_at, is_deleted)
          VALUES (?, ?, ?, ?, ?, ?)
        `,
        args: [
          row.note_id,
          row.page_id,
          row.added_by_user_id,
          row.created_at,
          row.updated_at,
          row.is_deleted,
        ] as InValue[],
      });
    }

    for (const row of allLocalMembers) {
      await remote.execute({
        sql: `
          INSERT OR REPLACE INTO note_members
          (note_id, member_email, role, invited_by_user_id, created_at, updated_at, is_deleted)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        args: [
          row.note_id,
          row.member_email,
          row.role,
          row.invited_by_user_id,
          row.created_at,
          row.updated_at,
          row.is_deleted,
        ] as InValue[],
      });
    }
  }
}

/**
 * Sync links between local and remote (Delta) - Optimized with batch queries
 * Uses IN clause instead of N+1 queries
 */
async function syncLinksDeltaOptimized(
  local: Client,
  remote: Client,
  userId: string,
  syncSince: number
): Promise<void> {
  // Get page IDs that were updated since syncSince (local)
  const updatedPages = await local.execute({
    sql: `SELECT id FROM pages WHERE user_id = ? AND updated_at > ?`,
    args: [userId, syncSince],
  });
  const localUpdatedIds = updatedPages.rows.map((r) => r.id as string);

  // Get page IDs that were updated since syncSince (remote)
  const remoteUpdatedPages = await remote.execute({
    sql: `SELECT id FROM pages WHERE user_id = ? AND updated_at > ?`,
    args: [userId, syncSince],
  });
  const remoteUpdatedIds = remoteUpdatedPages.rows.map((r) => r.id as string);

  // Combine both sets
  const allUpdatedIds = [...new Set([...localUpdatedIds, ...remoteUpdatedIds])];
  if (allUpdatedIds.length === 0) return;

  console.log(
    `[Sync] Syncing links for ${allUpdatedIds.length} updated pages...`
  );

  // --- PULL: Batch fetch remote links using IN clause ---
  const allRemoteLinks: RemoteLinkRow[] = [];

  for (let i = 0; i < allUpdatedIds.length; i += BATCH_IN_SIZE) {
    const batchIds = allUpdatedIds.slice(i, i + BATCH_IN_SIZE);
    const placeholders = batchIds.map(() => "?").join(",");

    const result = await remote.execute({
      sql: `SELECT * FROM links WHERE source_id IN (${placeholders})`,
      args: batchIds as InValue[],
    });

    for (const row of result.rows) {
      allRemoteLinks.push({
        source_id: row.source_id as string,
        target_id: row.target_id as string,
        created_at: row.created_at as number,
      });
    }
  }

  // Delete old links for updated pages and insert new ones
  for (const pageId of allUpdatedIds) {
    await local.execute({
      sql: `DELETE FROM links WHERE source_id = ?`,
      args: [pageId],
    });
  }

  // Insert remote links
  for (const link of allRemoteLinks) {
    await local.execute({
      sql: `INSERT OR REPLACE INTO links (source_id, target_id, created_at) VALUES (?, ?, ?)`,
      args: [link.source_id, link.target_id, link.created_at],
    });
  }

  // --- PUSH: Batch fetch local links and push to remote ---
  if (localUpdatedIds.length > 0) {
    const allLocalLinks: RemoteLinkRow[] = [];

    for (let i = 0; i < localUpdatedIds.length; i += BATCH_IN_SIZE) {
      const batchIds = localUpdatedIds.slice(i, i + BATCH_IN_SIZE);
      const placeholders = batchIds.map(() => "?").join(",");

      const result = await local.execute({
        sql: `SELECT * FROM links WHERE source_id IN (${placeholders})`,
        args: batchIds,
      });

      for (const row of result.rows) {
        allLocalLinks.push({
          source_id: row.source_id as string,
          target_id: row.target_id as string,
          created_at: row.created_at as number,
        });
      }
    }

    // Push to remote
    for (const link of allLocalLinks) {
      await remote.execute({
        sql: `INSERT OR REPLACE INTO links (source_id, target_id, created_at) VALUES (?, ?, ?)`,
        args: [link.source_id, link.target_id, link.created_at] as InValue[],
      });
    }

    console.log(`[Sync] Synced ${allLocalLinks.length} links`);
  }
}

/**
 * Sync ghost links between local and remote (Delta) - Optimized with batch queries
 * Uses IN clause instead of N+1 queries
 */
async function syncGhostLinksDeltaOptimized(
  local: Client,
  remote: Client,
  userId: string,
  syncSince: number
): Promise<void> {
  // Get page IDs that were updated since syncSince (local)
  const updatedPages = await local.execute({
    sql: `SELECT id FROM pages WHERE user_id = ? AND updated_at > ?`,
    args: [userId, syncSince],
  });
  const localUpdatedIds = updatedPages.rows.map((r) => r.id as string);

  // Get page IDs that were updated since syncSince (remote)
  const remoteUpdatedPages = await remote.execute({
    sql: `SELECT id FROM pages WHERE user_id = ? AND updated_at > ?`,
    args: [userId, syncSince],
  });
  const remoteUpdatedIds = remoteUpdatedPages.rows.map((r) => r.id as string);

  // Combine both sets
  const allUpdatedIds = [...new Set([...localUpdatedIds, ...remoteUpdatedIds])];
  if (allUpdatedIds.length === 0) return;

  console.log(
    `[Sync] Syncing ghost links for ${allUpdatedIds.length} updated pages...`
  );

  // --- PULL: Batch fetch remote ghost links using IN clause ---
  const allRemoteGhostLinks: RemoteGhostLinkRow[] = [];

  for (let i = 0; i < allUpdatedIds.length; i += BATCH_IN_SIZE) {
    const batchIds = allUpdatedIds.slice(i, i + BATCH_IN_SIZE);
    const placeholders = batchIds.map(() => "?").join(",");

    const result = await remote.execute({
      sql: `SELECT * FROM ghost_links WHERE source_page_id IN (${placeholders})`,
      args: batchIds as InValue[],
    });

    for (const row of result.rows) {
      allRemoteGhostLinks.push({
        link_text: row.link_text as string,
        source_page_id: row.source_page_id as string,
        created_at: row.created_at as number,
      });
    }
  }

  // Delete old ghost links for updated pages and insert new ones
  for (const pageId of allUpdatedIds) {
    await local.execute({
      sql: `DELETE FROM ghost_links WHERE source_page_id = ?`,
      args: [pageId],
    });
  }

  // Insert remote ghost links
  for (const link of allRemoteGhostLinks) {
    await local.execute({
      sql: `INSERT OR REPLACE INTO ghost_links (link_text, source_page_id, created_at) VALUES (?, ?, ?)`,
      args: [link.link_text, link.source_page_id, link.created_at],
    });
  }

  // --- PUSH: Batch fetch local ghost links and push to remote ---
  if (localUpdatedIds.length > 0) {
    const allLocalGhostLinks: RemoteGhostLinkRow[] = [];

    for (let i = 0; i < localUpdatedIds.length; i += BATCH_IN_SIZE) {
      const batchIds = localUpdatedIds.slice(i, i + BATCH_IN_SIZE);
      const placeholders = batchIds.map(() => "?").join(",");

      const result = await local.execute({
        sql: `SELECT * FROM ghost_links WHERE source_page_id IN (${placeholders})`,
        args: batchIds,
      });

      for (const row of result.rows) {
        allLocalGhostLinks.push({
          link_text: row.link_text as string,
          source_page_id: row.source_page_id as string,
          created_at: row.created_at as number,
        });
      }
    }

    // Push to remote
    for (const link of allLocalGhostLinks) {
      await remote.execute({
        sql: `INSERT OR REPLACE INTO ghost_links (link_text, source_page_id, created_at) VALUES (?, ?, ?)`,
        args: [
          link.link_text,
          link.source_page_id,
          link.created_at,
        ] as InValue[],
      });
    }

    console.log(`[Sync] Synced ${allLocalGhostLinks.length} ghost links`);
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
  initializationPromise = null;
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

// Re-export Client type for convenience
export type { Client } from "@libsql/client/web";
