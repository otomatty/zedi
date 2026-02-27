/**
 * /api/notes — ノート CRUD + ページ管理 + メンバー管理
 *
 * ── ノート ──
 * POST   /api/notes                        — ノート作成
 * PUT    /api/notes/:noteId                — ノート更新
 * DELETE /api/notes/:noteId                — ノート削除
 * GET    /api/notes/:noteId                — ノート詳細取得
 * GET    /api/notes                        — ユーザーのノート一覧
 * GET    /api/notes/discover               — 公開ノート発見
 *
 * ── ノートページ ──
 * POST   /api/notes/:noteId/pages          — ページ追加
 * DELETE /api/notes/:noteId/pages/:pageId  — ページ削除
 * PUT    /api/notes/:noteId/pages          — ページ並び替え
 * GET    /api/notes/:noteId/pages          — ノートのページ一覧
 *
 * ── ノートメンバー ──
 * POST   /api/notes/:noteId/members                 — メンバー追加
 * DELETE /api/notes/:noteId/members/:memberEmail     — メンバー削除
 * GET    /api/notes/:noteId/members                  — メンバー一覧
 */
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { eq, and, or, desc, asc, sql, inArray } from "drizzle-orm";
import { notes, notePages, noteMembers, pages, users } from "../schema/index.js";
import { authRequired } from "../middleware/auth.js";
import type { AppEnv } from "../types/index.js";

const app = new Hono<AppEnv>();

// ── Helpers ─────────────────────────────────────────────────────────────────

type NoteRole = "owner" | "editor" | "viewer" | "guest" | null;

/**
 * ノートに対するユーザーの役割を判定
 */
async function getNoteRole(
  noteId: string,
  userId: string,
  userEmail: string | undefined,
  db: import("../types/index.js").Database,
): Promise<{ role: NoteRole; note: typeof notes.$inferSelect | null }> {
  const noteResult = await db
    .select()
    .from(notes)
    .where(and(eq(notes.id, noteId), eq(notes.isDeleted, false)))
    .limit(1);

  const note = noteResult[0];
  if (!note) return { role: null, note: null };

  // オーナーチェック
  if (note.ownerId === userId) return { role: "owner", note };

  // メンバーチェック
  if (userEmail) {
    const member = await db
      .select({ role: noteMembers.role })
      .from(noteMembers)
      .where(
        and(
          eq(noteMembers.noteId, noteId),
          eq(noteMembers.memberEmail, userEmail),
          eq(noteMembers.isDeleted, false),
        ),
      )
      .limit(1);

    const firstMember = member[0];
    if (firstMember) {
      return { role: firstMember.role as "editor" | "viewer", note };
    }
  }

  // 公開ノート: ゲストアクセス
  if (note.visibility === "public" || note.visibility === "unlisted") {
    return { role: "guest", note };
  }

  return { role: null, note };
}

/**
 * 書き込み権限チェック
 */
function canEdit(role: NoteRole, note: typeof notes.$inferSelect): boolean {
  if (role === "owner") return true;
  if (role === "editor" && note.editPermission !== "owner_only") return true;
  if (
    role === "guest" &&
    note.editPermission === "any_logged_in" &&
    (note.visibility === "public" || note.visibility === "unlisted")
  ) {
    return true;
  }
  return false;
}

// ── POST /notes ─────────────────────────────────────────────────────────────
app.post("/", authRequired, async (c) => {
  const userId = c.get("userId");
  const db = c.get("db");

  const body = await c.req.json<{
    title?: string;
    visibility?: string;
    edit_permission?: string;
    is_official?: boolean;
  }>();

  const result = await db
    .insert(notes)
    .values({
      ownerId: userId,
      title: body.title ?? null,
      visibility:
        (body.visibility as "private" | "public" | "unlisted" | "restricted") ?? "private",
      editPermission:
        (body.edit_permission as "owner_only" | "members_editors" | "any_logged_in") ??
        "owner_only",
      isOfficial: body.is_official ?? false,
    })
    .returning();

  return c.json({ note: result[0] }, 201);
});

// ── PUT /notes/:noteId ──────────────────────────────────────────────────────
app.put("/:noteId", authRequired, async (c) => {
  const noteId = c.req.param("noteId");
  const userId = c.get("userId");
  const db = c.get("db");

  // オーナーのみ更新可能
  const note = await db
    .select()
    .from(notes)
    .where(and(eq(notes.id, noteId), eq(notes.isDeleted, false)))
    .limit(1);

  const noteRow = note[0];
  if (!noteRow) throw new HTTPException(404, { message: "Note not found" });
  if (noteRow.ownerId !== userId) throw new HTTPException(403, { message: "Forbidden" });

  const body = await c.req.json<{
    title?: string;
    visibility?: string;
    edit_permission?: string;
    is_official?: boolean;
  }>();

  const updated = await db
    .update(notes)
    .set({
      title: body.title !== undefined ? body.title : undefined,
      visibility: body.visibility
        ? (body.visibility as "private" | "public" | "unlisted" | "restricted")
        : undefined,
      editPermission: body.edit_permission
        ? (body.edit_permission as "owner_only" | "members_editors" | "any_logged_in")
        : undefined,
      isOfficial: body.is_official !== undefined ? body.is_official : undefined,
      updatedAt: new Date(),
    })
    .where(eq(notes.id, noteId))
    .returning();

  return c.json({ note: updated[0] });
});

// ── DELETE /notes/:noteId ───────────────────────────────────────────────────
app.delete("/:noteId", authRequired, async (c) => {
  const noteId = c.req.param("noteId");
  const userId = c.get("userId");
  const db = c.get("db");

  const note = await db
    .select({ id: notes.id, ownerId: notes.ownerId })
    .from(notes)
    .where(and(eq(notes.id, noteId), eq(notes.isDeleted, false)))
    .limit(1);

  const noteRow = note[0];
  if (!noteRow) throw new HTTPException(404, { message: "Note not found" });
  if (noteRow.ownerId !== userId) throw new HTTPException(403, { message: "Forbidden" });

  await db
    .update(notes)
    .set({ isDeleted: true, updatedAt: new Date() })
    .where(eq(notes.id, noteId));

  return c.json({ deleted: true });
});

// ── GET /notes/discover ─────────────────────────────────────────────────────
// discover を :noteId より前に定義（パスマッチ順序）
app.get("/discover", authRequired, async (c) => {
  const db = c.get("db");

  const limit = Math.min(Math.max(Number(c.req.query("limit") || 20), 1), 100);
  const offset = Math.max(Number(c.req.query("offset") || 0), 0);

  const result = await db
    .select({
      id: notes.id,
      title: notes.title,
      ownerId: notes.ownerId,
      visibility: notes.visibility,
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

  // オーナー情報を付加
  const ownerIds = [...new Set(result.map((n) => n.ownerId))];
  const owners =
    ownerIds.length > 0
      ? await db
          .select({
            id: users.id,
            displayName: users.name,
            avatarUrl: users.image,
          })
          .from(users)
          .where(inArray(users.id, ownerIds))
      : [];

  const ownerMap = new Map(owners.map((o) => [o.id, o]));

  return c.json({
    notes: result.map((n) => ({
      ...n,
      owner: ownerMap.get(n.ownerId) ?? null,
    })),
  });
});

// ── GET /notes/:noteId ──────────────────────────────────────────────────────
app.get("/:noteId", authRequired, async (c) => {
  const noteId = c.req.param("noteId");
  const userId = c.get("userId");
  const userEmail = c.get("userEmail");
  const db = c.get("db");

  const { role, note } = await getNoteRole(noteId, userId, userEmail, db);

  if (!note) throw new HTTPException(404, { message: "Note not found" });
  if (!role) throw new HTTPException(403, { message: "Forbidden" });

  // view_count 加算 (オーナー以外)
  if (role !== "owner") {
    await db
      .update(notes)
      .set({ viewCount: sql`${notes.viewCount} + 1` })
      .where(eq(notes.id, noteId));
  }

  return c.json({ note, role });
});

// ── GET /notes ──────────────────────────────────────────────────────────────
app.get("/", authRequired, async (c) => {
  const userId = c.get("userId");
  const userEmail = c.get("userEmail");
  const db = c.get("db");

  // 自分が所有するノート
  const ownNotes = await db
    .select()
    .from(notes)
    .where(and(eq(notes.ownerId, userId), eq(notes.isDeleted, false)))
    .orderBy(desc(notes.updatedAt));

  // メンバーとして参加しているノート
  let memberNotes: (typeof notes.$inferSelect)[] = [];
  if (userEmail) {
    const memberNoteIds = await db
      .select({ noteId: noteMembers.noteId })
      .from(noteMembers)
      .where(and(eq(noteMembers.memberEmail, userEmail), eq(noteMembers.isDeleted, false)));

    if (memberNoteIds.length > 0) {
      memberNotes = await db
        .select()
        .from(notes)
        .where(
          and(
            inArray(
              notes.id,
              memberNoteIds.map((m) => m.noteId),
            ),
            eq(notes.isDeleted, false),
          ),
        )
        .orderBy(desc(notes.updatedAt));
    }
  }

  return c.json({ own: ownNotes, shared: memberNotes });
});

// ── POST /notes/:noteId/pages ───────────────────────────────────────────────
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
    page_id: string;
    sort_order?: number;
  }>();

  if (!body.page_id) {
    throw new HTTPException(400, { message: "page_id is required" });
  }

  // ページ存在チェック
  const page = await db
    .select({ id: pages.id })
    .from(pages)
    .where(and(eq(pages.id, body.page_id), eq(pages.isDeleted, false)))
    .limit(1);

  if (!page.length) throw new HTTPException(404, { message: "Page not found" });

  // 現在の最大 sort_order を取得
  const maxOrder = await db
    .select({ max: sql<number>`COALESCE(MAX(${notePages.sortOrder}), 0)` })
    .from(notePages)
    .where(and(eq(notePages.noteId, noteId), eq(notePages.isDeleted, false)));

  const sortOrder = body.sort_order ?? (maxOrder[0]?.max ?? 0) + 1;

  await db
    .insert(notePages)
    .values({
      noteId,
      pageId: body.page_id,
      addedByUserId: userId,
      sortOrder,
    })
    .onConflictDoUpdate({
      target: [notePages.noteId, notePages.pageId],
      set: {
        isDeleted: false,
        sortOrder,
        updatedAt: new Date(),
      },
    });

  // ノートの updated_at を更新
  await db.update(notes).set({ updatedAt: new Date() }).where(eq(notes.id, noteId));

  return c.json({ added: true, sort_order: sortOrder });
});

// ── DELETE /notes/:noteId/pages/:pageId ─────────────────────────────────────
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

  await db
    .update(notePages)
    .set({ isDeleted: true, updatedAt: new Date() })
    .where(and(eq(notePages.noteId, noteId), eq(notePages.pageId, pageId)));

  await db.update(notes).set({ updatedAt: new Date() }).where(eq(notes.id, noteId));

  return c.json({ removed: true });
});

// ── PUT /notes/:noteId/pages (reorder) ──────────────────────────────────────
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

  // page_ids の順番で sort_order を更新
  for (let i = 0; i < body.page_ids.length; i++) {
    const pageId = body.page_ids[i];
    if (!pageId) continue;
    await db
      .update(notePages)
      .set({ sortOrder: i, updatedAt: new Date() })
      .where(and(eq(notePages.noteId, noteId), eq(notePages.pageId, pageId)));
  }

  await db.update(notes).set({ updatedAt: new Date() }).where(eq(notes.id, noteId));

  return c.json({ reordered: true });
});

// ── GET /notes/:noteId/pages ────────────────────────────────────────────────
app.get("/:noteId/pages", authRequired, async (c) => {
  const noteId = c.req.param("noteId");
  const userId = c.get("userId");
  const userEmail = c.get("userEmail");
  const db = c.get("db");

  const { role, note } = await getNoteRole(noteId, userId, userEmail, db);
  if (!note) throw new HTTPException(404, { message: "Note not found" });
  if (!role) throw new HTTPException(403, { message: "Forbidden" });

  const result = await db
    .select({
      page_id: notePages.pageId,
      sort_order: notePages.sortOrder,
      added_by: notePages.addedByUserId,
      page_title: pages.title,
      page_content_preview: pages.contentPreview,
      page_thumbnail_url: pages.thumbnailUrl,
      page_updated_at: pages.updatedAt,
    })
    .from(notePages)
    .innerJoin(pages, eq(notePages.pageId, pages.id))
    .where(
      and(eq(notePages.noteId, noteId), eq(notePages.isDeleted, false), eq(pages.isDeleted, false)),
    )
    .orderBy(asc(notePages.sortOrder));

  return c.json({ pages: result });
});

// ── POST /notes/:noteId/members ─────────────────────────────────────────────
app.post("/:noteId/members", authRequired, async (c) => {
  const noteId = c.req.param("noteId");
  const userId = c.get("userId");
  const db = c.get("db");

  // オーナーのみメンバー追加可能
  const note = await db
    .select({ id: notes.id, ownerId: notes.ownerId })
    .from(notes)
    .where(and(eq(notes.id, noteId), eq(notes.isDeleted, false)))
    .limit(1);

  const noteRow = note[0];
  if (!noteRow) throw new HTTPException(404, { message: "Note not found" });
  if (noteRow.ownerId !== userId) {
    throw new HTTPException(403, { message: "Only the owner can add members" });
  }

  const body = await c.req.json<{
    member_email: string;
    role?: string;
  }>();

  if (!body.member_email) {
    throw new HTTPException(400, { message: "member_email is required" });
  }

  await db
    .insert(noteMembers)
    .values({
      noteId,
      memberEmail: body.member_email,
      role: (body.role as "viewer" | "editor") ?? "viewer",
      invitedByUserId: userId,
    })
    .onConflictDoUpdate({
      target: [noteMembers.noteId, noteMembers.memberEmail],
      set: {
        role: (body.role as "viewer" | "editor") ?? "viewer",
        isDeleted: false,
        updatedAt: new Date(),
      },
    });

  return c.json({ added: true });
});

// ── DELETE /notes/:noteId/members/:memberEmail ──────────────────────────────
app.delete("/:noteId/members/:memberEmail", authRequired, async (c) => {
  const noteId = c.req.param("noteId");
  const memberEmail = decodeURIComponent(c.req.param("memberEmail"));
  const userId = c.get("userId");
  const db = c.get("db");

  const note = await db
    .select({ id: notes.id, ownerId: notes.ownerId })
    .from(notes)
    .where(and(eq(notes.id, noteId), eq(notes.isDeleted, false)))
    .limit(1);

  const noteRow = note[0];
  if (!noteRow) throw new HTTPException(404, { message: "Note not found" });
  if (noteRow.ownerId !== userId) {
    throw new HTTPException(403, { message: "Only the owner can remove members" });
  }

  await db
    .update(noteMembers)
    .set({ isDeleted: true, updatedAt: new Date() })
    .where(and(eq(noteMembers.noteId, noteId), eq(noteMembers.memberEmail, memberEmail)));

  return c.json({ removed: true });
});

// ── GET /notes/:noteId/members ──────────────────────────────────────────────
app.get("/:noteId/members", authRequired, async (c) => {
  const noteId = c.req.param("noteId");
  const userId = c.get("userId");
  const userEmail = c.get("userEmail");
  const db = c.get("db");

  const { role, note } = await getNoteRole(noteId, userId, userEmail, db);
  if (!note) throw new HTTPException(404, { message: "Note not found" });
  if (!role) throw new HTTPException(403, { message: "Forbidden" });

  const result = await db
    .select({
      member_email: noteMembers.memberEmail,
      role: noteMembers.role,
      invited_by: noteMembers.invitedByUserId,
      created_at: noteMembers.createdAt,
    })
    .from(noteMembers)
    .where(and(eq(noteMembers.noteId, noteId), eq(noteMembers.isDeleted, false)))
    .orderBy(asc(noteMembers.createdAt));

  return c.json({ members: result });
});

export default app;
