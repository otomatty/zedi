/**
 * `/api/notes/:noteId/tags` — ノート配下で使われているタグの集計エンドポイント。
 *
 * `/notes/:noteId` 上部のハッシュタグフィルタバーで「使用ページ数の多い順」に
 * チップを並べるためのデータソース。`links` (`link_type='tag'`) と
 * `ghost_links` (`link_type='tag'`) の両テーブルを横断し、case-insensitive な
 * キー (`LOWER(tag_name)`) でマージする。
 *
 * `GET /api/notes/:noteId/tags` — note-wide aggregation of hashtags
 * (`#name`) used as the data source for the tag filter bar on
 * `/notes/:noteId`. Walks `links` (`link_type='tag'`) and `ghost_links`
 * (`link_type='tag'`) for pages in the note and merges them on a
 * case-insensitive key (`LOWER(tag_name)`), ordered by distinct page count
 * descending.
 *
 * 「タグなしページ件数」(`none_count`) と「ノート内アクティブページ総数」
 * (`total_pages`) も同梱し、UI が「タグなし」チップを出すかの判定と全体件数
 * 表示に使えるようにする。
 *
 * Also returns `none_count` (active pages with no tag edge at all) and
 * `total_pages` (active pages in the note) so the UI can decide whether to
 * surface the "untagged" chip and how to label totals.
 *
 * Auth: `authOptional` + `getNoteRole` — public / unlisted ノートはゲスト閲覧可。
 * Auth model: `authOptional` + `getNoteRole`, same as `/pages` and
 * `/page-titles`; public / unlisted notes are reachable for guests, private
 * notes 403 for callers without a role.
 */
import { createHash } from "node:crypto";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { sql } from "drizzle-orm";
import { authOptional } from "../../middleware/auth.js";
import type { AppEnv } from "../../types/index.js";
import type { NoteTagAggregationItem, NoteTagAggregationResponse } from "./types.js";
import { getNoteRole } from "./helpers.js";
import { ifNoneMatchMatches } from "./crud.js";

/**
 * `GET /api/notes/:noteId/tags` のレスポンス形状バージョン。ETag に混ぜることで
 * サーバ側で形状を変えた直後にクライアントが古い `If-None-Match` を送ってきても
 * 304 で旧 body をキャッシュ再利用させない。
 *
 * Response-shape version for `GET /api/notes/:noteId/tags`. Mixed into the
 * ETag so stale validators cannot revive an outdated body via 304 after a
 * wire-shape change. Bump whenever the shape changes.
 */
const TAGS_RESPONSE_VERSION = "v1";

/**
 * 集計対象テーブルの最終変更時刻と件数から weak ETag を生成する。`pages` の
 * `MAX(updated_at)` + count と、`links` / `ghost_links` 双方の `MAX(created_at)`
 * + count を混ぜることで、ページ追加・タイトル変更・タグ追加削除いずれでも
 * ETag がずれる。
 *
 * Generate a weak ETag from the latest mutation timestamps and counts of the
 * tables that feed the aggregation. Mixing `pages.MAX(updated_at)` /
 * `links.MAX(created_at)` / `ghost_links.MAX(created_at)` with their counts
 * makes the ETag shift on any page mutation, tag insert, or tag delete.
 */
/**
 * `db.execute` の生戻り値から `rows` 配列を取り出すための薄いヘルパー。
 * pg ドライバ依存の型 (`QueryResult<Row>` 風) を `Array<Record<string, unknown>>`
 * に揃え、呼び出し側でローカルに `unknown` キャストを散らばらせない
 * (PR #897 Gemini medium レビュー)。
 *
 * Coerce a `db.execute` result into an `Array<Record<string, unknown>>` so
 * downstream column reads don't each need their own `unknown` cast
 * (PR #897 Gemini medium review). Driver-specific row shapes are reduced to a
 * single boundary cast here.
 */
function executeRows(result: unknown): Array<Record<string, unknown>> {
  const wrapper = result as { rows?: Array<Record<string, unknown>> };
  return wrapper.rows ?? [];
}

function makeTagsETag(
  noteId: string,
  role: string,
  pagesMaxUpdatedAt: Date | string | null,
  pagesCount: number,
  linksMaxCreatedAt: Date | string | null,
  linksCount: number,
  ghostMaxCreatedAt: Date | string | null,
  ghostCount: number,
): string {
  const epoch = (v: Date | string | null): number => {
    if (v === null) return 0;
    const ms = (v instanceof Date ? v : new Date(v)).getTime();
    return Number.isNaN(ms) ? 0 : ms;
  };
  const hash = createHash("sha1")
    .update(
      [
        TAGS_RESPONSE_VERSION,
        noteId,
        role,
        epoch(pagesMaxUpdatedAt),
        pagesCount,
        epoch(linksMaxCreatedAt),
        linksCount,
        epoch(ghostMaxCreatedAt),
        ghostCount,
      ].join(":"),
    )
    .digest("base64url")
    .slice(0, 22);
  return `W/"${hash}"`;
}

const app = new Hono<AppEnv>();

// ── GET /:noteId/tags ───────────────────────────────────────────────────────
app.get("/:noteId/tags", authOptional, async (c) => {
  const noteId = c.req.param("noteId");
  const userId = c.get("userId");
  const userEmail = c.get("userEmail");
  const db = c.get("db");

  const { role, note } = await getNoteRole(noteId, userId, userEmail, db);
  if (!note) throw new HTTPException(404, { message: "Note not found" });
  if (!role) throw new HTTPException(403, { message: "Forbidden" });

  // ETag 用のシグナル集約 + 「タグなしページ件数」を 1 つの SELECT に詰める。
  // 3 テーブル × (MAX + COUNT) と `none_count` の合計 7 値すべて、既存
  // インデックス (`idx_pages_note_active_updated_id`, `idx_links_source_id`
  // + `idx_links_link_type`, `idx_ghost_links_source_page_id` +
  // `idx_ghost_links_link_type`) から安価に解決できる。`none_count` の
  // `NOT EXISTS ... links` には削除済みタグページを除外する `is_deleted = false`
  // を付け、`pages.ts` の untagged predicate と挙動を揃える (PR #897 Codex P2)。
  //
  // Fold the ETag signal aggregation and the `none_count` query into a single
  // round-trip (PR #897 Gemini medium review). All seven scalars are
  // resolvable from existing indexes. The `none_count` NOT EXISTS on `links`
  // joins `pages.is_deleted = false` so pages whose only tag links target
  // soft-deleted pages still register as "untagged", matching the predicate
  // in `pages.ts` (PR #897 Codex P2).
  const signalRows = executeRows(
    await db.execute(sql`
      SELECT
        (SELECT MAX(updated_at) FROM pages WHERE note_id = ${noteId}::uuid AND is_deleted = false) AS pages_max_updated_at,
        (SELECT COUNT(*)::int FROM pages WHERE note_id = ${noteId}::uuid AND is_deleted = false) AS pages_count,
        (SELECT MAX(l.created_at)
           FROM links l
           JOIN pages s ON s.id = l.source_id
           WHERE s.note_id = ${noteId}::uuid AND s.is_deleted = false AND l.link_type = 'tag'
        ) AS links_max_created_at,
        (SELECT COUNT(*)::int
           FROM links l
           JOIN pages s ON s.id = l.source_id
           WHERE s.note_id = ${noteId}::uuid AND s.is_deleted = false AND l.link_type = 'tag'
        ) AS links_count,
        (SELECT MAX(gl.created_at)
           FROM ghost_links gl
           JOIN pages s ON s.id = gl.source_page_id
           WHERE s.note_id = ${noteId}::uuid AND s.is_deleted = false AND gl.link_type = 'tag'
        ) AS ghost_max_created_at,
        (SELECT COUNT(*)::int
           FROM ghost_links gl
           JOIN pages s ON s.id = gl.source_page_id
           WHERE s.note_id = ${noteId}::uuid AND s.is_deleted = false AND gl.link_type = 'tag'
        ) AS ghost_count,
        (SELECT COUNT(*)::int
           FROM pages s
           WHERE s.note_id = ${noteId}::uuid
             AND s.is_deleted = false
             AND NOT EXISTS (
               SELECT 1 FROM links l
               JOIN pages t ON t.id = l.target_id AND t.is_deleted = false
               WHERE l.source_id = s.id AND l.link_type = 'tag'
             )
             AND NOT EXISTS (
               SELECT 1 FROM ghost_links gl WHERE gl.source_page_id = s.id AND gl.link_type = 'tag'
             )
        ) AS none_count
    `),
  );
  const signal = signalRows[0] ?? {};
  const pagesMaxUpdatedAt = (signal.pages_max_updated_at as Date | string | null) ?? null;
  const pagesCount = Number(signal.pages_count ?? 0);
  const linksMaxCreatedAt = (signal.links_max_created_at as Date | string | null) ?? null;
  const linksCount = Number(signal.links_count ?? 0);
  const ghostMaxCreatedAt = (signal.ghost_max_created_at as Date | string | null) ?? null;
  const ghostCount = Number(signal.ghost_count ?? 0);
  const noneCount = Number(signal.none_count ?? 0);

  const etag = makeTagsETag(
    noteId,
    role,
    pagesMaxUpdatedAt,
    pagesCount,
    linksMaxCreatedAt,
    linksCount,
    ghostMaxCreatedAt,
    ghostCount,
  );
  c.header("ETag", etag);
  c.header("Cache-Control", "private, must-revalidate");
  c.header("Vary", "Cookie");

  const ifNoneMatch = c.req.header("If-None-Match");
  if (ifNoneMatchMatches(ifNoneMatch, etag)) {
    return c.body(null, 304);
  }

  // メイン集計: 解決済みタグ (links 経由) と未解決タグ (ghost_links 経由) を
  // 同じ key (`LOWER(name)`) で UNION し、外側で `GROUP BY name_lower` する。
  // 表示名は resolved 側の表記を優先 (resolved が無いキーは ghost 側の最小
  // 表記にフォールバック)。同じ `name_lower` に複数の表記が存在しても
  // `MIN(...) FILTER (...)` で決定的に選ぶ。`resolved` フラグは ghost 側の
  // 出現が 0 件かどうかで判定する。
  //
  // Main aggregation. Resolved tags (via `links` → tag-page `title`) and
  // unresolved tags (via `ghost_links.link_text`) are unioned on a
  // case-insensitive key and grouped in the outer SELECT. Display name comes
  // from `MIN(display_name) FILTER (origin = 'resolved')` (or `MIN(display_name)`
  // when no resolved row exists), avoiding both the per-group correlated
  // subqueries and the non-deterministic `LIMIT 1` flagged on the previous
  // revision (PR #897 Gemini medium / CodeRabbit minor reviews). `resolved`
  // is true only when the ghost contribution is zero.
  const tagRows = executeRows(
    await db.execute(sql`
      WITH resolved AS (
        SELECT
          LOWER(t.title) AS name_lower,
          t.title AS display_name,
          s.id AS source_id
        FROM pages s
        JOIN links l ON l.source_id = s.id AND l.link_type = 'tag'
        JOIN pages t ON t.id = l.target_id
        WHERE s.note_id = ${noteId}::uuid
          AND s.is_deleted = false
          AND t.is_deleted = false
          AND t.title IS NOT NULL
          AND LENGTH(TRIM(t.title)) > 0
      ),
      ghost AS (
        SELECT
          LOWER(gl.link_text) AS name_lower,
          gl.link_text AS display_name,
          s.id AS source_id
        FROM pages s
        JOIN ghost_links gl ON gl.source_page_id = s.id AND gl.link_type = 'tag'
        WHERE s.note_id = ${noteId}::uuid
          AND s.is_deleted = false
          AND LENGTH(TRIM(gl.link_text)) > 0
      ),
      merged AS (
        SELECT name_lower, display_name, source_id, 'resolved' AS origin FROM resolved
        UNION ALL
        SELECT name_lower, display_name, source_id, 'ghost' AS origin FROM ghost
      )
      SELECT
        name_lower,
        COALESCE(
          MIN(display_name) FILTER (WHERE origin = 'resolved'),
          MIN(display_name)
        ) AS display_name,
        COUNT(DISTINCT source_id)::int AS page_count,
        bool_and(origin = 'resolved') AS resolved
      FROM merged
      GROUP BY name_lower
      ORDER BY page_count DESC, name_lower ASC
    `),
  );
  const items: NoteTagAggregationItem[] = tagRows.map((r) => ({
    name: typeof r.display_name === "string" ? r.display_name : String(r.name_lower ?? ""),
    name_lower: String(r.name_lower ?? ""),
    page_count: Number(r.page_count ?? 0),
    resolved: r.resolved === true,
  }));

  const response: NoteTagAggregationResponse = {
    items,
    none_count: noneCount,
    total_pages: pagesCount,
  };
  return c.json(response);
});

export default app;
