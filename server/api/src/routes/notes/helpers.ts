/**
 * ノート API のヘルパー関数
 * マッパー、DB クエリ、権限チェック
 */
import { HTTPException } from "hono/http-exception";
import { eq, and, sql, inArray } from "drizzle-orm";
import { notes, notePages, noteMembers, pages } from "../../schema/index.js";
import type { Note } from "../../schema/index.js";
import type { Database } from "../../types/index.js";
import type { NoteApiFields, NoteRole, NoteMemberRole } from "./types.js";

// ── Mappers ─────────────────────────────────────────────────────────────────

export function noteRowToApi(note: Note): NoteApiFields {
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

export async function findActiveNoteById(db: Database, noteId: string): Promise<Note | null> {
  const result = await db
    .select()
    .from(notes)
    .where(and(eq(notes.id, noteId), eq(notes.isDeleted, false)))
    .limit(1);
  return result[0] ?? null;
}

export async function requireNoteOwner(
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

export async function getActivePageCounts(
  db: Database,
  noteIds: string[],
): Promise<Map<string, number>> {
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

export async function getActiveMemberCounts(
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

// ── Role & Permission ───────────────────────────────────────────────────────

export async function getNoteRole(
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

export function canEdit(role: NoteRole, note: Note): boolean {
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
