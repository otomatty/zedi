/**
 * ノート CRUD + 一覧 + 発見ルート
 *
 * POST   /                — ノート作成
 * PUT    /:noteId         — ノート更新
 * DELETE /:noteId         — ノート削除
 * GET    /discover        — 公開ノート発見
 * GET    /:noteId         — ノート詳細取得
 * GET    /                — ユーザーのノート一覧
 */
import { createHash } from "node:crypto";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { eq, ne, and, or, desc, sql, inArray } from "drizzle-orm";
import { notes, noteMembers, pages, users } from "../../schema/index.js";
import type { Note } from "../../schema/index.js";
import { authRequired, authOptional } from "../../middleware/auth.js";
import type { AppEnv } from "../../types/index.js";
import type {
  NoteVisibility,
  NoteEditPermission,
  NoteMemberRole,
  NoteListApiItem,
  NoteDetailApiResponse,
  DiscoverApiItem,
  DiscoverApiResponse,
} from "./types.js";
import {
  noteRowToApi,
  requireNoteOwner,
  requireAdminUser,
  getNoteRole,
  getActivePageCounts,
  getActiveMemberCounts,
} from "./helpers.js";
import { publishNoteEvent } from "../../services/noteEventBroadcaster.js";

const ALLOWED_VISIBILITY = new Set<NoteVisibility>(["private", "public", "unlisted", "restricted"]);
const ALLOWED_EDIT_PERMISSION = new Set<NoteEditPermission>([
  "owner_only",
  "members_editors",
  "any_logged_in",
]);

/**
 * `GET /api/notes/:noteId` のレスポンス形状バージョン。ETag に混ぜることで、
 * サーバ側のレスポンス形状を変えた直後にクライアントが古い `If-None-Match`
 * を送ってきても 304 で旧 body をキャッシュ再利用させない（Issue #860 Phase 0）。
 * 形状を変更したら必ずこの値を bump する。
 *
 * Response-shape version for `GET /api/notes/:noteId`. Mixed into the ETag so
 * that when the server's response shape changes, stale `If-None-Match`
 * validators from clients cannot revive an outdated cached body via 304
 * (Issue #860 Phase 0). Bump this whenever the wire shape changes.
 */
const NOTE_DETAIL_RESPONSE_VERSION = "v3";

function validateVisibility(value: string | undefined): NoteVisibility {
  if (value === undefined) return "private";
  if (!ALLOWED_VISIBILITY.has(value as NoteVisibility)) {
    throw new HTTPException(400, { message: "Invalid visibility" });
  }
  return value as NoteVisibility;
}

function validateEditPermission(value: string | undefined): NoteEditPermission {
  if (value === undefined) return "owner_only";
  if (!ALLOWED_EDIT_PERMISSION.has(value as NoteEditPermission)) {
    throw new HTTPException(400, { message: "Invalid edit_permission" });
  }
  return value as NoteEditPermission;
}

/**
 * Parses `is_official` from JSON for note create (defaults to false).
 * JSON の `is_official` をノート作成用に解釈する（省略時は false）。
 *
 * @throws HTTPException 400 when present but not a boolean
 */
function parseIsOfficialForCreate(value: unknown): boolean {
  if (value === undefined) return false;
  if (typeof value === "boolean") return value;
  throw new HTTPException(400, { message: "Invalid is_official" });
}

/**
 * Parses optional `is_official` for note update.
 * ノート更新用の任意 `is_official` を解釈する。
 *
 * @throws HTTPException 400 when present but not a boolean
 */
function parseIsOfficialForUpdate(value: unknown): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "boolean") return value;
  throw new HTTPException(400, { message: "Invalid is_official" });
}

/**
 * `Date | string | null` のいずれで来ても安全に epoch ms に正規化するヘルパー。
 * drizzle の `sql<T>` テンプレートタグは型ヒントだけで runtime 変換しないため、
 * `MAX(pages.updated_at)` のような raw SQL 集約は pg ドライバ次第で
 * `Date` ではなく ISO 文字列で返ってくることがある (Issue #857 / PR #856 regression)。
 * SQL 境界側でも `.mapWith()` で Date 化しているが、ここでも defensive に
 * 受けておくことで将来同種の罠が再発しても 500 を避けられる。
 *
 * Normalizes `Date | string | null` to an epoch-ms number. drizzle's
 * `sql<T>` template tag is a compile-time-only hint and does not coerce
 * driver values, so raw aggregates like `MAX(pages.updated_at)` can arrive
 * as ISO strings depending on the pg driver path (Issue #857 / PR #856
 * regression). The query call site already normalizes via `.mapWith()`,
 * but accepting strings here too keeps the ETag path resilient against
 * similar bugs in the future.
 */
function toEpochMillis(value: Date | string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const parsed = value instanceof Date ? value : new Date(value);
  const ms = parsed.getTime();
  // 不正な文字列 (`new Date("not a date")`) や Invalid Date オブジェクトは
  // `NaN` を返す。テンプレートリテラルでハッシュに混ぜると "NaN" がそのまま
  // 文字列として入り、入力が壊れていても "同じ NaN" として ETag が安定して
  // しまう (= 別の壊れ方を区別できない)。0 に正規化することで `null` と同じ
  // 扱いになり、少なくとも安全側に倒れる (gemini-code-assist review on #859)。
  //
  // Invalid input (e.g. `new Date("bogus")` or an `Invalid Date`) yields
  // `NaN` from `getTime()`. Embedding it into the template literal would
  // splice the literal string `"NaN"` into the hash, which silently
  // collapses *different* malformed inputs into the same digest. Normalize
  // to 0 so the ETag at least falls back to the `null` branch behavior
  // (gemini-code-assist review on PR #859).
  return Number.isNaN(ms) ? 0 : ms;
}

/**
 * Note 詳細レスポンス用の weak ETag を生成する。`note.updatedAt` と role に
 * 加えて、ページの最大 `updated_at` と件数も混ぜることで、`notes.updated_at`
 * を経由しないページ単体編集（Hocuspocus 経由の本文保存・`PUT /api/pages/:id`
 * によるタイトル変更・ハード削除）でも ETag が変わるようにする。
 * weak (`W/...`) を採用するのは、`view_count` のフェイヤアンドフォーゲット
 * 更新によりレスポンス body が byte-for-byte 一致しないため。
 *
 * Generates a weak ETag for note detail responses. The hash mixes
 * `note.updatedAt`, the resolved role, and a pages-change signal
 * (`MAX(pages.updated_at) + COUNT(*)`) so that page-only edits which do not
 * bump `notes.updated_at` (e.g. Hocuspocus-driven content saves, title
 * renames via `PUT /api/pages/:id`, hard delete) still invalidate the
 * validator. The ETag is weak (`W/...`) because the fire-and-forget
 * `view_count` update can shift the response body byte-for-byte even when
 * the semantically meaningful state has not changed.
 */
function makeNoteETag(
  noteId: string,
  noteUpdatedAt: Date | string,
  role: string,
  pagesMaxUpdatedAt: Date | string | null,
  pagesCount: number,
): string {
  const hash = createHash("sha1")
    .update(
      `${NOTE_DETAIL_RESPONSE_VERSION}:${noteId}:${toEpochMillis(noteUpdatedAt)}:${role}:${toEpochMillis(pagesMaxUpdatedAt)}:${pagesCount}`,
    )
    .digest("base64url")
    .slice(0, 22);
  return `W/"${hash}"`;
}

/**
 * RFC 7232 §3.2 準拠の `If-None-Match` 弱比較。`*` ワイルドカード、
 * カンマ区切り複数値、`W/` プレフィックス（大文字小文字非区別）を
 * 正しく扱う（PR #856 CodeRabbit nitpick）。
 *
 * Weak `If-None-Match` matcher per RFC 7232 §3.2. Handles the `*`
 * wildcard, comma-separated lists, and case-insensitive `W/` prefix so
 * spec-compliant clients that normalize or batch validators still hit
 * the 304 path (PR #856 CodeRabbit nitpick).
 */
export function ifNoneMatchMatches(headerValue: string | undefined, currentEtag: string): boolean {
  if (!headerValue) return false;
  const trimmed = headerValue.trim();
  // `*` matches any current representation (RFC 7232 §3.2).
  if (trimmed === "*") return true;
  const normalize = (token: string) => token.trim().replace(/^W\//i, "");
  const target = normalize(currentEtag);
  if (!target) return false;
  return headerValue.split(",").some((token) => {
    const candidate = normalize(token);
    return candidate.length > 0 && candidate === target;
  });
}

const app = new Hono<AppEnv>();

// ── POST / ──────────────────────────────────────────────────────────────────
app.post("/", authRequired, async (c) => {
  const userId = c.get("userId");
  const userEmail = c.get("userEmail");
  const db = c.get("db");

  const body = await c.req.json<{
    title?: string;
    visibility?: string;
    edit_permission?: string;
    is_official?: unknown;
  }>();

  const visibility = validateVisibility(body.visibility);
  const editPermission = validateEditPermission(body.edit_permission);
  const isOfficial = parseIsOfficialForCreate(body.is_official);

  if (isOfficial === true) {
    await requireAdminUser(db, userId);
  }

  const result = await db
    .insert(notes)
    .values({
      ownerId: userId,
      title: body.title ?? null,
      visibility,
      editPermission,
      isOfficial,
    })
    .returning();

  const created = result[0];
  if (!created) throw new HTTPException(500, { message: "Failed to create note" });

  if (userEmail) {
    await db
      .insert(noteMembers)
      .values({
        noteId: created.id,
        memberEmail: userEmail,
        role: "editor" as const,
        invitedByUserId: userId,
        status: "accepted",
        acceptedUserId: userId,
      })
      .onConflictDoUpdate({
        target: [noteMembers.noteId, noteMembers.memberEmail],
        set: {
          role: "editor" as const,
          isDeleted: false,
          status: "accepted",
          acceptedUserId: userId,
          updatedAt: new Date(),
        },
      });
  }

  return c.json(noteRowToApi(created), 201);
});

// ── PUT /:noteId ────────────────────────────────────────────────────────────
app.put("/:noteId", authRequired, async (c) => {
  const noteId = c.req.param("noteId");
  const userId = c.get("userId");
  const db = c.get("db");

  await requireNoteOwner(db, noteId, userId);

  const body = await c.req.json<{
    title?: string;
    visibility?: string;
    edit_permission?: string;
    is_official?: unknown;
  }>();

  const isOfficial = parseIsOfficialForUpdate(body.is_official);
  // Require admin whenever the client sends `is_official`, not only when it differs from
  // the row we read. Otherwise a non-admin could race with an admin toggle and overwrite
  // the flag using a payload that matched the stale snapshot (TOCTOU).
  // 読み取り時点と同じ値でもボディに含めたら admin 必須。並行更新との競合で非管理者が
  // フラグを上書きするのを防ぐ。
  if (isOfficial !== undefined) {
    await requireAdminUser(db, userId);
  }

  const visibility =
    body.visibility !== undefined ? validateVisibility(body.visibility) : undefined;
  const editPermission =
    body.edit_permission !== undefined ? validateEditPermission(body.edit_permission) : undefined;

  const updated = await db
    .update(notes)
    .set({
      title: body.title !== undefined ? body.title : undefined,
      visibility,
      editPermission,
      isOfficial: isOfficial !== undefined ? isOfficial : undefined,
      updatedAt: new Date(),
    })
    .where(eq(notes.id, noteId))
    .returning();

  const updatedNote = updated[0];
  if (!updatedNote) throw new HTTPException(500, { message: "Failed to update note" });

  // Issue #860 Phase 4: visibility / edit_permission の変化は `getNoteRole`
  // の解釈に直結するため、ノート購読者へ sentinel を投げて details / window /
  // members を invalidate させる。title だけの変更でも `noteRowToApi` の値が
  // 変わるので一律で emit する。
  // Issue #860 Phase 4: changes to visibility / edit_permission flip the
  // result of `getNoteRole` for some callers, so notify subscribers to
  // re-evaluate access. Always emit on a successful PUT (even title-only
  // changes) so the cached note shell does not drift.
  if (
    visibility !== undefined ||
    editPermission !== undefined ||
    body.title !== undefined ||
    isOfficial !== undefined
  ) {
    publishNoteEvent({ type: "note.permission_changed", note_id: noteId });
  }
  return c.json(noteRowToApi(updatedNote));
});

// ── DELETE /:noteId ─────────────────────────────────────────────────────────
app.delete("/:noteId", authRequired, async (c) => {
  const noteId = c.req.param("noteId");
  const userId = c.get("userId");
  const db = c.get("db");

  const note = await requireNoteOwner(db, noteId, userId);

  // デフォルトノート（マイノート）は削除不可。誤操作で個人スペースが消えるのを
  // 防ぐ。再作成は `ensureDefaultNote` で可能だがリンク・履歴は失われるため
  // 拒否する。Issue: 「ホーム廃止 → /notes/me 着地」スレッド参照。
  // The default note ("マイノート") is non-deletable — losing it would destroy
  // the user's personal space. `ensureDefaultNote` could re-create one, but
  // links and history would be gone, so we reject deletion outright.
  if (note.isDefault) {
    throw new HTTPException(400, { message: "Default note cannot be deleted" });
  }

  await db
    .update(notes)
    .set({ isDeleted: true, updatedAt: new Date() })
    .where(eq(notes.id, noteId));

  return c.json({ deleted: true });
});

// ── GET /discover ───────────────────────────────────────────────────────────
// discover を /:noteId より前に定義（パスマッチ順序）
app.get("/discover", authOptional, async (c) => {
  const db = c.get("db");

  const parseIntOr = (raw: string | undefined, fallback: number) => {
    const parsed = Number.parseInt(raw ?? "", 10);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const limit = Math.min(Math.max(parseIntOr(c.req.query("limit"), 20), 1), 100);
  const offset = Math.max(parseIntOr(c.req.query("offset"), 0), 0);

  const result = await db
    .select({
      id: notes.id,
      title: notes.title,
      ownerId: notes.ownerId,
      visibility: notes.visibility,
      editPermission: notes.editPermission,
      isOfficial: notes.isOfficial,
      viewCount: notes.viewCount,
      createdAt: notes.createdAt,
      updatedAt: notes.updatedAt,
    })
    .from(notes)
    .where(
      and(
        eq(notes.isDeleted, false),
        or(eq(notes.visibility, "public"), eq(notes.visibility, "unlisted")),
      ),
    )
    .orderBy(desc(notes.isOfficial), desc(notes.viewCount), desc(notes.updatedAt))
    .limit(limit)
    .offset(offset);

  const ownerIds = [...new Set(result.map((n) => n.ownerId))];
  const owners =
    ownerIds.length > 0
      ? await db
          .select({ id: users.id, displayName: users.name, avatarUrl: users.image })
          .from(users)
          .where(inArray(users.id, ownerIds))
      : [];
  const ownerMap = new Map(owners.map((o) => [o.id, o]));

  const noteIds = result.map((n) => n.id);
  const pageCountMap = await getActivePageCounts(db, noteIds);

  const toDiscoverItem = (n: (typeof result)[0]): DiscoverApiItem => {
    const owner = ownerMap.get(n.ownerId);
    return {
      id: n.id,
      owner_id: n.ownerId,
      title: n.title,
      visibility: n.visibility,
      edit_permission: n.editPermission,
      is_official: n.isOfficial,
      view_count: n.viewCount,
      created_at: n.createdAt,
      updated_at: n.updatedAt,
      owner_display_name: owner?.displayName ?? null,
      owner_avatar_url: owner?.avatarUrl ?? null,
      page_count: pageCountMap.get(n.id) ?? 0,
    };
  };

  const response: DiscoverApiResponse = {
    official: result.filter((n) => n.isOfficial).map(toDiscoverItem),
    notes: result.filter((n) => !n.isOfficial).map(toDiscoverItem),
  };

  return c.json(response);
});

// ── GET /:noteId ────────────────────────────────────────────────────────────
app.get("/:noteId", authOptional, async (c) => {
  const noteId = c.req.param("noteId");
  const userId = c.get("userId");
  const userEmail = c.get("userEmail");
  const db = c.get("db");

  const { role, note } = await getNoteRole(noteId, userId, userEmail, db);

  if (!note) throw new HTTPException(404, { message: "Note not found" });
  if (!role) throw new HTTPException(403, { message: "Forbidden" });

  // ページ側の変更（コンテンツ編集・タイトル変更・追加・削除）を ETag に反映
  // するため、active なページの MAX(updated_at) と件数を 1 クエリで集約する。
  // Phase 3 で追加した `(note_id, updated_at DESC) WHERE is_deleted = false`
  // 部分インデックスにより、これは index-only で済む軽量クエリ。
  //
  // Aggregate `MAX(updated_at)` and `COUNT(*)` over active pages so the ETag
  // captures page-level mutations that do not bump `notes.updated_at`
  // (Hocuspocus-driven content edits, title renames via
  // `PUT /api/pages/:id`, hard delete). The partial composite index added
  // in Phase 3 lets Postgres resolve this from the index alone, keeping the
  // cost negligible.
  const pagesSignalRows = await db
    .select({
      // drizzle の `sql<Date | null>\`...\`` は型ヒントだけで、raw SQL 集約 (typed
      // column ではない式) の戻り値に decoder を持たない。pg ドライバ経路次第で
      // `timestamptz` の集約値が ISO 文字列のまま返ってくることがあり、その場合
      // 下流の `makeNoteETag` で `.getTime()` が落ちて 500 になる (Issue #857)。
      // `.mapWith()` で境界側で Date | null に強制正規化する。
      //
      // `sql<Date | null>` is a compile-time-only hint and drizzle has no decoder
      // for raw aggregate expressions, so the pg driver can hand the result back
      // as an ISO string (Issue #857 / PR #856 regression). `.mapWith()` coerces
      // the driver value to `Date | null` at the query boundary.
      maxUpdatedAt: sql<Date | null>`MAX(${pages.updatedAt})`.mapWith((value): Date | null => {
        if (value === null || value === undefined) return null;
        return value instanceof Date ? value : new Date(value as string);
      }),
      count: sql<number>`COUNT(*)::int`,
    })
    .from(pages)
    .where(and(eq(pages.noteId, noteId), eq(pages.isDeleted, false)));
  const pagesSignal = pagesSignalRows[0] ?? { maxUpdatedAt: null, count: 0 };

  const etag = makeNoteETag(
    note.id,
    note.updatedAt,
    role,
    pagesSignal.maxUpdatedAt,
    pagesSignal.count,
  );
  c.header("ETag", etag);
  c.header("Cache-Control", "private, must-revalidate");
  c.header("Vary", "Cookie");

  // クライアントが前回受け取った ETag を `If-None-Match` で送ってきていれば、
  // body・viewCount・pages クエリをまるごとスキップする（Issue #853）。
  // 304 経路では viewCount も更新しない: 「画面を実際に取得した」のは body を
  // 受け取ったときに限るという解釈で、ETag を安定させる効果もある。
  //
  // When the client sends back a matching `If-None-Match`, short-circuit with
  // 304 and skip both the `view_count` update and the pages query (Issue
  // #853). Treating "fetched" as "received a body" keeps the counter
  // semantically meaningful and keeps the ETag stable longer.
  const ifNoneMatch = c.req.header("If-None-Match");
  if (ifNoneMatchMatches(ifNoneMatch, etag)) {
    return c.body(null, 304);
  }

  // 非オーナーのアクセスごとに `view_count` をインクリメントするが、UPDATE は
  // レスポンスをブロックしないよう投げっぱなしにする（Issue #849）。失敗時は
  // ログのみで継続し、Discover の並び替えに使うカウンタは最終的に整合する。
  //
  // Increment `view_count` on every non-owner visit, but fire-and-forget the
  // UPDATE so it does not add a DB round trip to the response (Issue #849).
  // Errors are logged and swallowed; the counter that backs Discover's sort
  // converges eventually.
  if (role !== "owner") {
    void db
      .update(notes)
      .set({ viewCount: sql`${notes.viewCount} + 1` })
      .where(eq(notes.id, noteId))
      .catch((error) => {
        console.error(`[api] noteViewCountUpdateFailed noteId=${noteId}`, error);
      });
  }

  // Issue #860 Phase 6: ノートシェルから `pages[]` を撤去した。一覧表示は
  // Phase 1 で導入した `GET /api/notes/:noteId/pages` (cursor pagination)、
  // wiki link / AI chat scope のような全ページタイトルが必要な経路は
  // Phase 6 で追加した `GET /api/notes/:noteId/page-titles` を使う。
  // ETag に混ぜる pages signal は引き続き上で集約しているため、ページ単体
  // 編集でもノート ETag は変わる（304 経路の正しさを維持）。
  //
  // Issue #860 Phase 6: drops `pages[]` from the note-shell response. The
  // visible list now uses the Phase 1 cursor-paginated `/pages` window
  // endpoint, while full-set consumers (wiki-link resolver, AI-chat scope)
  // use the Phase 6 `/page-titles` endpoint. The ETag still mixes in the
  // pages signal aggregate above so single-page edits invalidate the note
  // shell validator (preserving 304 correctness).
  const response: NoteDetailApiResponse = {
    ...noteRowToApi(note),
    current_user_role: role,
  };

  return c.json(response);
});

// ── GET / ───────────────────────────────────────────────────────────────────
app.get("/", authRequired, async (c) => {
  const userId = c.get("userId");
  const userEmail = c.get("userEmail");
  const db = c.get("db");

  const ownNotes = await db
    .select()
    .from(notes)
    .where(and(eq(notes.ownerId, userId), eq(notes.isDeleted, false)))
    .orderBy(desc(notes.updatedAt));

  let sharedNotes: Note[] = [];
  const memberRoles = new Map<string, string>();

  if (userEmail) {
    const memberData = await db
      .select({ noteId: noteMembers.noteId, role: noteMembers.role })
      .from(noteMembers)
      .where(
        and(
          eq(noteMembers.memberEmail, userEmail),
          eq(noteMembers.isDeleted, false),
          eq(noteMembers.status, "accepted"),
        ),
      );

    if (memberData.length > 0) {
      for (const m of memberData) {
        memberRoles.set(m.noteId, m.role);
      }

      sharedNotes = await db
        .select()
        .from(notes)
        .where(
          and(
            inArray(
              notes.id,
              memberData.map((m) => m.noteId),
            ),
            eq(notes.isDeleted, false),
            ne(notes.ownerId, userId),
          ),
        )
        .orderBy(desc(notes.updatedAt));
    }
  }

  const allNoteIds = [...ownNotes, ...sharedNotes].map((n) => n.id);
  const pageCountMap = await getActivePageCounts(db, allNoteIds);
  const memberCountMap = await getActiveMemberCounts(db, allNoteIds);

  const result: NoteListApiItem[] = [
    ...ownNotes.map(
      (n): NoteListApiItem => ({
        ...noteRowToApi(n),
        role: "owner",
        page_count: pageCountMap.get(n.id) ?? 0,
        member_count: memberCountMap.get(n.id) ?? 0,
      }),
    ),
    ...sharedNotes.map(
      (n): NoteListApiItem => ({
        ...noteRowToApi(n),
        role: (memberRoles.get(n.id) ?? "viewer") as NoteMemberRole,
        page_count: pageCountMap.get(n.id) ?? 0,
        member_count: memberCountMap.get(n.id) ?? 0,
      }),
    ),
  ].sort((a, b) => b.updated_at.getTime() - a.updated_at.getTime());

  return c.json(result);
});

export default app;
