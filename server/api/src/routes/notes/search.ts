/**
 * /api/notes/:noteId/search — ノートスコープ全文検索 (Issue #718 Phase 5-2 +
 * Issue #860 Phase 5)。
 *
 * GET /:noteId/search?q=&limit=&cursor= — 指定ノート内のページに限定した
 * ILIKE 検索。Issue #860 Phase 5 で `authOptional` + `getNoteRole` への移行
 * (公開 / unlisted ノートで guest 検索可) と keyset cursor pagination
 * (`(updated_at, id)`) を追加。`cursor` 未指定時の挙動 (= 先頭 window) は
 * 互換維持。
 *
 * スコープ契約 (Issue #823):
 * - 結果は `pages.note_id = :noteId` のページのみ。
 *
 * Scope contract (issue #823):
 * - Results are restricted to rows where `pages.note_id` matches the path param.
 * - Auth model is `authOptional` + role resolution via {@link getNoteRole}
 *   (Issue #860 Phase 5). Public / unlisted notes are reachable by `guest`
 *   callers without sign-in, mirroring `/api/notes/:noteId/pages`. Private /
 *   restricted notes still 403 callers without a resolved role.
 *
 * - 認証モデルは `authOptional` + `getNoteRole` (Issue #860 Phase 5)。
 *   `/api/notes/:noteId/pages` と整合させ、公開 / unlisted ノートは未ログインの
 *   guest からも検索可能。private / restricted ノートで role が解決しない
 *   呼び出し元には 403 を返す。
 */
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { sql } from "drizzle-orm";
import { authOptional } from "../../middleware/auth.js";
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

/**
 * 検索結果の keyset cursor。`ORDER BY updated_at DESC, id DESC` を一意に
 * 進めるための `(updated_at, id)` ペア。`/pages` の cursor と同じ思想で、
 * `updatedAt` はマイクロ秒精度を保つため pg 側 `to_char(...)` の ISO 文字列を
 * そのまま echo し、比較側で `::timestamptz` に再キャストする (Issue #860
 * Phase 1 で `/pages` に入れた精度保持戦略を踏襲)。
 *
 * Keyset cursor for search results encoding `(updated_at, id)`. Mirrors the
 * `/pages` cursor (Issue #860 Phase 1): keep the microsecond ISO string from
 * Postgres `to_char(...)` so the round trip preserves sub-millisecond
 * precision, and re-cast via `::timestamptz` for comparison so the JS `Date`
 * truncation does not silently skip rows that share a millisecond but
 * differ in microseconds.
 */
interface SearchCursor {
  /** Postgres-formatted ISO timestamp string with microsecond precision. */
  updatedAt: string;
  /** UUID of the last returned page in the previous window. */
  id: string;
}

/**
 * RFC 4122 系の UUID 文字列を許容する正規表現。pg の `uuid` カラムへ流す前に
 * cursor 由来の `id` を検証して、`22P02` 経由の 500 を避けるため使う。
 *
 * Permissive RFC 4122 UUID matcher. Used to gate cursor `id` before it
 * reaches the pg `uuid` column so malformed values become a deterministic
 * 400 instead of a `22P02` 500.
 */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Encodes a {@link SearchCursor} as opaque base64url JSON. Encoding is an
 * implementation detail; clients echo the `next_cursor` value verbatim.
 *
 * {@link SearchCursor} を不透明な base64url JSON にエンコードする。形式は
 * 実装詳細で、クライアントは受け取った `next_cursor` をそのまま echo する。
 */
function encodeSearchCursor(cursor: SearchCursor): string {
  const json = JSON.stringify(cursor);
  return Buffer.from(json, "utf8").toString("base64url");
}

/**
 * Decodes a client-provided cursor. Empty / malformed input returns `null`
 * (treated as "no cursor"); decodable but wrong-shaped input throws 400 so
 * cursors built outside this route do not silently fall through.
 *
 * クライアント由来の cursor をデコードする。空 / 壊れた入力は `null` を返し、
 * 「cursor 無し」と同じ扱いに倒す。デコードできたが形が違う場合は 400 を
 * 投げ、別経路で組み立てた cursor の誤用を弾く。
 */
function decodeSearchCursor(raw: string | undefined): SearchCursor | null {
  if (!raw || raw.length === 0) return null;
  let decoded: string;
  try {
    decoded = Buffer.from(raw, "base64url").toString("utf8");
  } catch {
    return null;
  }
  if (!decoded) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(decoded);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const updatedAtRaw = (parsed as { updatedAt?: unknown }).updatedAt;
  const idRaw = (parsed as { id?: unknown }).id;
  if (typeof updatedAtRaw !== "string" || typeof idRaw !== "string") {
    throw new HTTPException(400, { message: "Invalid cursor" });
  }
  const ts = new Date(updatedAtRaw);
  if (Number.isNaN(ts.getTime())) {
    throw new HTTPException(400, { message: "Invalid cursor" });
  }
  if (!UUID_PATTERN.test(idRaw)) {
    throw new HTTPException(400, { message: "Invalid cursor" });
  }
  return { updatedAt: updatedAtRaw, id: idRaw };
}

const app = new Hono<AppEnv>();

app.get("/:noteId/search", authOptional, async (c) => {
  const noteId = c.req.param("noteId");
  const userId = c.get("userId");
  const userEmail = c.get("userEmail");
  const db = c.get("db");

  const query = c.req.query("q")?.trim();
  if (!query) {
    return c.json({ results: [], next_cursor: null });
  }

  const { role, note } = await getNoteRole(noteId, userId, userEmail, db);
  if (!note) throw new HTTPException(404, { message: "Note not found" });
  if (!role) throw new HTTPException(403, { message: "Forbidden" });

  const limit = clampLimit(c.req.query("limit"));
  const cursor = decodeSearchCursor(c.req.query("cursor"));
  const pattern = `%${escapeLike(query)}%`;

  // keyset 条件: `(updated_at, id)` を `(c.updatedAt, c.id)` より小さい組に絞る。
  // `ORDER BY p.updated_at DESC, p.id DESC` と同じ向きで進めるため、
  // `updated_at < cursor.updatedAt OR (updated_at = cursor.updatedAt AND id < cursor.id)`
  // を使う。`/pages` と同じく cursor.updatedAt はマイクロ秒精度の ISO 文字列を
  // 保持しているため、比較は `::timestamptz` キャストで突合する。
  // `limit + 1` 件取得して、超過したら `next_cursor` を発行する。
  //
  // Keyset predicate paired with `ORDER BY p.updated_at DESC, p.id DESC`.
  // Mirrors the `/pages` cursor strategy: cast the cursor's microsecond ISO
  // string back via `::timestamptz` so precision survives end-to-end. Fetch
  // `limit + 1` rows so we can issue `next_cursor` without a separate count.
  const cursorPredicate = cursor
    ? sql`AND (
        p.updated_at < ${cursor.updatedAt}::timestamptz
        OR (p.updated_at = ${cursor.updatedAt}::timestamptz AND p.id < ${cursor.id})
      )`
    : sql``;

  const fetchLimit = limit + 1;

  // coderabbitai review on PR #868: `pc.content_text` は ILIKE の対象として
  // 必要だが、レスポンス body には載せない。`limit=100` で長文ページが並ぶと
  // 1 リクエストあたり数 MB に肥大化し、検索のレイテンシ + 帯域コストを
  // 悪化させる。SELECT からは外し、JOIN 側の ILIKE マッチだけ残す
  // （snippet 生成等が必要になれば別 `include` トークンで opt-in する）。
  //
  // PR #868 review (coderabbitai): keep `pc.content_text` out of the SELECT.
  // We still need the join for the ILIKE-on-body match, but returning the
  // full body would balloon each search response (megabytes per request at
  // limit=100 with long pages) for zero current benefit. If snippet
  // generation lands later, gate it behind an explicit `?include=` token.
  const result = await db.execute(sql`
    SELECT p.id, p.title, p.content_preview, p.updated_at, p.note_id,
           to_char(p.updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS updated_at_iso
    FROM pages p
    LEFT JOIN page_contents pc ON pc.page_id = p.id
    WHERE p.is_deleted = false
      AND p.note_id = ${noteId}
      AND (
        p.title ILIKE ${pattern}
        OR pc.content_text ILIKE ${pattern}
      )
      ${cursorPredicate}
    ORDER BY p.updated_at DESC, p.id DESC
    LIMIT ${fetchLimit}
  `);

  type SearchRow = {
    id: string;
    title: string | null;
    content_preview: string | null;
    updated_at: Date | string;
    note_id: string;
    updated_at_iso: string;
  };
  const rawRows = result.rows as SearchRow[];
  const hasMore = rawRows.length > limit;
  const visible = hasMore ? rawRows.slice(0, limit) : rawRows;
  const last = visible[visible.length - 1];
  const nextCursor =
    hasMore && last ? encodeSearchCursor({ updatedAt: last.updated_at_iso, id: last.id }) : null;

  // クライアントへ返すレスポンスからは `updated_at_iso` を落とす（cursor
  // 専用の内部フィールドなので公開 API 形には含めない）。
  // Strip the cursor-only `updated_at_iso` from the wire response — it is
  // an internal helper field, not part of the public row shape.
  const results = visible.map(({ updated_at_iso: _ignored, ...rest }) => rest);

  return c.json({ results, next_cursor: nextCursor });
});

export default app;
