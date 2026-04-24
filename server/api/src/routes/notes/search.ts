/**
 * /api/notes/:noteId/search — ノートスコープ全文検索 (Issue #718 Phase 5-2)
 *
 * GET /:noteId/search?q=&limit= — 指定ノート内のページに限定した ILIKE 検索。
 *
 * スコープ契約 (Issue #713 / #718):
 * - 結果は `note_pages` で当該ノートにひも付くページのみ。ノートネイティブ
 *   (`pages.note_id = :noteId`) もリンク済み個人ページ (`note_pages` で結ばれた
 *   `note_id IS NULL` の個人ページ) も両方含む。`p.note_id` を必ず返すので
 *   呼び出し側は両者を区別できる。
 * - 閲覧権限は `getNoteRole` で解決し、任意のロール（owner / editor / viewer /
 *   guest）が解決できれば検索を許可する。private ノートの非メンバーは 403。
 * - クロススコープ検索（他ノート・個人 /home を横断）はこのエンドポイントでは
 *   扱わない（混在グローバル検索は従来どおり `/api/search?scope=shared`）。
 *
 * Scope contract (Issue #713 / #718):
 * - Results are restricted to pages linked to this note via `note_pages` —
 *   both note-native pages (`pages.note_id = :noteId`) and linked personal
 *   pages show up through that table, since every "add to note" path writes a
 *   `note_pages` row. `p.note_id` is always included so callers can tell the
 *   two apart.
 * - Read permission is resolved through `getNoteRole`; any resolved role
 *   (owner / editor / viewer / guest) allows searching. Non-members of a
 *   private note get 403.
 * - Cross-scope lookups (spanning other notes or personal /home) are out of
 *   scope here; mixed global search still lives at `/api/search?scope=shared`.
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
 * 非数値（`?limit=abc`）や `NaN` / 小数は既定値 20 にフォールバックさせて
 * `LIMIT NaN` による SQL エラーを防ぐ。
 *
 * Normalizes the `limit` query param to a finite integer clamped to 1..100.
 * Non-numeric inputs (`?limit=abc`) and non-finite / fractional values fall
 * back to the default 20 so a malformed query can't emit `LIMIT NaN` and 500
 * the request.
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
  // クエリが空なら DB を一切叩かずに即レスポンス。ノートの存在確認より前に
  // 短絡するのは `/api/search` と同じ挙動で、フォーカスのたびに撃たれる検索が
  // 無駄な権限解決で詰まらないようにするため。
  // Short-circuit before any DB work when q is empty, mirroring /api/search.
  // Autocomplete-style UI hits this on every keystroke, so skipping even role
  // resolution keeps the cost at zero.
  if (!query) {
    return c.json({ results: [] });
  }

  const { role, note } = await getNoteRole(noteId, userId, userEmail, db);
  if (!note) throw new HTTPException(404, { message: "Note not found" });
  if (!role) throw new HTTPException(403, { message: "Forbidden" });

  const limit = clampLimit(c.req.query("limit"));
  const pattern = `%${escapeLike(query)}%`;

  // `note_pages` に書かれている = このノートで表示対象のページ。ノートネイティブ
  // ページも、リンクされた個人ページも同じ経路で現れるので inner join で十分。
  // 返り値に `p.note_id` を含めて、呼び出し側が両者を判別できるようにする
  // （Phase 5 契約）。
  //
  // `note_pages` is the authoritative list of pages visible in a note, covering
  // both note-native pages and linked personal pages. An inner join is enough;
  // `p.note_id` is included so callers can still distinguish scope per row
  // (Phase 5 contract).
  const results = await db.execute(sql`
    SELECT p.id, p.title, p.content_preview, p.updated_at, p.note_id,
           pc.content_text
    FROM pages p
    INNER JOIN note_pages np
      ON np.page_id = p.id
     AND np.note_id = ${noteId}
     AND np.is_deleted = false
    LEFT JOIN page_contents pc ON pc.page_id = p.id
    WHERE p.is_deleted = false
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
