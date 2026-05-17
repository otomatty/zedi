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

  // ETag 用のシグナル集約。3 テーブル × (MAX + COUNT) = 6 値だが、いずれも
  // インデックスから安価に取得できる: `idx_pages_note_active_updated_id`,
  // `idx_links_source_id` + `idx_links_link_type`, `idx_ghost_links_source_page_id`
  // + `idx_ghost_links_link_type`。1 つの SELECT に scalar subquery で詰める
  // ことで往復回数を抑える。
  //
  // ETag signal aggregation. Three tables × (MAX + COUNT) = six values, each
  // resolvable from existing indexes. Folding them into a single SELECT via
  // scalar subqueries keeps the round-trip count to 1.
  const signalRows = await db.execute(sql`
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
      ) AS ghost_count
  `);
  const signal =
    (signalRows as unknown as { rows: Array<Record<string, unknown>> }).rows?.[0] ?? {};
  const pagesMaxUpdatedAt = (signal.pages_max_updated_at as Date | string | null) ?? null;
  const pagesCount = Number(signal.pages_count ?? 0);
  const linksMaxCreatedAt = (signal.links_max_created_at as Date | string | null) ?? null;
  const linksCount = Number(signal.links_count ?? 0);
  const ghostMaxCreatedAt = (signal.ghost_max_created_at as Date | string | null) ?? null;
  const ghostCount = Number(signal.ghost_count ?? 0);

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
  // 同じ key (`LOWER(name)`) で UNION し、外側で sum/合成して 1 行 / キーに
  // まとめる。`resolved` は「すべての出現が links 経由か」のフラグなので、
  // ghost_count = 0 で判定する。表示名は resolved 側 (links) の `pages.title`
  // を優先する (`tag_display_name_resolved`)。それも無い場合は ghost 側の
  // 最初の表記にフォールバック。
  //
  // Main aggregation. Resolved tags (via `links` → tag-page `title`) and
  // unresolved tags (via `ghost_links.link_text`) are unioned on a
  // case-insensitive key and summed in the outer SELECT. `resolved` is true
  // only when the ghost contribution is 0. Display name prefers the
  // resolved-side `pages.title`; falls back to the first ghost spelling.
  const tagRows = await db.execute(sql`
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
        (SELECT display_name FROM merged m2
           WHERE m2.name_lower = merged.name_lower AND m2.origin = 'resolved'
           LIMIT 1),
        (SELECT display_name FROM merged m3
           WHERE m3.name_lower = merged.name_lower
           LIMIT 1)
      ) AS display_name,
      COUNT(DISTINCT source_id)::int AS page_count,
      bool_and(origin = 'resolved') AS resolved
    FROM merged
    GROUP BY name_lower
    ORDER BY page_count DESC, name_lower ASC
  `);
  const items: NoteTagAggregationItem[] = (
    tagRows as unknown as { rows: Array<Record<string, unknown>> }
  ).rows.map((r) => ({
    name: typeof r.display_name === "string" ? r.display_name : String(r.name_lower ?? ""),
    name_lower: String(r.name_lower ?? ""),
    page_count: Number(r.page_count ?? 0),
    resolved: r.resolved === true,
  }));

  // 「タグなし」件数: 同じノートのアクティブページのうち、`links` / `ghost_links`
  // どちらにも `link_type='tag'` の出辺を持たないものをカウントする。
  //
  // "Untagged page" count: active pages in the note with no outgoing
  // `link_type='tag'` edge in either table.
  const noneCountRows = await db.execute(sql`
    SELECT COUNT(*)::int AS none_count
    FROM pages s
    WHERE s.note_id = ${noteId}::uuid
      AND s.is_deleted = false
      AND NOT EXISTS (
        SELECT 1 FROM links l WHERE l.source_id = s.id AND l.link_type = 'tag'
      )
      AND NOT EXISTS (
        SELECT 1 FROM ghost_links gl WHERE gl.source_page_id = s.id AND gl.link_type = 'tag'
      )
  `);
  const noneCount = Number(
    (noneCountRows as unknown as { rows: Array<Record<string, unknown>> }).rows?.[0]?.none_count ??
      0,
  );

  const response: NoteTagAggregationResponse = {
    items,
    none_count: noneCount,
    total_pages: pagesCount,
  };
  return c.json(response);
});

export default app;
