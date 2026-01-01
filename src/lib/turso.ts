import { createClient, Client } from "@libsql/client/web";
import { get, set } from "idb-keyval";

// Turso database configuration
const TURSO_DATABASE_URL = import.meta.env.VITE_TURSO_DATABASE_URL;
const TURSO_AUTH_TOKEN = import.meta.env.VITE_TURSO_AUTH_TOKEN;

// Local database configuration
const LOCAL_DB_KEY = "zedi-local-db";

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

// Create a basic Turso client (remote)
export function createTursoClient(): Client {
  if (!TURSO_DATABASE_URL) {
    throw new Error("Missing Turso Database URL");
  }

  return createClient({
    url: TURSO_DATABASE_URL,
    authToken: TURSO_AUTH_TOKEN,
  });
}

// Create an authenticated Turso client using Clerk JWT
export function createAuthenticatedTursoClient(jwtToken: string): Client {
  if (!TURSO_DATABASE_URL) {
    throw new Error("Missing Turso Database URL");
  }

  return createClient({
    url: TURSO_DATABASE_URL,
    authToken: jwtToken,
  });
}

// Singleton client instance for remote access
let tursoClient: Client | null = null;

export function getTursoClient(): Client {
  if (!tursoClient) {
    tursoClient = createTursoClient();
  }
  return tursoClient;
}

// Local database client (in-memory with IndexedDB persistence)
let localClient: Client | null = null;
let isLocalDbInitialized = false;

/**
 * Create or get local libsql client with IndexedDB persistence
 * Uses in-memory database that syncs to IndexedDB
 */
export async function getLocalClient(): Promise<Client> {
  if (localClient && isLocalDbInitialized) {
    return localClient;
  }

  // Create in-memory client
  localClient = createClient({
    url: ":memory:",
  });

  // Try to restore from IndexedDB
  const savedData = await get<string>(LOCAL_DB_KEY);
  
  if (savedData) {
    // Restore data from saved SQL dump
    try {
      const statements = parseSqlDump(savedData);
      for (const stmt of statements) {
        if (stmt.trim()) {
          await localClient.execute(stmt);
        }
      }
      isLocalDbInitialized = true;
    } catch (error) {
      console.error("Failed to restore database from IndexedDB:", error);
      // Initialize fresh schema
      await initializeLocalSchema(localClient);
    }
  } else {
    // Initialize fresh schema
    await initializeLocalSchema(localClient);
  }

  return localClient;
}

/**
 * Initialize the local database schema
 */
async function initializeLocalSchema(client: Client): Promise<void> {
  const statements = SCHEMA_SQL.split(";").filter((s) => s.trim());
  for (const stmt of statements) {
    await client.execute(stmt);
  }
  isLocalDbInitialized = true;
  await saveLocalDatabase();
}

/**
 * Save local database to IndexedDB
 * Creates a SQL dump of all data
 */
export async function saveLocalDatabase(): Promise<void> {
  if (!localClient) return;

  try {
    // Get all tables data
    const dump = await createSqlDump(localClient);
    await set(LOCAL_DB_KEY, dump);
  } catch (error) {
    console.error("Failed to save database to IndexedDB:", error);
  }
}

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
    return `X'${Array.from(value).map((b) => b.toString(16).padStart(2, "0")).join("")}'`;
  }
  return `'${String(value).replace(/'/g, "''")}'`;
}

/**
 * Check if local database is ready
 */
export function isLocalClientReady(): boolean {
  return localClient !== null && isLocalDbInitialized;
}

/**
 * Close and cleanup local database
 */
export function closeLocalClient(): void {
  localClient = null;
  isLocalDbInitialized = false;
}
