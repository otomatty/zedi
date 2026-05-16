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

  // 検索条件用にだけ `content_text` を WHERE に登場させるが、SELECT には含めない。
  // SELECT に流すと API 経由でページ本文が丸ごと露出し得る（PR #873 review:
  // CodeRabbit）。クライアントが消費するのは `content_preview` のみ。
  //
  // `content_text` is used in the WHERE clause for matching but is NOT in the
  // SELECT list — otherwise the API would leak full page bodies (PR #873 review:
  // CodeRabbit). Clients only consume `content_preview`.
  const searchColumns = sql`p.id, p.title, p.content_preview, p.updated_at, p.note_id`;

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

  let pageRows: unknown[] = [];

  if (scope === "shared") {
    const sharedResults = await db.execute(sql`
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
    pageRows = sharedResults.rows;
  } else {
    const defaultNote = await getDefaultNoteOrNull(db, userId);
    if (!defaultNote) {
      // デフォルトノートが無い場合でもハイライト検索は走り得るので、ページ部だけ空配列に。
      // Even without a default note, highlight search can still run, so only the
      // page branch short-circuits here.
      const highlightRows = await runPdfHighlightSearch(db, userId, pattern, limit);
      return c.json({ results: highlightRows });
    }
    const ownResults = await db.execute(sql`
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
    pageRows = ownResults.rows;
  }

  // 契約フィールドのみを明示マップして response に流す。SQL の SELECT に直接含まれない
  // カラム (owner_id / thumbnail_url / source_url) は明示的に null/undefined で埋めて
  // 型 (`SearchPageResultRow`) との整合を取る。raw row を spread で流すと将来 SELECT
  // を増やしたとき静かに API が漏れるので、PR #873 review (CodeRabbit) で明示化した。
  //
  // Map only the contracted fields explicitly. We do not spread raw SQL rows
  // because any future SELECT addition would silently widen the API payload
  // (PR #873 review: CodeRabbit). Columns not in the current SELECT are
  // emitted as `null`/`undefined` to stay aligned with `SearchPageResultRow`.
  const taggedPageRows = pageRows.map((row) => {
    const r = row as {
      id: string;
      note_id: string;
      title: string | null;
      content_preview: string | null;
      updated_at: string;
    };
    return {
      kind: "page" as const,
      id: r.id,
      note_id: r.note_id,
      // `owner_id` / `thumbnail_url` / `source_url` は将来 SELECT に追加する想定の
      // プレースホルダ。現状の SQL では返らないので明示的に null/undefined を入れる。
      // Placeholders for columns not yet in SELECT; emitted explicitly so the
      // payload shape stays stable for the discriminated union.
      owner_id: null,
      title: r.title,
      content_preview: r.content_preview,
      thumbnail_url: null,
      source_url: null,
      updated_at: r.updated_at,
    };
  });

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

  const result = await db.execute(sql`
    SELECT
      h.id          AS highlight_id,
      h.source_id   AS source_id,
      h.owner_id    AS owner_id,
      h.pdf_page    AS pdf_page,
      h.text        AS text,
      h.derived_page_id AS derived_page_id,
      h.updated_at  AS updated_at,
      s.display_name AS source_display_name,
      s.title       AS source_title
    FROM pdf_highlights h
    INNER JOIN sources s ON s.id = h.source_id
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
