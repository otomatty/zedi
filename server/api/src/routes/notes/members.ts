/**
 * ノートメンバー管理ルート
 *
 * POST   /:noteId/members                          — メンバー追加
 * POST   /:noteId/members/:memberEmail/resend       — 招待メール再送信
 * PUT    /:noteId/members/:memberEmail              — メンバーロール更新
 * DELETE /:noteId/members/:memberEmail              — メンバー削除
 * GET    /:noteId/members                           — メンバー一覧
 */
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { eq, and, asc, sql } from "drizzle-orm";
import { noteMembers } from "../../schema/index.js";
import { authRequired } from "../../middleware/auth.js";
import type { AppEnv } from "../../types/index.js";
import type { NoteMemberRole } from "./types.js";
import { requireNoteOwner, getNoteRole } from "./helpers.js";
import { sendInvitation, resendInvitation } from "../../services/invitationService.js";

const app = new Hono<AppEnv>();

function validateMemberRole(role: string | undefined): NoteMemberRole {
  if (role === undefined) return "viewer";
  if (role !== "viewer" && role !== "editor") {
    throw new HTTPException(400, { message: "role must be 'viewer' or 'editor'" });
  }
  return role;
}

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

  const memberEmail = body.member_email?.trim().toLowerCase();
  if (!memberEmail) {
    throw new HTTPException(400, { message: "member_email is required" });
  }

  const memberRole = validateMemberRole(body.role);

  const [member] = await db
    .insert(noteMembers)
    .values({
      noteId,
      memberEmail,
      role: memberRole,
      invitedByUserId: userId,
      status: "pending",
    })
    .onConflictDoUpdate({
      target: [noteMembers.noteId, noteMembers.memberEmail],
      set: {
        role: memberRole,
        isDeleted: false,
        status: sql`CASE WHEN ${noteMembers.status} = 'accepted' AND ${noteMembers.isDeleted} = FALSE THEN 'accepted' ELSE 'pending' END`,
        acceptedUserId: sql`CASE WHEN ${noteMembers.status} = 'accepted' AND ${noteMembers.isDeleted} = FALSE THEN ${noteMembers.acceptedUserId} ELSE NULL END`,
        updatedAt: new Date(),
      },
    })
    .returning({
      noteId: noteMembers.noteId,
      memberEmail: noteMembers.memberEmail,
      role: noteMembers.role,
      status: noteMembers.status,
      invitedByUserId: noteMembers.invitedByUserId,
      createdAt: noteMembers.createdAt,
      updatedAt: noteMembers.updatedAt,
    });
  if (!member) {
    throw new HTTPException(500, { message: "Failed to retrieve added member" });
  }

  // 招待メールをバックグラウンドで送信（レスポンスをブロックしない）
  // Send invitation email in the background (non-blocking)
  let invitationSent = false;
  if (member.status === "pending") {
    sendInvitation({
      db,
      noteId,
      memberEmail,
      role: memberRole,
      invitedByUserId: userId,
    })
      .then((result) => {
        if (!result.sent) {
          console.warn(`[members] Invitation email to ${memberEmail} was not sent:`, result.error);
        }
      })
      .catch((err) => {
        console.error("[members] Unexpected error in background invitation send:", err);
      });
    invitationSent = true;
  }

  return c.json({
    note_id: member.noteId,
    member_email: member.memberEmail,
    role: member.role,
    status: member.status,
    invited_by_user_id: member.invitedByUserId,
    created_at: member.createdAt,
    updated_at: member.updatedAt,
    invitation_sent: invitationSent,
  });
});

// ── POST /:noteId/members/:memberEmail/resend ──────────────────────────────
app.post("/:noteId/members/:memberEmail/resend", authRequired, async (c) => {
  const noteId = c.req.param("noteId");
  const memberEmail = decodeURIComponent(c.req.param("memberEmail")).trim().toLowerCase();
  const userId = c.get("userId");
  const db = c.get("db");

  // オーナーのみ実行可能 / Only the owner can resend invitations
  await requireNoteOwner(db, noteId, userId, "Only the owner can resend invitations");

  // pending 確認とトークン更新を同一トランザクションで行い、受諾との競合で usedAt が不整合になるのを防ぐ。
  // Lock the member row (FOR UPDATE) then resend so accept cannot interleave between check and upsert.
  const result = await db.transaction(async (tx) => {
    await tx.execute(
      sql`
        SELECT 1 FROM ${noteMembers}
        WHERE ${noteMembers.noteId} = ${noteId}
          AND ${noteMembers.memberEmail} = ${memberEmail}
          AND ${noteMembers.isDeleted} = FALSE
        FOR UPDATE
      `,
    );

    const [member] = await tx
      .select({ status: noteMembers.status, role: noteMembers.role })
      .from(noteMembers)
      .where(
        and(
          eq(noteMembers.noteId, noteId),
          eq(noteMembers.memberEmail, memberEmail),
          eq(noteMembers.isDeleted, false),
        ),
      )
      .limit(1);

    if (!member) {
      throw new HTTPException(404, { message: "Member not found" });
    }
    if (member.status !== "pending") {
      throw new HTTPException(400, {
        message: "Invitation can only be resent for pending members",
      });
    }

    return resendInvitation({
      db: tx,
      noteId,
      memberEmail,
      role: member.role,
      invitedByUserId: userId,
    });
  });

  if (!result.sent) {
    console.warn(`[members] Resend invitation to ${memberEmail} failed:`, result.error);
  }

  return c.json({ resent: result.sent });
});

// ── PUT /:noteId/members/:memberEmail ───────────────────────────────────────
app.put("/:noteId/members/:memberEmail", authRequired, async (c) => {
  const noteId = c.req.param("noteId");
  const memberEmail = decodeURIComponent(c.req.param("memberEmail")).trim().toLowerCase();
  const userId = c.get("userId");
  const db = c.get("db");

  await requireNoteOwner(db, noteId, userId, "Only the owner can update members");

  const body = await c.req.json<{ role?: string }>();
  if (body.role === undefined || body.role === null) {
    throw new HTTPException(400, { message: "role is required" });
  }
  const memberRole = validateMemberRole(body.role);

  const [updated] = await db
    .update(noteMembers)
    .set({ role: memberRole, updatedAt: new Date() })
    .where(
      and(
        eq(noteMembers.noteId, noteId),
        eq(noteMembers.memberEmail, memberEmail),
        eq(noteMembers.isDeleted, false),
      ),
    )
    .returning({
      noteId: noteMembers.noteId,
      memberEmail: noteMembers.memberEmail,
      role: noteMembers.role,
      status: noteMembers.status,
      invitedByUserId: noteMembers.invitedByUserId,
      createdAt: noteMembers.createdAt,
      updatedAt: noteMembers.updatedAt,
    });
  if (!updated) {
    throw new HTTPException(404, { message: "Member not found" });
  }
  return c.json({
    note_id: updated.noteId,
    member_email: updated.memberEmail,
    role: updated.role,
    status: updated.status,
    invited_by_user_id: updated.invitedByUserId,
    created_at: updated.createdAt,
    updated_at: updated.updatedAt,
  });
});

// ── DELETE /:noteId/members/:memberEmail ─────────────────────────────────────
app.delete("/:noteId/members/:memberEmail", authRequired, async (c) => {
  const noteId = c.req.param("noteId");
  const memberEmail = decodeURIComponent(c.req.param("memberEmail")).trim().toLowerCase();
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
  if (!role || role === "guest") {
    throw new HTTPException(403, { message: "Forbidden" });
  }

  const result = await db
    .select({
      noteId: noteMembers.noteId,
      memberEmail: noteMembers.memberEmail,
      role: noteMembers.role,
      status: noteMembers.status,
      invitedByUserId: noteMembers.invitedByUserId,
      createdAt: noteMembers.createdAt,
      updatedAt: noteMembers.updatedAt,
    })
    .from(noteMembers)
    .where(and(eq(noteMembers.noteId, noteId), eq(noteMembers.isDeleted, false)))
    .orderBy(asc(noteMembers.createdAt));

  return c.json(
    result.map((m) => ({
      note_id: m.noteId,
      member_email: m.memberEmail,
      role: m.role,
      status: m.status,
      invited_by_user_id: m.invitedByUserId,
      created_at: m.createdAt,
      updated_at: m.updatedAt,
    })),
  );
});

export default app;
