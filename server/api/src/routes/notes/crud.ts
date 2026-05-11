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
  NotePageApiItem,
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

const ALLOWED_VISIBILITY = new Set<NoteVisibility>(["private", "public", "unlisted", "restricted"]);
const ALLOWED_EDIT_PERMISSION = new Set<NoteEditPermission>([
  "owner_only",
  "members_editors",
  "any_logged_in",
]);

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

  const pagesResult = await db
    .select({
      id: pages.id,
      ownerId: pages.ownerId,
      noteId: pages.noteId,
      sourcePageId: pages.sourcePageId,
      title: pages.title,
      thumbnailUrl: pages.thumbnailUrl,
      sourceUrl: pages.sourceUrl,
      createdAt: pages.createdAt,
      updatedAt: pages.updatedAt,
      isDeleted: pages.isDeleted,
    })
    .from(pages)
    .where(and(eq(pages.noteId, noteId), eq(pages.isDeleted, false)))
    .orderBy(desc(pages.updatedAt));

  const response: NoteDetailApiResponse = {
    ...noteRowToApi(note),
    current_user_role: role,
    pages: pagesResult.map(
      (p): NotePageApiItem => ({
        id: p.id,
        owner_id: p.ownerId,
        /** 所属ノート ID（Issue #823 以降は常にこのノート ID）。 */
        note_id: p.noteId,
        source_page_id: p.sourcePageId,
        title: p.title,
        // Issue #849 移行措置: レスポンス軽量化のため常に `null`。プレビューが
        // 必要な箇所は専用エンドポイント or 個別ページ取得を使う。
        // Migration step for #849: always `null` to keep the response slim.
        // Callers that need the preview should hit a dedicated endpoint or
        // fetch the page individually.
        content_preview: null,
        thumbnail_url: p.thumbnailUrl,
        source_url: p.sourceUrl,
        created_at: p.createdAt,
        updated_at: p.updatedAt,
        is_deleted: p.isDeleted,
      }),
    ),
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
