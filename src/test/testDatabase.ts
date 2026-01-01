import initSqlJs, { Database } from "sql.js";
import { LocalPageRepository } from "@/lib/localPageRepository";

let SQL: initSqlJs.SqlJsStatic | null = null;

/**
 * Initialize sql.js for testing
 */
async function initSqlJsForTest(): Promise<initSqlJs.SqlJsStatic> {
  if (!SQL) {
    SQL = await initSqlJs();
  }
  return SQL;
}

/**
 * Create an in-memory database for testing
 */
export async function createTestDatabase(): Promise<Database> {
  const sqlJs = await initSqlJsForTest();
  const db = new sqlJs.Database();

  // Initialize schema
  db.run(`
    -- Pages table
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

    -- Links table
    CREATE TABLE IF NOT EXISTS links (
      source_id TEXT NOT NULL,
      target_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (source_id, target_id)
    );

    CREATE INDEX IF NOT EXISTS idx_links_source ON links(source_id);
    CREATE INDEX IF NOT EXISTS idx_links_target ON links(target_id);

    -- Ghost Links table
    CREATE TABLE IF NOT EXISTS ghost_links (
      link_text TEXT NOT NULL,
      source_page_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (link_text, source_page_id)
    );

    CREATE INDEX IF NOT EXISTS idx_ghost_links_text ON ghost_links(link_text);
  `);

  return db;
}

/**
 * Create a test repository with an in-memory database
 */
export async function createTestRepository(): Promise<{
  db: Database;
  repository: LocalPageRepository;
}> {
  const db = await createTestDatabase();
  const repository = new LocalPageRepository(db);
  return { db, repository };
}

/**
 * Tiptap JSON content with WikiLinks
 */
export function createWikiLinkContent(links: string[]): string {
  const content = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: links.map((title) => ({
          type: "text",
          text: `[[${title}]]`,
          marks: [
            {
              type: "wikiLink",
              attrs: {
                title,
                exists: false,
                referenced: false,
              },
            },
          ],
        })),
      },
    ],
  };
  return JSON.stringify(content);
}

/**
 * Create plain text Tiptap content
 */
export function createPlainTextContent(text: string): string {
  const content = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text,
          },
        ],
      },
    ],
  };
  return JSON.stringify(content);
}

/**
 * Test data factory
 */
export interface TestPageData {
  id: string;
  userId: string;
  title: string;
  content: string;
  sourceUrl?: string;
  createdAt?: number;
  updatedAt?: number;
}

/**
 * Insert test page directly into database
 */
export function insertTestPage(db: Database, page: TestPageData): void {
  const now = Date.now();
  db.run(
    `INSERT INTO pages (id, user_id, title, content, source_url, created_at, updated_at, is_deleted)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
    [
      page.id,
      page.userId,
      page.title,
      page.content,
      page.sourceUrl || null,
      page.createdAt || now,
      page.updatedAt || now,
    ]
  );
}

/**
 * Insert test link directly into database
 */
export function insertTestLink(
  db: Database,
  sourceId: string,
  targetId: string
): void {
  db.run(
    `INSERT INTO links (source_id, target_id, created_at) VALUES (?, ?, ?)`,
    [sourceId, targetId, Date.now()]
  );
}

/**
 * Insert test ghost link directly into database
 */
export function insertTestGhostLink(
  db: Database,
  linkText: string,
  sourcePageId: string
): void {
  db.run(
    `INSERT INTO ghost_links (link_text, source_page_id, created_at) VALUES (?, ?, ?)`,
    [linkText, sourcePageId, Date.now()]
  );
}

/**
 * Clear all data from tables
 */
export function clearTestDatabase(db: Database): void {
  db.run("DELETE FROM pages");
  db.run("DELETE FROM links");
  db.run("DELETE FROM ghost_links");
}
