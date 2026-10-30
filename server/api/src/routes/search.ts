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
 *
 * 結果の各行は `kind: "page"` を持つ（PDF ハイライト検索はデスクトップ版とともに削除した）。
 * Every row carries `kind: "page"` (PDF highlight search was removed with the desktop app).
 */
import { Hono } from "hono";
import { authRequired } from "../middleware/auth.js";
import type { AppEnv } from "../types/index.js";
import { searchUserWikiPages } from "../services/wikiSearchService.js";

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

  // ページ検索は `services/wikiSearchService.ts` に切り出した純粋関数を経由する。
  // SQL は元 route と同一を維持しつつ、tool / subgraph (#949) からも再利用可能に
  // するための移譲。`content_text` を SELECT に出さないポリシー、scope=shared での
  // owner / accepted member / domain rule 結合、`scope=own` の default-note 絞り込み
  // はすべて service 側で踏襲する。
  //
  // Page search is delegated to `wikiSearchService.searchUserWikiPages` so the
  // research-loop subgraph (#949) can call the same data set without going
  // through Hono context. The SQL is preserved verbatim; the previously-reviewed
  // safety properties (no full body in SELECT, default-note scoping, domain
  // predicate) live in the service module now.
  const userEmail = typeof userEmailRaw === "string" ? userEmailRaw : null;
  const pageHits =
    scope === "shared"
      ? await searchUserWikiPages(db, userId, userEmail, query, "shared", limit)
      : await searchUserWikiPages(db, userId, userEmail, query, "own", limit);

  // `scope=own` でデフォルトノートが無いユーザーは pageHits === [] になる。
  // For `scope=own` with no default note, `pageHits` is empty.
  const taggedPageRows = pageHits.map((hit) => ({
    kind: "page" as const,
    id: hit.pageId,
    note_id: hit.noteId,
    // `owner_id` / `thumbnail_url` / `source_url` は将来 SELECT に追加する想定の
    // プレースホルダ。Placeholders for columns not yet in SELECT.
    owner_id: null,
    title: hit.title,
    content_preview: hit.contentPreview,
    thumbnail_url: null,
    source_url: null,
    updated_at: hit.updatedAt,
  }));

  return c.json({ results: taggedPageRows });
});

export default app;
