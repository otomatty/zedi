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
import { eq, ne, and, or, desc, asc, sql, inArray } from "drizzle-orm";
import { notes, notePages, noteMembers, pages, users } from "../schema/index.js";
import type { Note } from "../schema/index.js";
import { authRequired, authOptional } from "../middleware/auth.js";
import type { AppEnv, Database } from "../types/index.js";

const app = new Hono<AppEnv>();

// ── Types ───────────────────────────────────────────────────────────────────

type NoteRole = "owner" | "editor" | "viewer" | "guest" | null;
type NoteVisibility = Note["visibility"];
type NoteEditPermission = Note["editPermission"];
type NoteMemberRole = "viewer" | "editor";

// ── API Response Types ──────────────────────────────────────────────────────

interface NoteApiFields {
  id: string;
  owner_id: string;
  title: string | null;
  visibility: NoteVisibility;
  edit_permission: NoteEditPermission;
  is_official: boolean;
  view_count: number;
  created_at: Date;
  updated_at: Date;
  is_deleted: boolean;
}

interface NoteListApiItem extends NoteApiFields {
  role: "owner" | NoteMemberRole;
  page_count: number;
  member_count: number;
}

interface NotePageApiItem {
  id: string;
  owner_id: string;
  source_page_id: string | null;
  title: string | null;
  content_preview: string | null;
  thumbnail_url: string | null;
  source_url: string | null;
  created_at: Date;
  updated_at: Date;
  is_deleted: boolean;
  sort_order: number;
  added_by_user_id: string;
  added_at: Date;
}

interface NoteDetailApiResponse extends NoteApiFields {
  current_user_role: NonNullable<NoteRole>;
  pages: NotePageApiItem[];
}

interface DiscoverApiItem {
  id: string;
  owner_id: string;
  title: string | null;
  visibility: NoteVisibility;
  edit_permission: NoteEditPermission;
  is_official: boolean;
  view_count: number;
  created_at: Date;
  updated_at: Date;
  owner_display_name: string | null;
  owner_avatar_url: string | null;
  page_count: number;
}

interface DiscoverApiResponse {
  official: DiscoverApiItem[];
  notes: DiscoverApiItem[];
}

// ── Mappers ─────────────────────────────────────────────────────────────────

function noteRowToApi(note: Note): NoteApiFields {
  return {
    id: note.id,
    owner_id: note.ownerId,
    title: note.title,
    visibility: note.visibility,
    edit_permission: note.editPermission,
    is_official: note.isOfficial,
    view_count: note.viewCount,
    created_at: note.createdAt,
    updated_at: note.updatedAt,
    is_deleted: note.isDeleted,
  };
}

// ── DB Helpers ──────────────────────────────────────────────────────────────

async function findActiveNoteById(db: Database, noteId: string): Promise<Note | null> {
  const result = await db
    .select()
    .from(notes)
    .where(and(eq(notes.id, noteId), eq(notes.isDeleted, false)))
    .limit(1);
  return result[0] ?? null;
}

async function requireNoteOwner(
  db: Database,
  noteId: string,
  userId: string,
  forbiddenMessage = "Forbidden",
): Promise<Note> {
  const note = await findActiveNoteById(db, noteId);
  if (!note) throw new HTTPException(404, { message: "Note not found" });
  if (note.ownerId !== userId) {
    throw new HTTPException(403, { message: forbiddenMessage });
  }
  return note;
}

async function getActivePageCounts(db: Database, noteIds: string[]): Promise<Map<string, number>> {
  if (noteIds.length === 0) return new Map();
  const counts = await db
    .select({
      noteId: notePages.noteId,
      count: sql<number>`cast(count(*) as integer)`,
    })
    .from(notePages)
    .innerJoin(pages, eq(notePages.pageId, pages.id))
    .where(
      and(
        inArray(notePages.noteId, noteIds),
        eq(notePages.isDeleted, false),
        eq(pages.isDeleted, false),
      ),
    )
    .groupBy(notePages.noteId);
  return new Map(counts.map((c) => [c.noteId, c.count]));
}

async function getActiveMemberCounts(
  db: Database,
  noteIds: string[],
): Promise<Map<string, number>> {
  if (noteIds.length === 0) return new Map();
  const counts = await db
    .select({
      noteId: noteMembers.noteId,
      count: sql<number>`cast(count(*) as integer)`,
    })
    .from(noteMembers)
    .where(and(inArray(noteMembers.noteId, noteIds), eq(noteMembers.isDeleted, false)))
    .groupBy(noteMembers.noteId);
  return new Map(counts.map((c) => [c.noteId, c.count]));
}

// ── Role & Permission Helpers ───────────────────────────────────────────────

async function getNoteRole(
  noteId: string,
  userId: string | undefined,
  userEmail: string | undefined,
  db: Database,
): Promise<{ role: NoteRole; note: Note | null }> {
  const note = await findActiveNoteById(db, noteId);
  if (!note) return { role: null, note: null };

  if (userId && note.ownerId === userId) return { role: "owner", note };

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
      return { role: firstMember.role as NoteMemberRole, note };
    }
  }

  if (note.visibility === "public" || note.visibility === "unlisted") {
    return { role: "guest", note };
  }

  return { role: null, note };
}

function canEdit(role: NoteRole, note: Note): boolean {
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
  const userEmail = c.get("userEmail");
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
      visibility: (body.visibility as NoteVisibility) ?? "private",
      editPermission: (body.edit_permission as NoteEditPermission) ?? "owner_only",
      isOfficial: body.is_official ?? false,
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
      })
      .onConflictDoUpdate({
        target: [noteMembers.noteId, noteMembers.memberEmail],
        set: {
          role: "editor" as const,
          isDeleted: false,
          updatedAt: new Date(),
        },
      });
  }

  return c.json(noteRowToApi(created), 201);
});

// ── PUT /notes/:noteId ──────────────────────────────────────────────────────
app.put("/:noteId", authRequired, async (c) => {
  const noteId = c.req.param("noteId");
  const userId = c.get("userId");
  const db = c.get("db");

  await requireNoteOwner(db, noteId, userId);

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
      visibility: body.visibility ? (body.visibility as NoteVisibility) : undefined,
      editPermission: body.edit_permission
        ? (body.edit_permission as NoteEditPermission)
        : undefined,
      isOfficial: body.is_official !== undefined ? body.is_official : undefined,
      updatedAt: new Date(),
    })
    .where(eq(notes.id, noteId))
    .returning();

  const updatedNote = updated[0];
  if (!updatedNote) throw new HTTPException(500, { message: "Failed to update note" });
  return c.json(noteRowToApi(updatedNote));
});

// ── DELETE /notes/:noteId ───────────────────────────────────────────────────
app.delete("/:noteId", authRequired, async (c) => {
  const noteId = c.req.param("noteId");
  const userId = c.get("userId");
  const db = c.get("db");

  await requireNoteOwner(db, noteId, userId);

  await db
    .update(notes)
    .set({ isDeleted: true, updatedAt: new Date() })
    .where(eq(notes.id, noteId));

  return c.json({ deleted: true });
});

// ── GET /notes/discover ─────────────────────────────────────────────────────
// discover を :noteId より前に定義（パスマッチ順序）
app.get("/discover", authOptional, async (c) => {
  const db = c.get("db");

  const limit = Math.min(Math.max(Number(c.req.query("limit") || 20), 1), 100);
  const offset = Math.max(Number(c.req.query("offset") || 0), 0);

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

// ── GET /notes/:noteId ──────────────────────────────────────────────────────
app.get("/:noteId", authOptional, async (c) => {
  const noteId = c.req.param("noteId");
  const userId = c.get("userId");
  const userEmail = c.get("userEmail");
  const db = c.get("db");

  const { role, note } = await getNoteRole(noteId, userId, userEmail, db);

  if (!note) throw new HTTPException(404, { message: "Note not found" });
  if (!role) throw new HTTPException(403, { message: "Forbidden" });

  if (role !== "owner") {
    await db
      .update(notes)
      .set({ viewCount: sql`${notes.viewCount} + 1` })
      .where(eq(notes.id, noteId));
  }

  const pagesResult = await db
    .select({
      id: pages.id,
      ownerId: pages.ownerId,
      sourcePageId: pages.sourcePageId,
      title: pages.title,
      contentPreview: pages.contentPreview,
      thumbnailUrl: pages.thumbnailUrl,
      sourceUrl: pages.sourceUrl,
      createdAt: pages.createdAt,
      updatedAt: pages.updatedAt,
      isDeleted: pages.isDeleted,
      sortOrder: notePages.sortOrder,
      addedByUserId: notePages.addedByUserId,
      addedAt: notePages.createdAt,
    })
    .from(notePages)
    .innerJoin(pages, eq(notePages.pageId, pages.id))
    .where(
      and(eq(notePages.noteId, noteId), eq(notePages.isDeleted, false), eq(pages.isDeleted, false)),
    )
    .orderBy(asc(notePages.sortOrder));

  const response: NoteDetailApiResponse = {
    ...noteRowToApi(note),
    current_user_role: role,
    pages: pagesResult.map(
      (p): NotePageApiItem => ({
        id: p.id,
        owner_id: p.ownerId,
        source_page_id: p.sourcePageId,
        title: p.title,
        content_preview: p.contentPreview,
        thumbnail_url: p.thumbnailUrl,
        source_url: p.sourceUrl,
        created_at: p.createdAt,
        updated_at: p.updatedAt,
        is_deleted: p.isDeleted,
        sort_order: p.sortOrder,
        added_by_user_id: p.addedByUserId,
        added_at: p.addedAt,
      }),
    ),
  };

  return c.json(response);
});

// ── GET /notes ──────────────────────────────────────────────────────────────
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
      .where(and(eq(noteMembers.memberEmail, userEmail), eq(noteMembers.isDeleted, false)));

    if (memberData.length > 0) {
      for (const m of memberData) {
        memberRoles.set(m.noteId, m.role);
      }

      // オーナー自身のノートは ownNotes に含まれるため、shared では除外する
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
  ];

  return c.json(result);
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

  const page = await db
    .select({ id: pages.id })
    .from(pages)
    .where(and(eq(pages.id, body.page_id), eq(pages.isDeleted, false)))
    .limit(1);

  if (!page.length) throw new HTTPException(404, { message: "Page not found" });

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

  await requireNoteOwner(db, noteId, userId, "Only the owner can add members");

  const body = await c.req.json<{
    member_email: string;
    role?: string;
  }>();

  if (!body.member_email) {
    throw new HTTPException(400, { message: "member_email is required" });
  }

  const memberRole = (body.role as NoteMemberRole) ?? "viewer";

  await db
    .insert(noteMembers)
    .values({
      noteId,
      memberEmail: body.member_email,
      role: memberRole,
      invitedByUserId: userId,
    })
    .onConflictDoUpdate({
      target: [noteMembers.noteId, noteMembers.memberEmail],
      set: {
        role: memberRole,
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

  await requireNoteOwner(db, noteId, userId, "Only the owner can remove members");

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
