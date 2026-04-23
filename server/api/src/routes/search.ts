/**
 * /api/search — 全文検索
 *
 * GET /api/search?q=&scope= — ILIKE による全文検索 (pg_trgm GIN インデックスで高速化)
 *
 * スコープ契約 (Issue #713 / #718 Phase 5-1):
 * - `scope=own` は個人ページ (`note_id IS NULL`) のみを返す。Phase 1〜4 で導入された
 *   個人 / ノートネイティブページの分離を検索面にも反映するための防御的ガード。
 * - `scope=shared` は個人ページ + 自分が参加するノートのページを横断する既存挙動を維持する。
 * - いずれのスコープでも `note_id` を返し、呼び出し側がスコープ判定できるようにする。
 *
 * Scope contract (Issue #713 / #718 Phase 5-1):
 * - `scope=own` returns personal pages only (`note_id IS NULL`). This is a
 *   defensive guard that mirrors the personal / note-native split introduced
 *   in Phase 1〜4 at the search layer.
 * - `scope=shared` keeps the existing cross-scope behavior (personal pages +
 *   pages in notes the caller participates in).
 * - Both scopes expose `note_id` so callers can tell the two apart.
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

  // 両スコープで返す列は同一なので共有する。`p.note_id` は呼び出し側のスコープ判定用。
  // Both scopes return the same columns; `p.note_id` lets callers distinguish scopes.
  const searchColumns = sql`p.id, p.title, p.content_preview, p.updated_at, p.note_id,
             pc.content_text`;

  let results;

  if (scope === "shared") {
    results = await db.execute(sql`
      SELECT ${searchColumns}
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
      SELECT ${searchColumns}
      FROM pages p
      LEFT JOIN page_contents pc ON pc.page_id = p.id
      WHERE p.is_deleted = false
        AND p.owner_id = ${userId}
        AND p.note_id IS NULL
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
