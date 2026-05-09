/**
 * /api/notes/:noteId/search — ノートスコープ全文検索 (Issue #718 Phase 5-2)
 *
 * GET /:noteId/search?q=&limit= — 指定ノート内のページに限定した ILIKE 検索。
 *
 * スコープ契約 (Issue #823):
 * - 結果は `pages.note_id = :noteId` のページのみ。
 *
 * Scope contract (issue #823):
 * - Results are restricted to rows where `pages.note_id` matches the path param.
 * - Requires an authenticated session (`authRequired`). Access is decided via
 *   `getNoteRole`; any resolved role (owner/editor/viewer/guest) may search.
 *   Unauthenticated callers get 401; callers without a role on a private note get 403.
 *
 * - 認証済みセッション必須（`authRequired`）。閲覧権限は `getNoteRole` で解決し、
 *   解決されたロール（owner / editor / viewer / guest）があれば検索を許可する。
 *   未ログインは 401、private でロールなしは 403。
 */
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { sql } from "drizzle-orm";
import { authRequired } from "../../middleware/auth.js";
import type { AppEnv } from "../../types/index.js";
import { getNoteRole } from "./helpers.js";

/**
 * ILIKE に渡すユーザー入力のメタ文字をエスケープする。
 * Escapes ILIKE meta characters in user-supplied search text.
 */
function escapeLike(input: string): string {
  return input.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

/**
 * クエリ文字列の `limit` を有限の整数に正規化し、1〜100 の範囲へクランプする。
 *
 * Normalizes the `limit` query param to a finite integer clamped to 1..100.
 */
function clampLimit(raw: string | undefined): number {
  const parsed = raw === undefined ? 20 : Number(raw);
  const safe = Number.isFinite(parsed) ? Math.trunc(parsed) : 20;
  return Math.min(Math.max(safe, 1), 100);
}

const app = new Hono<AppEnv>();

app.get("/:noteId/search", authRequired, async (c) => {
  const noteId = c.req.param("noteId");
  const userId = c.get("userId");
  const userEmail = c.get("userEmail");
  const db = c.get("db");

  const query = c.req.query("q")?.trim();
  if (!query) {
    return c.json({ results: [] });
  }

  const { role, note } = await getNoteRole(noteId, userId, userEmail, db);
  if (!note) throw new HTTPException(404, { message: "Note not found" });
  if (!role) throw new HTTPException(403, { message: "Forbidden" });

  const limit = clampLimit(c.req.query("limit"));
  const pattern = `%${escapeLike(query)}%`;

  const results = await db.execute(sql`
    SELECT p.id, p.title, p.content_preview, p.updated_at, p.note_id,
           pc.content_text
    FROM pages p
    LEFT JOIN page_contents pc ON pc.page_id = p.id
    WHERE p.is_deleted = false
      AND p.note_id = ${noteId}
      AND (
        p.title ILIKE ${pattern}
        OR pc.content_text ILIKE ${pattern}
      )
    ORDER BY p.updated_at DESC
    LIMIT ${limit}
  `);

  return c.json({ results: results.rows });
});

export default app;
