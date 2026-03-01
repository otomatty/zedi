/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Step 1: Export data from Turso (SQLite/libSQL) to local JSON.
 *
 * Exports active pages and links for the specified user.
 *
 * Usage:
 *   TURSO_DATABASE_URL=libsql://... TURSO_AUTH_TOKEN=... npx tsx scripts/migration/turso-to-railway/01-export-turso.ts
 */
import { createClient } from "@libsql/client";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, "output");

const USER_MAP: Record<string, string> = {
  user_37jAIdMFr4gzT466LyJEhpchQMa: "main-user",
  user_39HL8tqphppWWHLkAOzbcYSB6x5: "test-user",
};

const TARGET_USER_ID = "user_37jAIdMFr4gzT466LyJEhpchQMa";

async function main() {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!url || !authToken) {
    console.error("Error: TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must be set");
    process.exit(1);
  }

  const client = createClient({ url, authToken });

  console.log(
    `Exporting data for user: ${TARGET_USER_ID} (${USER_MAP[TARGET_USER_ID] ?? "unknown"})`,
  );

  // Export active pages
  const pages = await client.execute({
    sql: `SELECT id, user_id, title, content, content_preview, thumbnail_url, source_url,
                 created_at, updated_at, is_deleted
          FROM pages
          WHERE user_id = ? AND is_deleted = 0
          ORDER BY created_at`,
    args: [TARGET_USER_ID],
  });
  console.log(`  Active pages: ${pages.rows.length}`);

  // Export links where both endpoints belong to active pages of this user
  const links = await client.execute({
    sql: `SELECT l.source_id, l.target_id, l.created_at
          FROM links l
          JOIN pages p1 ON l.source_id = p1.id AND p1.user_id = ? AND p1.is_deleted = 0
          JOIN pages p2 ON l.target_id = p2.id AND p2.user_id = ? AND p2.is_deleted = 0`,
    args: [TARGET_USER_ID, TARGET_USER_ID],
  });
  console.log(`  Links: ${links.rows.length}`);

  // Summary stats
  const contentStats = {
    total: pages.rows.length,
    withContent: pages.rows.filter(
      (r: any) => r.content && r.content !== '{"type":"doc","content":[]}',
    ).length,
    withThumbnail: pages.rows.filter((r: any) => r.thumbnail_url).length,
    withSourceUrl: pages.rows.filter((r: any) => r.source_url).length,
    withPreview: pages.rows.filter((r: any) => r.content_preview).length,
  };

  if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });

  const output = {
    exportedAt: new Date().toISOString(),
    sourceDatabase: url.replace(/\/\/.*@/, "//***@"),
    sourceUserId: TARGET_USER_ID,
    stats: contentStats,
    pages: pages.rows,
    links: links.rows,
  };

  const filePath = join(OUTPUT_DIR, "01-turso-export.json");
  writeFileSync(filePath, JSON.stringify(output, null, 2));
  console.log(`\nExported to: ${filePath}`);
  console.log("Stats:", JSON.stringify(contentStats, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
