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
 * を一意に進める。 issue #860 Phase 1。
 *
 * Cursor payload encoding `(updated_at, id)`. The pair uniquely advances
 * `ORDER BY updated_at DESC, id DESC` even when `updated_at` collides
 * across rows (issue #860 Phase 1).
 */
interface PagesCursor {
  /** ISO 8601 timestamp string of `pages.updated_at` from the last returned row. */
  updatedAt: string;
  /** UUID of the last returned page. */
  id: string;
}

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
  const ts = new Date(updatedAtRaw);
  if (Number.isNaN(ts.getTime())) {
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

  // keyset 条件: `(updated_at, id)` を `(c.updatedAt, c.id)` より小さい組に絞る。
  // `ORDER BY updated_at DESC, id DESC` と同じ向きで進めるため、
  // `updated_at < cursor.updatedAt OR (updated_at = cursor.updatedAt AND id < cursor.id)`
  // を使う。`limit + 1` 件取得して、超過したら `next_cursor` を発行する。
  //
  // Keyset predicate paired with `ORDER BY updated_at DESC, id DESC`. Fetching
  // `limit + 1` rows lets us emit `next_cursor` without a separate count
  // query.
  const whereClauses = [eq(pages.noteId, noteId), eq(pages.isDeleted, false)];
  if (cursor) {
    const cursorTs = new Date(cursor.updatedAt);
    // drizzle の `or()` は要素が空配列のとき undefined を返す型だが、ここでは
    // 必ず 2 つ渡しているため undefined は来ない。型を絞るため明示的に分岐する。
    //
    // `or()` here always receives two operands, but its return type is
    // `SQL | undefined`. Use an explicit `if` to keep TypeScript happy
    // without resorting to a non-null assertion.
    const keysetPredicate = or(
      lt(pages.updatedAt, cursorTs),
      and(sql`${pages.updatedAt} = ${cursorTs}`, lt(pages.id, cursor.id)),
    );
    if (keysetPredicate) {
      whereClauses.push(keysetPredicate);
    }
  }

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
          updatedAt:
            last.updatedAt instanceof Date ? last.updatedAt.toISOString() : String(last.updatedAt),
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
