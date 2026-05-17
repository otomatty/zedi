/**
 * ノートページ管理ルート
 *
 * POST   /:noteId/pages                               — ノート配下にページ新規作成（タイトル）
 * DELETE /:noteId/pages/:pageId                       — ページ削除（所属ノート一致時）
 * PUT    /:noteId/pages                               — 並び替え noop（Issue #823、`updated_at` 順を使用）
 * GET    /:noteId/pages                               — ノートのページ一覧（keyset cursor pagination, Issue #860 Phase 1）
 *
 * Issue #823 で `copy-from-personal` / `copy-to-personal` と `page_id` リンク経路は削除。
 */
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { eq, and, or, lt, desc, sql } from "drizzle-orm";
import { notes, pages } from "../../schema/index.js";
import { authRequired, authOptional } from "../../middleware/auth.js";
import type { AppEnv } from "../../types/index.js";
import type { NotePageWindowItem, NotePageWindowResponse } from "./types.js";
import { getNoteRole, canEdit } from "./helpers.js";
import { publishNoteEvent } from "../../services/noteEventBroadcaster.js";
import { pageRowToWindowItem } from "./eventHelpers.js";

/**
 * `GET /api/notes/:noteId/pages` の最大ページサイズ。issue #860 Phase 1 で 100 件
 * を上限とする。デフォルトは {@link DEFAULT_PAGES_LIMIT}。
 *
 * Maximum page size for `GET /api/notes/:noteId/pages` (issue #860 Phase 1).
 * Default page size is {@link DEFAULT_PAGES_LIMIT}.
 */
const MAX_PAGES_LIMIT = 100;
const DEFAULT_PAGES_LIMIT = 50;

/**
 * keyset cursor の中身。`(updated_at, id)` の組で `ORDER BY updated_at DESC, id DESC`
 * を一意に進める。`updatedAt` はマイクロ秒精度を保つため、JS の `Date.toISOString()`
 * ではなく PostgreSQL 側で `to_char(... at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`
 * 経由で組み立てた文字列（例: `2026-05-13T12:34:56.123456Z`）をそのまま保持し、
 * 比較時は `::timestamptz` にキャストし直す。pg ドライバ経由で `Date` に
 * 変換するとミリ秒に丸まるため、`defaultNow()` 由来の行を取りこぼす（issue #860
 * Phase 1 の gemini-code-assist / codex レビュー）。
 *
 * Cursor payload encoding `(updated_at, id)`. `updatedAt` stores the
 * Postgres-formatted ISO string with microsecond precision
 * (`YYYY-MM-DDTHH24:MI:SS.USZ`) rather than `Date.toISOString()`, because the
 * pg driver collapses `timestamptz` values down to JS millisecond `Date`s and
 * would otherwise skip rows that share a millisecond but differ in
 * microseconds (e.g. consecutive `defaultNow()` inserts). Comparisons cast
 * the stored string back via `::timestamptz` so the round-trip is lossless
 * (Issue #860 Phase 1; gemini-code-assist + chatgpt-codex review on #865).
 */
interface PagesCursor {
  /**
   * Postgres-formatted ISO timestamp string with microsecond precision
   * (`YYYY-MM-DDTHH24:MI:SS.USZ`) from the last returned row's `updated_at`.
   */
  updatedAt: string;
  /** UUID of the last returned page. */
  id: string;
}

/**
 * RFC 4122 系の UUID 文字列を許容する正規表現。pg の `uuid` カラムへ流す前に
 * cursor 由来の `id` を検証して、`22P02` (invalid_text_representation) 経由の
 * 500 を避けるため使う（issue #860 Phase 1 / coderabbitai review on #865）。
 *
 * Permissive RFC 4122 UUID matcher used to gate cursor `id` before it
 * reaches the pg `uuid` column, so malformed values fall out as a
 * deterministic 400 instead of a `22P02` 500 (Issue #860 Phase 1;
 * coderabbitai review on PR #865).
 */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Encodes a {@link PagesCursor} as opaque base64url JSON. The exact encoding
 * is an implementation detail; clients must echo it back verbatim.
 *
 * {@link PagesCursor} を不透明な base64url JSON にエンコードする。形式は
 * 実装詳細であり、クライアントは受け取った値をそのまま echo する。
 */
function encodePagesCursor(cursor: PagesCursor): string {
  const json = JSON.stringify(cursor);
  return Buffer.from(json, "utf8").toString("base64url");
}

/**
 * Decodes a client-provided cursor. Returns `null` for an empty / malformed
 * input so the route can fall back to "no cursor" semantics; throws 400 when
 * the decoded shape is wrong, since that means the client built a cursor it
 * does not own.
 *
 * クライアント由来の cursor をデコードする。空 / 壊れた入力は `null` を返し、
 * 「cursor 無し」と同じ扱いに倒す。デコードできたが形が違う場合は 400 を投げる
 * （他経路で組み立てた cursor をそのまま流す誤用を弾く）。
 */
function decodePagesCursor(raw: string | undefined): PagesCursor | null {
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
  // `updatedAt` は微小精度の ISO 文字列を保持するが、JS の `Date` parser は
  // マイクロ秒を捨てるため、ここでは「`Date` が解釈可能か」だけを軽く確認する。
  // 厳密な範囲チェックは pg 側の `::timestamptz` キャストに委ねる。
  //
  // `updatedAt` keeps a microsecond-precision ISO string, but JS `Date` only
  // parses to milliseconds. We use it as a cheap sanity check; the real
  // validation happens in Postgres via `::timestamptz` at query time.
  const ts = new Date(updatedAtRaw);
  if (Number.isNaN(ts.getTime())) {
    throw new HTTPException(400, { message: "Invalid cursor" });
  }
  // cursor.id は最終的に pg の `uuid` カラム比較に流れる。不正値だと pg が
  // `22P02` で 500 を返してしまうため、ここで UUID 形式を強制して 400 に倒す。
  //
  // The decoded `id` will be compared against pg's `uuid` column. Anything
  // that does not look like a UUID would surface as a `22P02` 500, so reject
  // it deterministically as 400 here.
  if (!UUID_PATTERN.test(idRaw)) {
    throw new HTTPException(400, { message: "Invalid cursor" });
  }
  return { updatedAt: updatedAtRaw, id: idRaw };
}

/**
 * Parses and clamps the `limit` query parameter for the page-window endpoint.
 *
 * 1..{@link MAX_PAGES_LIMIT} の範囲に収まる limit を返す。未指定や不正値の場合は
 * {@link DEFAULT_PAGES_LIMIT} にフォールバックする。
 */
function parsePagesLimit(raw: string | undefined): number {
  if (raw === undefined) return DEFAULT_PAGES_LIMIT;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_PAGES_LIMIT;
  return Math.min(parsed, MAX_PAGES_LIMIT);
}

/**
 * `?include=preview,thumbnail` をフラグセットに正規化する。未知トークンは
 * 無視する（将来追加する場合に古いクライアントが 400 で落ちないように）。
 *
 * Normalizes `?include=preview,thumbnail` to a flag set. Unknown tokens are
 * ignored so old clients keep working when new tokens are added later.
 */
function parsePagesInclude(raw: string | undefined): { preview: boolean; thumbnail: boolean } {
  if (!raw) return { preview: false, thumbnail: false };
  const tokens = new Set(
    raw
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t.length > 0),
  );
  return {
    preview: tokens.has("preview"),
    thumbnail: tokens.has("thumbnail"),
  };
}

/**
 * `/notes/:noteId/pages?tags=...` のタグフィルタに使う最大要素数。クライアント
 * 側 (`urlTagsCodec.MAX_TAGS`) と整合させる。
 *
 * Cap on the number of tags accepted in `?tags=`, matching the client-side
 * `urlTagsCodec.MAX_TAGS` constant.
 */
const MAX_TAGS_FILTER = 20;

/**
 * `?tags=` URL クエリのパース結果。
 *
 * - `null`: パラメータ無し or 空文字 — フィルタを適用しない。
 * - `{ kind: 'tags' }`: 小文字キーの OR フィルタ。
 * - `{ kind: 'untagged-only' }`: `__none__` トークン — タグ無しページのみ。
 *
 * Parsed `?tags=` value:
 * - `null` for no filter
 * - `{ kind: 'tags' }` for a lower-cased OR list
 * - `{ kind: 'untagged-only' }` for the `__none__` token
 */
export type TagsFilter = { kind: "tags"; tags: string[] } | { kind: "untagged-only" } | null;

/**
 * `?tags=` を {@link TagsFilter} へ正規化する。クライアント側 codec
 * (`urlTagsCodec.parseTagsParam`) と同じ規則: トリム・小文字化・重複排除・
 * `MAX_TAGS_FILTER` で切り詰め。`__none__` が混ざれば untagged-only。要素 0
 * なら `null` を返してフィルタ無し扱い。不正値で 500 になるのを避けるため、
 * 文字列長や形が外れたものは静かに無視する (URL 経由の壊れた値で 400 を
 * 出してエラー画面に飛ばしたくないため)。
 *
 * Mirror of `urlTagsCodec.parseTagsParam` for server-side use. Lenient: malformed
 * tokens are silently dropped so a stale or broken URL doesn't 400 the
 * listing endpoint. Returns `null` to mean "no filter".
 */
function parseTagsFilter(raw: string | undefined): TagsFilter {
  if (raw === undefined || raw === null) return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  const tokens = trimmed
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0 && t.length <= 100);
  if (tokens.length === 0) return null;
  if (tokens.some((t) => t === "__none__")) return { kind: "untagged-only" };
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const token of tokens) {
    const key = token.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(key);
    if (normalized.length >= MAX_TAGS_FILTER) break;
  }
  if (normalized.length === 0) return null;
  return { kind: "tags", tags: normalized };
}

const app = new Hono<AppEnv>();

// ── POST /:noteId/pages ─────────────────────────────────────────────────────
app.post("/:noteId/pages", authRequired, async (c) => {
  const noteId = c.req.param("noteId");
  const userId = c.get("userId");
  const userEmail = c.get("userEmail");
  const db = c.get("db");

  const { role, note } = await getNoteRole(noteId, userId, userEmail, db);
  if (!note) throw new HTTPException(404, { message: "Note not found" });
  if (!role || !canEdit(role, note)) {
    throw new HTTPException(403, { message: "Forbidden" });
  }

  const body = await c.req.json<{
    page_id?: string;
    pageId?: string;
    title?: string;
    sort_order?: number;
  }>();

  const rawPageId = body.page_id ?? body.pageId;
  const hasPageId =
    typeof rawPageId === "string" && rawPageId.trim() !== "" ? rawPageId.trim() : undefined;
  if (hasPageId) {
    throw new HTTPException(400, {
      message: "page_id linking is removed (issue #823). Create a page with title only.",
    });
  }

  const title =
    typeof body.title === "string" && body.title.trim() !== "" ? body.title.trim() : undefined;

  if (body.title !== undefined && title === undefined) {
    throw new HTTPException(400, { message: "title must be a non-empty string" });
  }
  if (!title) {
    throw new HTTPException(400, { message: "title is required" });
  }

  const created = await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(pages)
      .values({
        ownerId: userId,
        noteId,
        title,
      })
      .returning();

    const newPage = inserted[0];
    if (!newPage) throw new HTTPException(500, { message: "Failed to create page" });

    await tx.update(notes).set({ updatedAt: new Date() }).where(eq(notes.id, noteId));
    return newPage;
  });

  // Issue #860 Phase 4: ノートを購読中のクライアント全員に `page.added` を配信
  // し、各 client の `useInfiniteNotePages` キャッシュへ直接 prepend させる
  // ことで、window 全体の refetch を避ける。emit は DB tx 完了後に限り、
  // 失敗時の整合性ずれを防ぐ。`publishNoteEvent` 自身は throw しないので
  // try/catch は不要。
  //
  // Issue #860 Phase 4: notify every SSE subscriber for this note so the
  // client can prepend the new page into its `useInfiniteNotePages` cache
  // without refetching the whole window. The publish happens strictly after
  // the transaction commits — emitting inside the tx could leak an event
  // for a page that never lands. `publishNoteEvent` swallows listener
  // failures internally, so no try/catch is needed here.
  publishNoteEvent({
    type: "page.added",
    note_id: noteId,
    page: pageRowToWindowItem(created),
  });

  return c.json({
    created: true,
    page_id: created.id,
    sort_order: 0,
  });
});

// ── DELETE /:noteId/pages/:pageId ───────────────────────────────────────────
app.delete("/:noteId/pages/:pageId", authRequired, async (c) => {
  const noteId = c.req.param("noteId");
  const pageId = c.req.param("pageId");
  const userId = c.get("userId");
  const userEmail = c.get("userEmail");
  const db = c.get("db");

  const { role, note } = await getNoteRole(noteId, userId, userEmail, db);
  if (!note) throw new HTTPException(404, { message: "Note not found" });
  if (!role || !canEdit(role, note)) {
    throw new HTTPException(403, { message: "Forbidden" });
  }

  await db.transaction(async (tx) => {
    const pageRow = await tx
      .select({ id: pages.id, noteId: pages.noteId })
      .from(pages)
      .where(and(eq(pages.id, pageId), eq(pages.isDeleted, false)))
      .limit(1);

    const page = pageRow[0];
    if (!page) throw new HTTPException(404, { message: "Page not found" });
    if (page.noteId !== noteId) {
      throw new HTTPException(400, { message: "Page does not belong to this note" });
    }

    await tx
      .update(pages)
      .set({ isDeleted: true, updatedAt: new Date() })
      .where(eq(pages.id, pageId));

    await tx.update(notes).set({ updatedAt: new Date() }).where(eq(notes.id, noteId));
  });

  // Issue #860 Phase 4: 削除をノート購読者へ通知。client は cache から
  // 該当 id を取り除くだけで済む（全 window refetch は不要）。tx 完了後に
  // emit する。
  // Issue #860 Phase 4: notify SSE subscribers so they can drop the page id
  // from their cached windows without refetching. Emitted after the
  // transaction commits to avoid announcing a delete that gets rolled back.
  publishNoteEvent({ type: "page.deleted", note_id: noteId, page_id: pageId });

  return c.json({ removed: true });
});

// ── PUT /:noteId/pages (reorder noop) ───────────────────────────────────────
app.put("/:noteId/pages", authRequired, async (c) => {
  const noteId = c.req.param("noteId");
  const userId = c.get("userId");
  const userEmail = c.get("userEmail");
  const db = c.get("db");

  const { role, note } = await getNoteRole(noteId, userId, userEmail, db);
  if (!note) throw new HTTPException(404, { message: "Note not found" });
  if (!role || !canEdit(role, note)) {
    throw new HTTPException(403, { message: "Forbidden" });
  }

  const body = await c.req.json<{
    page_ids: string[];
  }>();

  if (!body.page_ids?.length) {
    throw new HTTPException(400, { message: "page_ids array is required" });
  }

  // Issue #823: sort order lives on `pages.updated_at` only; ignore payload.
  await db.update(notes).set({ updatedAt: new Date() }).where(eq(notes.id, noteId));

  return c.json({ reordered: true });
});

// ── GET /:noteId/pages ──────────────────────────────────────────────────────
/**
 * Lists pages under a note as a keyset-paginated window (Issue #860 Phase 1).
 *
 * Query parameters:
 *   - `cursor`  Opaque base64url cursor returned in `next_cursor` of the
 *               previous response. Omit on the first call.
 *   - `limit`   1..{@link MAX_PAGES_LIMIT} (default {@link DEFAULT_PAGES_LIMIT}).
 *   - `include` Comma-separated optional fields. `preview` requests
 *               `content_preview`, `thumbnail` requests `thumbnail_url`.
 *               Unrecognized tokens are ignored.
 *
 * Authentication is `authOptional` plus role resolution via
 * {@link getNoteRole}; public / unlisted notes are reachable by `guest`
 * callers without sign-in. Private / restricted notes still 403 for guests.
 *
 * ノート配下のページを keyset cursor pagination で返す（Issue #860 Phase 1）。
 * `authOptional` + `getNoteRole` の組み合わせにより、公開 / unlisted ノートでは
 * 未ログインの guest でもページ一覧を取得できる。`content_preview` /
 * `thumbnail_url` は `?include=` で明示的に要求された場合のみセットされる。
 */
app.get("/:noteId/pages", authOptional, async (c) => {
  const noteId = c.req.param("noteId");
  const userId = c.get("userId");
  const userEmail = c.get("userEmail");
  const db = c.get("db");

  const { role, note } = await getNoteRole(noteId, userId, userEmail, db);
  if (!note) throw new HTTPException(404, { message: "Note not found" });
  if (!role) throw new HTTPException(403, { message: "Forbidden" });

  const limit = parsePagesLimit(c.req.query("limit"));
  const cursor = decodePagesCursor(c.req.query("cursor"));
  const include = parsePagesInclude(c.req.query("include"));
  const tagsFilter = parseTagsFilter(c.req.query("tags"));

  // keyset 条件: `(updated_at, id)` を `(c.updatedAt, c.id)` より小さい組に絞る。
  // `ORDER BY updated_at DESC, id DESC` と同じ向きで進めるため、
  // `updated_at < cursor.updatedAt OR (updated_at = cursor.updatedAt AND id < cursor.id)`
  // を使う。cursor の `updatedAt` は pg 側でマイクロ秒精度の ISO 文字列として
  // 保存しているため、比較側でも JS Date を介さず `::timestamptz` キャストで突合
  // し、ms 切り捨てによる行の取りこぼしを防ぐ（gemini-code-assist / codex on PR #865）。
  // `limit + 1` 件取得して、超過したら `next_cursor` を発行する。
  //
  // Keyset predicate paired with `ORDER BY updated_at DESC, id DESC`. The
  // cursor's `updatedAt` is the Postgres-formatted microsecond ISO string,
  // so comparisons cast it back via `::timestamptz` to keep microsecond
  // precision end-to-end (avoiding the JS `Date` truncation flagged by
  // gemini-code-assist + codex on PR #865). Fetching `limit + 1` rows lets
  // us emit `next_cursor` without a separate count query.
  const whereClauses = [eq(pages.noteId, noteId), eq(pages.isDeleted, false)];

  // タグフィルタ (`?tags=`) を WHERE 句に AND で足す。`untagged-only` は
  // `links` / `ghost_links` どちらにも `link_type='tag'` の出辺が無いページに
  // 絞り込む。通常の OR フィルタは `links → target.title` または
  // `ghost_links.link_text` のいずれかが選択タグに含まれるページに絞る。
  // 小文字キーで突合し、`pages.title` 側も `LOWER(...)` で比較する。
  //
  // Apply `?tags=` as an additional WHERE predicate on top of the keyset
  // pagination. `untagged-only` keeps only pages with zero `link_type='tag'`
  // edges in both tables. The OR list matches pages whose tag edge points at
  // a page title in the set or whose ghost-link text is in the set, all
  // compared case-insensitively against the lower-cased tags.
  if (tagsFilter) {
    if (tagsFilter.kind === "untagged-only") {
      // 削除済みタグページへのリンクは untagged 判定で「無い」ものとして扱う。
      // OR フィルタ側は `t.is_deleted = false` で削除済みを除外しているため、
      // ここで `t.is_deleted = false` の JOIN を付けないと「削除済みタグページ
      // のみ参照するページ」が通常タグにも `__none__` にもマッチせず消えて
      // しまう (PR #897 Codex P2)。
      //
      // Ignore links whose target is soft-deleted when deciding "untagged":
      // the OR-tag path already filters `t.is_deleted = false`, so without
      // this `JOIN ... t.is_deleted = false` a page that only references
      // tombstoned tag pages would match neither real tags nor `__none__`
      // (PR #897 Codex P2).
      whereClauses.push(sql`NOT EXISTS (
        SELECT 1 FROM links l
        JOIN pages t ON t.id = l.target_id AND t.is_deleted = false
        WHERE l.source_id = ${pages.id} AND l.link_type = 'tag'
      )`);
      whereClauses.push(sql`NOT EXISTS (
        SELECT 1 FROM ghost_links gl WHERE gl.source_page_id = ${pages.id} AND gl.link_type = 'tag'
      )`);
    } else {
      const tagsParam = sql`${tagsFilter.tags}::text[]`;
      whereClauses.push(sql`(
        EXISTS (
          SELECT 1 FROM links l
          JOIN pages t ON t.id = l.target_id
          WHERE l.source_id = ${pages.id}
            AND l.link_type = 'tag'
            AND t.is_deleted = false
            AND LOWER(t.title) = ANY(${tagsParam})
        )
        OR EXISTS (
          SELECT 1 FROM ghost_links gl
          WHERE gl.source_page_id = ${pages.id}
            AND gl.link_type = 'tag'
            AND LOWER(gl.link_text) = ANY(${tagsParam})
        )
      )`);
    }
  }

  if (cursor) {
    const cursorTsSql = sql`${cursor.updatedAt}::timestamptz`;
    // drizzle の `or()` は要素が空配列のとき undefined を返す型だが、ここでは
    // 必ず 2 つ渡しているため undefined は来ない。型を絞るため明示的に分岐する。
    //
    // `or()` here always receives two operands, but its return type is
    // `SQL | undefined`. Use an explicit `if` to keep TypeScript happy
    // without resorting to a non-null assertion.
    const keysetPredicate = or(
      lt(pages.updatedAt, cursorTsSql),
      and(eq(pages.updatedAt, cursorTsSql), lt(pages.id, cursor.id)),
    );
    if (keysetPredicate) {
      whereClauses.push(keysetPredicate);
    }
  }

  // `updatedAtIso` は cursor を組み立てるためだけに pg 側で
  // マイクロ秒精度の ISO 文字列を生成して持ち帰る。pg ドライバ経由で
  // 受け取る `updated_at` は JS Date に丸まる（ms 精度）ため、それだけでは
  // 同一ミリ秒で別マイクロ秒の行を取りこぼす（gemini-code-assist / codex
  // on PR #865）。
  //
  // `updatedAtIso` ships the microsecond-precision ISO string built by
  // Postgres so the cursor never loses precision. The `updated_at` field
  // returned via the pg driver collapses to a JS `Date` (millisecond), which
  // would silently skip rows that share a millisecond but differ in
  // microseconds (gemini-code-assist + codex on PR #865).
  const rows = await db
    .select({
      id: pages.id,
      ownerId: pages.ownerId,
      noteId: pages.noteId,
      sourcePageId: pages.sourcePageId,
      title: pages.title,
      contentPreview: pages.contentPreview,
      thumbnailUrl: pages.thumbnailUrl,
      sourceUrl: pages.sourceUrl,
      createdAt: pages.createdAt,
      updatedAt: pages.updatedAt,
      updatedAtIso: sql<string>`to_char(${pages.updatedAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
      isDeleted: pages.isDeleted,
    })
    .from(pages)
    .where(and(...whereClauses))
    .orderBy(desc(pages.updatedAt), desc(pages.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const visible = hasMore ? rows.slice(0, limit) : rows;
  const last = visible[visible.length - 1];
  const nextCursor =
    hasMore && last
      ? encodePagesCursor({
          updatedAt: last.updatedAtIso,
          id: last.id,
        })
      : null;

  const items: NotePageWindowItem[] = visible.map((p) => ({
    id: p.id,
    owner_id: p.ownerId,
    note_id: p.noteId,
    source_page_id: p.sourcePageId,
    title: p.title,
    content_preview: include.preview ? (p.contentPreview ?? null) : null,
    thumbnail_url: include.thumbnail ? (p.thumbnailUrl ?? null) : null,
    source_url: p.sourceUrl,
    created_at: p.createdAt,
    updated_at: p.updatedAt,
    is_deleted: p.isDeleted,
  }));

  const response: NotePageWindowResponse = { items, next_cursor: nextCursor };
  return c.json(response);
});

export default app;
