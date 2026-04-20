/**
 * 招待受諾フロー API
 * Invitation acceptance flow API
 *
 * GET  /invite/:token             — トークン検証 + 招待情報取得（認証不要）
 * POST /invite/:token/accept      — 招待承認（認証必須）
 * POST /invite/:token/email-link  — 招待先メール宛のマジックリンク再送（認証任意）
 */
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { eq, and, isNull, gt } from "drizzle-orm";
import { noteInvitations, noteMembers, notes, users } from "../schema/index.js";
import { authRequired } from "../middleware/auth.js";
import { sendInvitationMagicLink } from "../services/magicLinkService.js";
import { getOptionalEnv } from "../lib/env.js";
import type { AppEnv } from "../types/index.js";
import type { Redis } from "ioredis";

const app = new Hono<AppEnv>();

/**
 * マジックリンク救済フローのレート制限定義。
 * Rate-limit thresholds for the magic-link rescue flow.
 */
const EMAIL_LINK_SHORT_WINDOW_SEC = 5 * 60; // 5 minutes
const EMAIL_LINK_SHORT_WINDOW_LIMIT = 1;
const EMAIL_LINK_DAILY_WINDOW_SEC = 24 * 60 * 60; // 1 day
const EMAIL_LINK_DAILY_WINDOW_LIMIT = 5;

/**
 * INCR + EXPIRE を MULTI で原子的に実施し、現在値を返す。
 * Atomically INCR + EXPIRE a key and return the counter value.
 */
async function incrWithExpire(redis: Redis, key: string, ttlSec: number): Promise<number> {
  const results = await redis.multi().incr(key).expire(key, ttlSec).exec();
  const incrResult = results?.[0];
  return Array.isArray(incrResult) && typeof incrResult[1] === "number" ? incrResult[1] : 0;
}

/**
 * 残りの再試行待ち秒数を算出する（現時点での TTL ベース）。
 * Compute the retry-after seconds based on the current TTL.
 */
async function getRetryAfter(redis: Redis, key: string, fallbackSec: number): Promise<number> {
  const ttl = await redis.ttl(key);
  return ttl > 0 ? ttl : fallbackSec;
}

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

// ── POST /invite/:token/email-link ─────────────────────────────────────────

/**
 * 招待先メール宛にワンクリックでサインインできるマジックリンクを送る。
 * 認証任意（未サインインでも mismatch ユーザーでも呼べる）。
 *
 * Send a one-click sign-in magic link to the invited email. No authentication
 * is required — both signed-out visitors and mismatch users can trigger it.
 *
 * トークン状態:
 * - 有効な pending トークン → 202 でメール送信を受理
 * - 期限切れ → 410
 * - 使用済み → 409
 * - 不明 → 404
 *
 * レート制限（同一 token あたり）:
 * - 5 分に 1 回
 * - 1 日に 5 回
 */
app.post("/:token/email-link", async (c) => {
  const token = c.req.param("token");
  const db = c.get("db");

  // トークン + ノートタイトル (optional) を取得 / Fetch invitation + note title
  const [invitation] = await db
    .select({
      memberEmail: noteInvitations.memberEmail,
      expiresAt: noteInvitations.expiresAt,
      usedAt: noteInvitations.usedAt,
      locale: noteInvitations.locale,
    })
    .from(noteInvitations)
    .where(eq(noteInvitations.token, token))
    .limit(1);

  if (!invitation) {
    throw new HTTPException(404, { message: "Invalid invitation link" });
  }

  // 使用済み → 409 (accept エンドポイントと同じ意味論)
  // Already used → 409 (same semantics as /accept)
  if (invitation.usedAt !== null) {
    throw new HTTPException(409, { message: "Invitation already accepted" });
  }

  // 期限切れ → 410 / Expired → 410
  if (invitation.expiresAt < new Date()) {
    throw new HTTPException(410, { message: "Invitation has expired" });
  }

  // レート制限は Redis がある場合のみ適用する。Redis 未設定の開発環境では無効化する。
  // Rate limits are enforced only when Redis is available (no-op in dev without Redis).
  const redis = c.get("redis") as Redis | undefined;
  if (redis) {
    const shortKey = `ratelimit:invite-email-link:5min:${token}`;
    const dailyKey = `ratelimit:invite-email-link:day:${token}`;

    const [shortCount, dailyCount] = await Promise.all([
      incrWithExpire(redis, shortKey, EMAIL_LINK_SHORT_WINDOW_SEC),
      incrWithExpire(redis, dailyKey, EMAIL_LINK_DAILY_WINDOW_SEC),
    ]);

    if (dailyCount > EMAIL_LINK_DAILY_WINDOW_LIMIT) {
      const retryAfter = await getRetryAfter(redis, dailyKey, EMAIL_LINK_DAILY_WINDOW_SEC);
      return c.json(
        {
          error: "RATE_LIMIT_EXCEEDED",
          message: `Rate limited (daily). Retry in ${retryAfter} seconds`,
          retry_after: retryAfter,
          scope: "daily",
        },
        429,
        {
          "Retry-After": String(retryAfter),
          "X-RateLimit-Limit": String(EMAIL_LINK_DAILY_WINDOW_LIMIT),
          "X-RateLimit-Remaining": "0",
        },
      );
    }

    if (shortCount > EMAIL_LINK_SHORT_WINDOW_LIMIT) {
      const retryAfter = await getRetryAfter(redis, shortKey, EMAIL_LINK_SHORT_WINDOW_SEC);
      return c.json(
        {
          error: "RATE_LIMIT_EXCEEDED",
          message: `Rate limited (short window). Retry in ${retryAfter} seconds`,
          retry_after: retryAfter,
          scope: "short",
        },
        429,
        {
          "Retry-After": String(retryAfter),
          "X-RateLimit-Limit": String(EMAIL_LINK_SHORT_WINDOW_LIMIT),
          "X-RateLimit-Remaining": "0",
        },
      );
    }
  }

  // マジックリンクの callbackURL は、既存の招待受諾 URL を使う。
  // The magic-link callback lands the user back on the invitation page.
  const baseUrl = getOptionalEnv("APP_URL", "https://zedi-note.app").replace(/\/$/, "");
  const callbackURL = `${baseUrl}/invite?token=${encodeURIComponent(token)}`;

  const sendResult = await sendInvitationMagicLink({
    email: invitation.memberEmail,
    callbackURL,
    locale: invitation.locale,
  });

  if (!sendResult.sent) {
    console.error("[invite email-link] Magic-link send failed:", sendResult.error);
    throw new HTTPException(502, { message: "Failed to send sign-in email" });
  }

  return c.json(
    {
      sent: true,
      memberEmail: invitation.memberEmail,
      retryAfterSec: EMAIL_LINK_SHORT_WINDOW_SEC,
    },
    202,
  );
});

export default app;
