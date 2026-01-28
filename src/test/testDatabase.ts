import { createClient, type Client } from "@libsql/client/web";
import { PageRepository } from "@/lib/pageRepository";

/**
 * Schema SQL for test database
 */
const SCHEMA_SQL = `
  -- Pages table
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
`;

/**
 * Create an in-memory database client for testing
 */
export async function createTestClient(): Promise<Client> {
  const client = createClient({
    url: ":memory:",
  });

  // Initialize schema
  const statements = SCHEMA_SQL.split(";").filter((s) => s.trim());
  for (const stmt of statements) {
    await client.execute(stmt);
  }

  return client;
}

/**
 * Create a test repository with an in-memory database
 */
export async function createTestRepository(): Promise<{
  client: Client;
  repository: PageRepository;
}> {
  const client = await createTestClient();
  const repository = new PageRepository(client);
  return { client, repository };
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
export async function insertTestPage(
  client: Client,
  page: TestPageData
): Promise<void> {
  const now = Date.now();
  await client.execute({
    sql: `INSERT INTO pages (id, user_id, title, content, source_url, created_at, updated_at, is_deleted)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
    args: [
      page.id,
      page.userId,
      page.title,
      page.content,
      page.sourceUrl || null,
      page.createdAt || now,
      page.updatedAt || now,
    ],
  });
}

/**
 * Insert test link directly into database
 */
export async function insertTestLink(
  client: Client,
  sourceId: string,
  targetId: string
): Promise<void> {
  await client.execute({
    sql: `INSERT INTO links (source_id, target_id, created_at) VALUES (?, ?, ?)`,
    args: [sourceId, targetId, Date.now()],
  });
}

/**
 * Insert test ghost link directly into database
 */
export async function insertTestGhostLink(
  client: Client,
  linkText: string,
  sourcePageId: string
): Promise<void> {
  await client.execute({
    sql: `INSERT INTO ghost_links (link_text, source_page_id, created_at) VALUES (?, ?, ?)`,
    args: [linkText, sourcePageId, Date.now()],
  });
}

/**
 * Clear all data from tables
 */
export async function clearTestDatabase(client: Client): Promise<void> {
  await client.execute("DELETE FROM pages");
  await client.execute("DELETE FROM links");
  await client.execute("DELETE FROM ghost_links");
}
