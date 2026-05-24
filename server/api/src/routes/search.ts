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
 * PDF ハイライト統合 (Issue #864 / #389 follow-up):
 * - 同じ検索 q を用いて `pdf_highlights.text` も対象に含める。
 * - ハイライトは常に呼び出し元 (`owner_id = userId`) 所有のみを返し、scope に依らず
 *   他ユーザーに漏れない（テーブル単体で所有者を持つ前提）。
 * - 元ソースが `kind="pdf_local"` のもののみ対象（JOIN で防御的にフィルタ）。
 * - レスポンスは `kind` 識別子付きの discriminated union で返す
 *   (`kind="page"` / `kind="pdf_highlight"`)。クライアントはこれで分岐する。
 * - 環境変数 `PDF_HIGHLIGHT_SEARCH_DISABLED=1` をセットすると、ハイライト検索だけを
 *   無効化できる（運用上のセーフティ）。ページ検索には影響しない。
 *
 * PDF highlight integration (Issue #864, follow-up to #389):
 * - The same query string also probes `pdf_highlights.text`.
 * - Highlights are only returned to their owner — scope does NOT widen this; the
 *   table has a denormalized `owner_id` precisely for this case.
 * - Defensive `JOIN sources` ensures we never surface highlights whose owning
 *   source row is somehow not `kind="pdf_local"` anymore.
 * - The response is now a discriminated union tagged by `kind`:
 *   `"page"` (existing rows) and `"pdf_highlight"` (new rows). Clients branch on
 *   `kind` and the highlight rows carry `source_id` / `pdf_page` / `highlight_id`
 *   / `derived_page_id` so the UI can deep-link back to the PDF viewer or the
 *   derived Zedi page.
 * - Set `PDF_HIGHLIGHT_SEARCH_DISABLED=1` to disable just the highlight part
 *   (kill switch); page search is unaffected.
 */
import { Hono } from "hono";
import { sql } from "drizzle-orm";
import { authRequired } from "../middleware/auth.js";
import type { AppEnv } from "../types/index.js";
import { searchUserWikiPages } from "../services/wikiSearchService.js";

function escapeLike(input: string): string {
  return input.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function clampLimit(raw: string | undefined): number {
  const parsed = raw === undefined ? 20 : Number(raw);
  const safe = Number.isFinite(parsed) ? Math.trunc(parsed) : 20;
  return Math.min(Math.max(safe, 1), 100);
}

/**
 * ハイライト検索のキルスイッチ。`PDF_HIGHLIGHT_SEARCH_DISABLED=1` or `=true` で有効。
 * Kill switch for the highlight search branch.
 */
function isPdfHighlightSearchDisabled(): boolean {
  const v = (process.env.PDF_HIGHLIGHT_SEARCH_DISABLED ?? "").trim().toLowerCase();
  return v === "1" || v === "true";
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
  // ハイライト検索は所有さえあれば走り得るので、ページ無しでも続行する。
  // For `scope=own` with no default note, `pageHits` is empty; highlight search
  // is still meaningful since highlights are owner-keyed.
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

  const highlightRows = await runPdfHighlightSearch(db, userId, pattern, limit);

  // PR #873 review (codex, CodeRabbit): 両 review の指摘を両立させるため予約枠方式を採る。
  //
  // - codex: 各クエリが `LIMIT ${limit}` を持ち、連結すると最大 2*limit 行返り得る。
  //   `limit` をハード上限として尊重する必要がある。
  // - CodeRabbit: 単純な `.slice(0, limit)` だとページが `limit` 件以上ある状況で
  //   ハイライトが全て削られ、Issue #864 の目的（ハイライトを検索結果に乗せる）が壊れる。
  //
  // 解決策: ハイライトに最低 `ceil(limit / HIGHLIGHT_RESERVED_RATIO)` 件の予約枠を
  // 確保し、残りをページで埋める。ハイライトが予約枠より少なければ余りはページに
  // 戻す。結果として `総数 ≤ limit` を守りつつ、ハイライトが必ず一定数は載る。
  // 種別を跨いだ最終ランキングはクライアント側のスコアリング層に任せる。
  //
  // PR #873 review (codex, CodeRabbit): reserved-budget merge that satisfies
  // both concerns simultaneously.
  //
  // - codex: each branch applies `LIMIT ${limit}`, so a naïve concat could
  //   return up to 2*limit rows and break the contract.
  // - CodeRabbit: a naïve `.slice(0, limit)` lets pages crowd out highlights
  //   entirely once there are >= `limit` pages, defeating Issue #864.
  //
  // The fix reserves a minimum of `ceil(limit / HIGHLIGHT_RESERVED_RATIO)`
  // slots for highlights and gives the remainder to pages; the reserved
  // budget shrinks if there aren't that many highlights so pages can spill
  // back into it. Total is always <= `limit`, and highlights are never
  // starved when they exist. Cross-kind ranking still happens on the client.
  const HIGHLIGHT_RESERVED_RATIO = 4;
  const highlightReserved = Math.min(
    highlightRows.length,
    Math.max(1, Math.ceil(limit / HIGHLIGHT_RESERVED_RATIO)),
  );
  const pageQuota = limit - highlightReserved;
  const cappedPages = taggedPageRows.slice(0, pageQuota);
  // ページが quota より少なかった場合、余り枠をハイライトに回す。
  // Spill leftover capacity to highlights when there are fewer pages than the quota.
  const cappedHighlights = highlightRows.slice(0, limit - cappedPages.length);

  return c.json({ results: [...cappedPages, ...cappedHighlights] });
});

/**
 * `pdf_highlights` を所有検証付きで検索し、`kind="pdf_highlight"` 行を返す。
 * 戻り値は `c.json` にそのまま流せる形に整える（snake_case のキー）。
 *
 * Searches `pdf_highlights` for the caller's own highlights only and returns
 * a list of `kind: "pdf_highlight"` rows shaped for `c.json` (snake_case).
 *
 * @param db    リクエストの drizzle DB ハンドル。Drizzle DB handle from the request.
 * @param userId 呼び出し元ユーザー ID。Owner filter — only the caller's rows are returned.
 * @param pattern ILIKE 用にエスケープ済みのパターン。Pre-escaped ILIKE pattern.
 * @param limit 結果上限。Maximum number of rows to return.
 */
async function runPdfHighlightSearch(
  db: AppEnv["Variables"]["db"],
  userId: string,
  pattern: string,
  limit: number,
): Promise<Array<Record<string, unknown>>> {
  if (isPdfHighlightSearchDisabled()) return [];

  // Issue #889 Phase 3: 派生ページの所属ノート ID もまとめて返す。
  // クライアント側 (`resolveSearchResultUrl`) が `/notes/:noteId/:pageId` を
  // 組み立てるため、`/pages/:id` 廃止後は `derived_page_note_id` が必須。
  // Issue #889 Phase 3: include the derived page's `note_id` so the client
  // can build `/notes/:noteId/:pageId` after the `/pages/:id` route was
  // retired.
  const result = await db.execute(sql`
    SELECT
      h.id          AS highlight_id,
      h.source_id   AS source_id,
      h.owner_id    AS owner_id,
      h.pdf_page    AS pdf_page,
      h.text        AS text,
      h.derived_page_id AS derived_page_id,
      p.note_id     AS derived_page_note_id,
      h.updated_at  AS updated_at,
      s.display_name AS source_display_name,
      s.title       AS source_title
    FROM pdf_highlights h
    INNER JOIN sources s ON s.id = h.source_id
    LEFT JOIN pages p ON p.id = h.derived_page_id
    WHERE h.owner_id = ${userId}
      AND s.kind = 'pdf_local'
      AND h.text ILIKE ${pattern}
    ORDER BY h.updated_at DESC
    LIMIT ${limit}
  `);

  return result.rows.map((row) => ({
    ...(row as Record<string, unknown>),
    kind: "pdf_highlight" as const,
  }));
}

export default app;
