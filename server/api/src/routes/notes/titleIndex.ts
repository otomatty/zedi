/**
 * /api/notes/:noteId/page-titles — ノート配下の全ページの id / title /
 * is_deleted / updated_at だけを返す軽量エンドポイント（Issue #860 Phase 6）。
 *
 * Phase 6 で `GET /api/notes/:noteId` から `pages[]` を撤去するのに合わせ、
 * wiki link の解決や AI chat scope のように「ノート全ページのタイトル
 * インデックス」を必要とする経路向けに、最小 payload で完全集合を返す
 * 専用ルートを切り出す。preview / thumbnail / source_url 等は返さないため、
 * 1 万ページ規模でも約 500KB 程度に収まり、`GET /api/notes/:id/pages` の
 * cursor pagination とは異なり「すべてのタイトルが必要」な consumer 向け
 * の代替となる。
 *
 * `GET /api/notes/:noteId/page-titles` — minimal payload listing every active
 * page in a note as `{ id, title, is_deleted, updated_at }` (Issue #860 Phase
 * 6). Phase 6 removes `pages[]` from the note-shell response, but consumers
 * such as wiki-link resolution and AI-chat scope require the *complete*
 * title set across the note. This route serves that need with a payload an
 * order of magnitude smaller than the legacy `pages[]` (no preview,
 * thumbnail, or source_url), keeping ~500KB even at 10k pages. It is the
 * complement to the cursor-paginated `/pages` window endpoint added in
 * Phase 1, which is for visible UI lists rather than full-set lookups.
 *
 * Auth model: `authOptional` + `getNoteRole` mirrors Phase 1's `/pages`
 * endpoint, letting public / unlisted notes be queried by guests while
 * private notes still 403 callers without a role.
 */
import { createHash } from "node:crypto";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { eq, and, desc, sql } from "drizzle-orm";
import { pages } from "../../schema/index.js";
import { authOptional } from "../../middleware/auth.js";
import type { AppEnv } from "../../types/index.js";
import type { NotePageTitleItem, NotePageTitleIndexResponse } from "./types.js";
import { getNoteRole } from "./helpers.js";
import { ifNoneMatchMatches } from "./crud.js";

/**
 * `GET /api/notes/:noteId/page-titles` のレスポンス形状バージョン。ETag に混ぜる
 * ことで、サーバ側で形状を変えた直後にクライアントが古い `If-None-Match` を
 * 送ってきても 304 で旧 body をキャッシュ再利用させない。形状を変えたら必ず
 * bump する。
 *
 * Response-shape version for `GET /api/notes/:noteId/page-titles`. Mixed into
 * the ETag so that stale `If-None-Match` validators cannot revive an outdated
 * cached body via 304 after a wire-shape change. Bump whenever the shape
 * changes.
 */
const TITLE_INDEX_RESPONSE_VERSION = "v1";

/**
 * `Date | string | null` のいずれで来ても安全に epoch ms に正規化するヘルパー。
 * `crud.ts` の `toEpochMillis` と同じ defensive 設計（Issue #857 / PR #856 の
 * 経験を踏襲: drizzle の `sql<T>` テンプレートタグは型ヒントだけで、pg
 * ドライバ次第で `MAX(updated_at)` のような raw SQL 集約は ISO 文字列のまま
 * 返ってくる場合がある）。
 *
 * Normalizes `Date | string | null` to epoch milliseconds. Mirrors the
 * defensive pattern in `crud.ts#toEpochMillis` (driven by the Issue #857 /
 * PR #856 regression where `MAX(updated_at)` arrived from the pg driver as
 * a raw ISO string instead of a `Date`).
 */
function toEpochMillis(value: Date | string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const parsed = value instanceof Date ? value : new Date(value);
  const ms = parsed.getTime();
  // 不正な文字列 / Invalid Date は `NaN` を返す。ETag では `null` と同じく 0 に
  // 倒すことで「壊れた入力同士を別ハッシュにしてしまう」事故を避ける。
  //
  // Invalid input yields `NaN` from `getTime()`. Fall back to 0 so malformed
  // inputs hash the same way as `null` rather than splicing the literal
  // string `"NaN"` into the digest.
  return Number.isNaN(ms) ? 0 : ms;
}

/**
 * Title-index レスポンス用の weak ETag を計算する。`note_id`・呼び出し元の
 * role・active なページの `MAX(updated_at)` と件数を混ぜることで、ページ
 * 追加・タイトル変更・ハード削除いずれでも ETag が変わる。
 *
 * Generates a weak ETag for the title-index response. Mixing the note id,
 * resolved role, and the `(MAX(updated_at), COUNT)` page signal ensures the
 * ETag shifts on any page-level mutation (add, rename, hard delete).
 */
function makeTitleIndexETag(
  noteId: string,
  role: string,
  pagesMaxUpdatedAt: Date | string | null,
  pagesCount: number,
): string {
  const hash = createHash("sha1")
    .update(
      `${TITLE_INDEX_RESPONSE_VERSION}:${noteId}:${role}:${toEpochMillis(pagesMaxUpdatedAt)}:${pagesCount}`,
    )
    .digest("base64url")
    .slice(0, 22);
  return `W/"${hash}"`;
}

const app = new Hono<AppEnv>();

// ── GET /:noteId/page-titles ────────────────────────────────────────────────
app.get("/:noteId/page-titles", authOptional, async (c) => {
  const noteId = c.req.param("noteId");
  const userId = c.get("userId");
  const userEmail = c.get("userEmail");
  const db = c.get("db");

  const { role, note } = await getNoteRole(noteId, userId, userEmail, db);
  if (!note) throw new HTTPException(404, { message: "Note not found" });
  if (!role) throw new HTTPException(403, { message: "Forbidden" });

  // ETag 用の `MAX(updated_at) + COUNT(*)` 集約。`crud.ts` と同じく
  // `idx_pages_note_active_updated_id` (Phase 2 で追加) により index-only で
  // 解決される。`.mapWith()` は pg ドライバが集約値を ISO 文字列のまま返してくる
  // ケース (Issue #857) を境界で吸収する。
  //
  // Aggregate `MAX(updated_at) + COUNT(*)` for the ETag, resolved index-only
  // by `idx_pages_note_active_updated_id` (Phase 2). `.mapWith()` coerces the
  // aggregate to `Date | null` at the query boundary so the pg driver's
  // occasional ISO-string return path (Issue #857) cannot reach the hasher.
  const signalRows = await db
    .select({
      maxUpdatedAt: sql<Date | null>`MAX(${pages.updatedAt})`.mapWith((value): Date | null => {
        if (value === null || value === undefined) return null;
        return value instanceof Date ? value : new Date(value as string);
      }),
      count: sql<number>`COUNT(*)::int`,
    })
    .from(pages)
    .where(and(eq(pages.noteId, noteId), eq(pages.isDeleted, false)));
  const signal = signalRows[0] ?? { maxUpdatedAt: null, count: 0 };

  const etag = makeTitleIndexETag(noteId, role, signal.maxUpdatedAt, signal.count);
  c.header("ETag", etag);
  c.header("Cache-Control", "private, must-revalidate");
  c.header("Vary", "Cookie");

  // クライアントの `If-None-Match` が一致したら body と本体クエリをまとめて
  // スキップする。集約は既に走らせているため、304 経路でも DB は 1 ノート
  // ロール解決 + 1 集約の合計 2 件しか叩かない。
  //
  // Short-circuit with 304 when the client's `If-None-Match` matches the
  // current ETag. The aggregate already ran, so the 304 path costs only
  // role-resolution + the signal aggregate (no body, no list query).
  const ifNoneMatch = c.req.header("If-None-Match");
  if (ifNoneMatchMatches(ifNoneMatch, etag)) {
    return c.body(null, 304);
  }

  const rows = await db
    .select({
      id: pages.id,
      title: pages.title,
      isDeleted: pages.isDeleted,
      updatedAt: pages.updatedAt,
    })
    .from(pages)
    .where(and(eq(pages.noteId, noteId), eq(pages.isDeleted, false)))
    .orderBy(desc(pages.updatedAt), desc(pages.id));

  const items: NotePageTitleItem[] = rows.map((p) => ({
    id: p.id,
    // タイトル未設定のページも consumer 側でハンドルできるよう空文字に正規化する
    // （wiki link 解決や添加 dialog の重複判定はタイトル文字列を直接比較するため）。
    //
    // Normalize untitled pages to an empty string so consumers can compare
    // titles directly (wiki-link resolution and the add-dialog dedup both
    // hash titles as plain strings).
    title: p.title ?? "",
    is_deleted: p.isDeleted,
    updated_at: p.updatedAt,
  }));

  const response: NotePageTitleIndexResponse = { items };
  return c.json(response);
});

export default app;
