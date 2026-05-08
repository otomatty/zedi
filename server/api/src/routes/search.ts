/**
 * /api/search — 全文検索
 *
 * GET /api/search?q=&scope= — ILIKE による全文検索 (pg_trgm GIN インデックスで高速化)
 *
 * スコープ契約 (Issue #823):
 * - `scope=own` は呼び出し元のデフォルトノート（マイノート）配下のページのみ。
 * - `scope=shared` はオーナー / 受諾済みメンバー / ドメインルールでアクセス可能な
 *   ノートに所属するページを横断する。
 *
 * Scope contract (issue #823):
 * - `scope=own` restricts to pages under the caller's default note.
 * - `scope=shared` spans pages in notes the caller can access (owner, accepted
 *   member, or domain rule).
 */
import { Hono } from "hono";
import { sql } from "drizzle-orm";
import { authRequired } from "../middleware/auth.js";
import type { AppEnv } from "../types/index.js";
import { extractEmailDomain } from "../lib/freeEmailDomains.js";
import { getDefaultNoteOrNull } from "../services/defaultNoteService.js";

function escapeLike(input: string): string {
  return input.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function clampLimit(raw: string | undefined): number {
  const parsed = raw === undefined ? 20 : Number(raw);
  const safe = Number.isFinite(parsed) ? Math.trunc(parsed) : 20;
  return Math.min(Math.max(safe, 1), 100);
}

const app = new Hono<AppEnv>();

app.get("/", authRequired, async (c) => {
  const userId = c.get("userId");
  const userEmailRaw = c.get("userEmail");
  const db = c.get("db");

  const query = c.req.query("q")?.trim();
  if (!query) {
    return c.json({ results: [] });
  }

  const scope = c.req.query("scope") || "own";
  const limit = clampLimit(c.req.query("limit"));
  const pattern = `%${escapeLike(query)}%`;

  const searchColumns = sql`p.id, p.title, p.content_preview, p.updated_at, p.note_id,
             pc.content_text`;

  const normalizedEmail = typeof userEmailRaw === "string" ? userEmailRaw.trim().toLowerCase() : "";
  const emailDomain = extractEmailDomain(normalizedEmail);

  const domainPredicate =
    emailDomain !== null
      ? sql`OR EXISTS (
          SELECT 1
          FROM notes n
          INNER JOIN note_domain_access nda ON nda.note_id = n.id
          WHERE n.id = p.note_id
            AND n.is_deleted = false
            AND nda.is_deleted = false
            AND nda.domain = ${emailDomain}
        )`
      : sql``;

  let results;

  if (scope === "shared") {
    results = await db.execute(sql`
      SELECT ${searchColumns}
      FROM pages p
      LEFT JOIN page_contents pc ON pc.page_id = p.id
      WHERE p.is_deleted = false
        AND (
          EXISTS (
            SELECT 1 FROM notes n
            WHERE n.id = p.note_id AND n.is_deleted = false AND n.owner_id = ${userId}
          )
          OR EXISTS (
            SELECT 1
            FROM notes n
            INNER JOIN note_members nm ON nm.note_id = n.id
            INNER JOIN "user" u ON LOWER(u.email) = LOWER(nm.member_email)
            WHERE n.id = p.note_id
              AND u.id = ${userId}
              AND nm.status = 'accepted'
              AND nm.is_deleted = false
              AND n.is_deleted = false
          )
          ${domainPredicate}
        )
        AND (
          p.title ILIKE ${pattern}
          OR pc.content_text ILIKE ${pattern}
        )
      ORDER BY p.updated_at DESC
      LIMIT ${limit}
    `);
  } else {
    const defaultNote = await getDefaultNoteOrNull(db, userId);
    if (!defaultNote) {
      return c.json({ results: [] });
    }
    results = await db.execute(sql`
      SELECT ${searchColumns}
      FROM pages p
      LEFT JOIN page_contents pc ON pc.page_id = p.id
      WHERE p.is_deleted = false
        AND p.note_id = ${defaultNote.id}
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
