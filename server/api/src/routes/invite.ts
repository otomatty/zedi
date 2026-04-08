/**
 * 招待受諾フロー API
 * Invitation acceptance flow API
 *
 * GET  /invite/:token        — トークン検証 + 招待情報取得（認証不要）
 * POST /invite/:token/accept — 招待承認（認証必須）
 */
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { eq, and } from "drizzle-orm";
import { noteInvitations, noteMembers, notes, users } from "../schema/index.js";
import { authRequired } from "../middleware/auth.js";
import type { AppEnv } from "../types/index.js";

const app = new Hono<AppEnv>();

// ── GET /invite/:token ─────────────────────────────────────────────────────

/**
 * トークンを検証し、招待情報を返す。認証不要。
 * Validate token and return invitation info. No auth required.
 */
app.get("/:token", async (c) => {
  const token = c.req.param("token");
  const db = c.get("db");

  // トークンで招待レコードを検索 / Find invitation by token
  const [invitation] = await db
    .select({
      noteId: noteInvitations.noteId,
      memberEmail: noteInvitations.memberEmail,
      expiresAt: noteInvitations.expiresAt,
      usedAt: noteInvitations.usedAt,
    })
    .from(noteInvitations)
    .where(eq(noteInvitations.token, token))
    .limit(1);

  if (!invitation) {
    throw new HTTPException(404, { message: "Invalid invitation link" });
  }

  // ノート情報を取得 / Fetch note info
  const [note] = await db
    .select({ title: notes.title })
    .from(notes)
    .where(eq(notes.id, invitation.noteId))
    .limit(1);

  // 招待者情報を取得 / Fetch inviter info
  const [member] = await db
    .select({
      invitedByUserId: noteMembers.invitedByUserId,
      role: noteMembers.role,
    })
    .from(noteMembers)
    .where(
      and(
        eq(noteMembers.noteId, invitation.noteId),
        eq(noteMembers.memberEmail, invitation.memberEmail),
      ),
    )
    .limit(1);

  let inviterName = "Unknown";
  if (member?.invitedByUserId) {
    const [inviter] = await db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, member.invitedByUserId))
      .limit(1);
    inviterName = inviter?.name ?? "Unknown";
  }

  const isExpired = invitation.expiresAt < new Date();

  return c.json({
    noteId: invitation.noteId,
    noteTitle: note?.title ?? "Untitled",
    inviterName,
    role: member?.role ?? "viewer",
    memberEmail: invitation.memberEmail,
    isExpired,
  });
});

// ── POST /invite/:token/accept ─────────────────────────────────────────────

/**
 * 招待を承認する。認証必須。
 * Accept an invitation. Auth required.
 */
app.post("/:token/accept", authRequired, async (c) => {
  const token = c.req.param("token");
  const userId = c.get("userId");
  const userEmail = c.get("userEmail");
  const db = c.get("db");

  // トークンで招待レコードを検索 / Find invitation by token
  const [invitation] = await db
    .select({
      noteId: noteInvitations.noteId,
      memberEmail: noteInvitations.memberEmail,
      expiresAt: noteInvitations.expiresAt,
      usedAt: noteInvitations.usedAt,
    })
    .from(noteInvitations)
    .where(eq(noteInvitations.token, token))
    .limit(1);

  if (!invitation) {
    throw new HTTPException(404, { message: "Invalid invitation link" });
  }

  // 期限切れチェック / Check expiration
  if (invitation.expiresAt < new Date()) {
    throw new HTTPException(410, { message: "Invitation has expired" });
  }

  // 使用済みチェック / Check if already used
  if (invitation.usedAt !== null) {
    throw new HTTPException(409, { message: "Invitation already accepted" });
  }

  // メール一致チェック / Check email match
  if (userEmail?.toLowerCase() !== invitation.memberEmail.toLowerCase()) {
    throw new HTTPException(400, {
      message: "Please log in with the invited email address",
    });
  }

  // メンバーステータスを accepted に更新 / Update member status to accepted
  const [updatedMember] = await db
    .update(noteMembers)
    .set({
      status: "accepted",
      acceptedUserId: userId,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(noteMembers.noteId, invitation.noteId),
        eq(noteMembers.memberEmail, invitation.memberEmail),
      ),
    )
    .returning({
      role: noteMembers.role,
      status: noteMembers.status,
    });

  // 招待トークンの used_at を更新 / Update invitation used_at
  await db
    .update(noteInvitations)
    .set({ usedAt: new Date() })
    .where(eq(noteInvitations.token, token));

  return c.json({
    noteId: invitation.noteId,
    role: updatedMember?.role ?? "viewer",
    status: "accepted",
  });
});

export default app;
