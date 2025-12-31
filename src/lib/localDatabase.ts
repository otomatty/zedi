import initSqlJs, { Database } from "sql.js";
import { get, set } from "idb-keyval";

const DB_KEY = "zedi-local-db";
const SQL_WASM_URL = "https://sql.js.org/dist/sql-wasm.wasm";

let db: Database | null = null;
let SQL: initSqlJs.SqlJsStatic | null = null;

/**
 * Initialize the local SQLite database
 * Uses sql.js (SQLite compiled to WebAssembly) with IndexedDB for persistence
 */
export async function initLocalDatabase(): Promise<Database> {
  if (db) {
    return db;
  }

  // Initialize SQL.js
  if (!SQL) {
    SQL = await initSqlJs({
      locateFile: () => SQL_WASM_URL,
    });
  }

  // Try to load existing database from IndexedDB
  const savedData = await get<Uint8Array>(DB_KEY);

  if (savedData) {
    db = new SQL.Database(savedData);
  } else {
    db = new SQL.Database();
    // Initialize schema for new database
    await initializeSchema(db);
  }

  return db;
}

/**
 * Initialize the database schema
 */
async function initializeSchema(database: Database): Promise<void> {
  database.run(`
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
  `);

  // Save initial database
  await saveDatabase(database);
}

/**
 * Save the database to IndexedDB
 */
export async function saveDatabase(database?: Database): Promise<void> {
  const targetDb = database || db;
  if (!targetDb) return;

  const data = targetDb.export();
  await set(DB_KEY, data);
}

/**
 * Get the local database instance
 */
export function getLocalDatabase(): Database | null {
  return db;
}

/**
 * Close and cleanup the database
 */
export function closeLocalDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}

/**
 * Execute a SQL query and return results
 */
export interface QueryResult {
  columns: string[];
  values: unknown[][];
}

export function executeQuery(
  sql: string,
  params: unknown[] = []
): QueryResult[] {
  if (!db) {
    throw new Error(
      "Database not initialized. Call initLocalDatabase() first."
    );
  }

  const stmt = db.prepare(sql);
  stmt.bind(params);

  const results: QueryResult[] = [];
  while (stmt.step()) {
    const columns = stmt.getColumnNames();
    const values = stmt.get();
    results.push({ columns, values: [values] });
  }
  stmt.free();

  return results;
}

/**
 * Execute a SQL statement (INSERT, UPDATE, DELETE)
 */
export function executeStatement(sql: string, params: unknown[] = []): void {
  if (!db) {
    throw new Error(
      "Database not initialized. Call initLocalDatabase() first."
    );
  }

  db.run(sql, params);
}
