/**
 * /api/search — 全文検索
 *
 * GET /api/search?q=&scope= — ILIKE による全文検索 (pg_trgm GIN インデックスで高速化)
 */
import { Hono } from "hono";
import { sql } from "drizzle-orm";
import { authRequired } from "../middleware/auth.js";
import type { AppEnv } from "../types/index.js";

function escapeLike(input: string): string {
  return input.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

const app = new Hono<AppEnv>();

app.get("/", authRequired, async (c) => {
  const userId = c.get("userId");
  const db = c.get("db");

  const query = c.req.query("q")?.trim();
  if (!query) {
    return c.json({ results: [] });
  }

  const scope = c.req.query("scope") || "own";
  const limit = Math.min(Math.max(Number(c.req.query("limit") || 20), 1), 100);
  const pattern = `%${escapeLike(query)}%`;

  let results;

  if (scope === "shared") {
    results = await db.execute(sql`
      SELECT p.id, p.title, p.content_preview, p.updated_at,
             pc.content_text
      FROM pages p
      LEFT JOIN page_contents pc ON pc.page_id = p.id
      WHERE p.is_deleted = false
        AND (
          p.owner_id = ${userId}
          OR p.id IN (
            SELECT np.page_id FROM note_pages np
            JOIN note_members nm ON nm.note_id = np.note_id
            WHERE nm.member_email IN (
              SELECT email FROM "user" WHERE id = ${userId}
            )
            AND nm.is_deleted = false
            AND np.is_deleted = false
          )
        )
        AND (
          p.title ILIKE ${pattern}
          OR pc.content_text ILIKE ${pattern}
        )
      ORDER BY p.updated_at DESC
      LIMIT ${limit}
    `);
  } else {
    results = await db.execute(sql`
      SELECT p.id, p.title, p.content_preview, p.updated_at,
             pc.content_text
      FROM pages p
      LEFT JOIN page_contents pc ON pc.page_id = p.id
      WHERE p.is_deleted = false
        AND p.owner_id = ${userId}
        AND (
          p.title ILIKE ${pattern}
          OR pc.content_text ILIKE ${pattern}
        )
      ORDER BY p.updated_at DESC
      LIMIT ${limit}
    `);
  }

  return c.json({ results: results.rows });
});

export default app;
