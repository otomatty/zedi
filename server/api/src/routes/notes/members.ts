/**
 * ノートメンバー管理ルート
 *
 * POST   /:noteId/members                 — メンバー追加
 * DELETE /:noteId/members/:memberEmail     — メンバー削除
 * GET    /:noteId/members                  — メンバー一覧
 */
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { eq, and, asc } from "drizzle-orm";
import { noteMembers } from "../../schema/index.js";
import { authRequired } from "../../middleware/auth.js";
import type { AppEnv } from "../../types/index.js";
import type { NoteMemberRole } from "./types.js";
import { requireNoteOwner, getNoteRole } from "./helpers.js";

const app = new Hono<AppEnv>();

// ── POST /:noteId/members ───────────────────────────────────────────────────
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

// ── DELETE /:noteId/members/:memberEmail ─────────────────────────────────────
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

// ── GET /:noteId/members ────────────────────────────────────────────────────
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
