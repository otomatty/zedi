/**
 * 招待受諾フロー API
 * Invitation acceptance flow API
 *
 * GET  /invite/:token        — トークン検証 + 招待情報取得（認証不要）
 * POST /invite/:token/accept — 招待承認（認証必須）
 */
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { eq, and, isNull, gt } from "drizzle-orm";
import { noteInvitations, noteMembers, notes, users } from "../schema/index.js";
import { authRequired } from "../middleware/auth.js";
import type { AppEnv } from "../types/index.js";

const app = new Hono<AppEnv>();

// ── GET /invite/:token ─────────────────────────────────────────────────────

/**
 * トークンを検証し、招待情報を返す。認証不要。
 * JOIN で1クエリにまとめ、DB 往復を削減する。
 *
 * Validate token and return invitation info. No auth required.
 * Uses a single joined query to reduce DB round-trips.
 */
app.get("/:token", async (c) => {
  const token = c.req.param("token");
  const db = c.get("db");

  // トークン + ノート + メンバー + 招待者を JOIN で一括取得
  // Fetch invitation + note + member + inviter in a single joined query
  const [data] = await db
    .select({
      noteId: noteInvitations.noteId,
      memberEmail: noteInvitations.memberEmail,
      expiresAt: noteInvitations.expiresAt,
      usedAt: noteInvitations.usedAt,
      noteTitle: notes.title,
      role: noteMembers.role,
      inviterName: users.name,
    })
    .from(noteInvitations)
    .leftJoin(notes, eq(notes.id, noteInvitations.noteId))
    .leftJoin(
      noteMembers,
      and(
        eq(noteMembers.noteId, noteInvitations.noteId),
        eq(noteMembers.memberEmail, noteInvitations.memberEmail),
        eq(noteMembers.isDeleted, false),
      ),
    )
    .leftJoin(users, eq(users.id, noteMembers.invitedByUserId))
    .where(eq(noteInvitations.token, token))
    .limit(1);

  if (!data) {
    throw new HTTPException(404, { message: "Invalid invitation link" });
  }

  const isExpired = data.expiresAt < new Date();

  return c.json({
    noteId: data.noteId,
    noteTitle: data.noteTitle ?? "Untitled",
    inviterName: data.inviterName ?? "Unknown",
    role: data.role ?? "viewer",
    memberEmail: data.memberEmail,
    isExpired,
    isUsed: data.usedAt !== null,
  });
});

// ── POST /invite/:token/accept ─────────────────────────────────────────────

/**
 * 招待を承認する。認証必須。
 * noteMembers と noteInvitations の更新をトランザクションで実行する。
 *
 * Accept an invitation. Auth required.
 * Updates to noteMembers and noteInvitations are wrapped in a transaction.
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
  if (!userEmail?.trim()) {
    throw new HTTPException(400, {
      message: "Could not determine your email address. Please log in again.",
    });
  }
  if (userEmail.toLowerCase() !== invitation.memberEmail.toLowerCase()) {
    throw new HTTPException(400, {
      message: "Please log in with the invited email address",
    });
  }

  // トランザクション内でトークンを先にクレームし、単一利用を原子的に保証する。
  // Claim the token inside the transaction so concurrent accepts cannot both succeed.
  const [updatedMember] = await db.transaction(async (tx) => {
    const [claimed] = await tx
      .update(noteInvitations)
      .set({ usedAt: new Date() })
      .where(
        and(
          eq(noteInvitations.token, token),
          isNull(noteInvitations.usedAt),
          gt(noteInvitations.expiresAt, new Date()),
        ),
      )
      .returning({
        noteId: noteInvitations.noteId,
        memberEmail: noteInvitations.memberEmail,
      });

    if (!claimed) {
      const [invState] = await tx
        .select({
          usedAt: noteInvitations.usedAt,
          expiresAt: noteInvitations.expiresAt,
        })
        .from(noteInvitations)
        .where(eq(noteInvitations.token, token))
        .limit(1);
      if (!invState) {
        throw new HTTPException(404, { message: "Invalid invitation link" });
      }
      if (invState.usedAt !== null) {
        throw new HTTPException(409, { message: "Invitation already accepted" });
      }
      if (invState.expiresAt < new Date()) {
        throw new HTTPException(410, { message: "Invitation has expired" });
      }
      throw new HTTPException(409, { message: "Invitation already accepted" });
    }

    const [m] = await tx
      .update(noteMembers)
      .set({
        status: "accepted",
        acceptedUserId: userId,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(noteMembers.noteId, claimed.noteId),
          eq(noteMembers.memberEmail, claimed.memberEmail),
          eq(noteMembers.isDeleted, false),
        ),
      )
      .returning({
        role: noteMembers.role,
        status: noteMembers.status,
      });

    if (!m) {
      throw new HTTPException(404, { message: "Member record not found" });
    }

    return [m];
  });

  return c.json({
    noteId: invitation.noteId,
    role: updatedMember.role,
    status: "accepted",
  });
});

export default app;
