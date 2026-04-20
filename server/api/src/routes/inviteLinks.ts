/**
 * 共有リンクの公開ルート（プレビュー・受諾）
 *
 * GET  /invite-links/:token         — プレビュー（認証不要）
 * POST /invite-links/:token/redeem  — 受諾（認証必須）
 *
 * Public invite-link routes (preview + redeem).
 */
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { eq } from "drizzle-orm";
import { noteInviteLinks, notes, users } from "../schema/index.js";
import { authRequired } from "../middleware/auth.js";
import {
  classifyInviteLink,
  redeemInviteLink,
  type RedeemFailureReason,
} from "../services/inviteLinkService.js";
import type { AppEnv } from "../types/index.js";
import type { Redis } from "ioredis";

const app = new Hono<AppEnv>();

// ── Rate limiting (redeem) ─────────────────────────────────────────────────

/** Redeem のレート制限ウィンドウ（1 分）/ Redeem rate-limit window (1 min). */
const REDEEM_WINDOW_SEC = 60;
/** Redeem の 1 ウィンドウ上限 / Max redeem attempts per IP per minute. */
const REDEEM_WINDOW_LIMIT = 30;

/**
 * INCR + EXPIRE-on-create を Lua で 1 往復化する（固定ウィンドウ）。
 * Atomic fixed-window counter via a 1-roundtrip Lua script. Mirrors the
 * pattern already used by the `/invite/:token/email-link` route.
 */
const INCR_WITH_EXPIRE_ON_CREATE =
  "local c = redis.call('incr', KEYS[1]); if c == 1 then redis.call('expire', KEYS[1], ARGV[1]) end; return c";

async function incrWithExpire(redis: Redis, key: string, ttlSec: number): Promise<number> {
  const result = await redis.eval(INCR_WITH_EXPIRE_ON_CREATE, 1, key, String(ttlSec));
  if (typeof result === "number") return result;
  if (typeof result === "string") {
    const parsed = Number.parseInt(result, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

async function getRetryAfter(redis: Redis, key: string, fallbackSec: number): Promise<number> {
  const ttl = await redis.ttl(key);
  return ttl > 0 ? ttl : fallbackSec;
}

/**
 * `x-forwarded-for` ヘッダの先頭ホップをクライアント IP として採用する。
 * Pick the leading `x-forwarded-for` hop as the client IP (fallback: "unknown").
 */
function pickIp(headerValue: string | undefined): string {
  if (!headerValue) return "unknown";
  const [first] = headerValue.split(",");
  return (first ?? "").trim() || "unknown";
}

// ── GET /invite-links/:token ───────────────────────────────────────────────

/**
 * リンクのプレビュー情報を返す。トークンが存在しない場合のみ 404。
 * 取り消し済み・期限切れ・上限到達は 200 + `status` フィールドで返し、
 * UI が「このリンクは取り消されています」等を表示できるようにする。
 *
 * Preview endpoint. Only unknown tokens are 404 — revoked / expired /
 * exhausted links still return 200 with a `status` field so the UI can render
 * the correct state message.
 */
app.get("/:token", async (c) => {
  const token = c.req.param("token");
  const db = c.get("db");

  const [row] = await db
    .select({
      id: noteInviteLinks.id,
      noteId: noteInviteLinks.noteId,
      role: noteInviteLinks.role,
      expiresAt: noteInviteLinks.expiresAt,
      maxUses: noteInviteLinks.maxUses,
      usedCount: noteInviteLinks.usedCount,
      revokedAt: noteInviteLinks.revokedAt,
      requireSignIn: noteInviteLinks.requireSignIn,
      label: noteInviteLinks.label,
      noteTitle: notes.title,
      inviterName: users.name,
    })
    .from(noteInviteLinks)
    .leftJoin(notes, eq(notes.id, noteInviteLinks.noteId))
    .leftJoin(users, eq(users.id, noteInviteLinks.createdByUserId))
    .where(eq(noteInviteLinks.token, token))
    .limit(1);

  if (!row) {
    throw new HTTPException(404, { message: "Invalid invite link" });
  }

  const status = classifyInviteLink(row);
  const remainingUses = row.maxUses === null ? null : Math.max(0, row.maxUses - row.usedCount);

  return c.json({
    status,
    noteId: row.noteId,
    noteTitle: row.noteTitle ?? "Untitled",
    inviterName: row.inviterName ?? "Unknown",
    role: row.role,
    expiresAt: row.expiresAt,
    remainingUses,
    maxUses: row.maxUses,
    usedCount: row.usedCount,
    requireSignIn: row.requireSignIn,
    label: row.label,
  });
});

// ── POST /invite-links/:token/redeem ───────────────────────────────────────

/**
 * 失敗理由を HTTP ステータスへマップする。
 * Map service-level failure reasons to HTTP statuses.
 */
function statusForFailure(reason: RedeemFailureReason): number {
  switch (reason) {
    case "not_found":
      return 404;
    case "revoked":
    case "expired":
    case "exhausted":
      return 410;
    case "sign_in_required":
      return 401;
    case "member_email_missing":
      return 400;
  }
}

app.post("/:token/redeem", authRequired, async (c) => {
  const token = c.req.param("token");
  const userId = c.get("userId");
  const userEmail = c.get("userEmail");
  const db = c.get("db");

  if (!userEmail?.trim()) {
    throw new HTTPException(400, {
      message: "Could not determine your email address. Please log in again.",
    });
  }

  // レート制限: Redis がある場合のみ。IP ベース 30/分。
  // IP-based 30/min rate limit, only enforced when Redis is configured.
  const redis = c.get("redis") as Redis | undefined;
  if (redis) {
    const ip = pickIp(c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? undefined);
    const key = `ratelimit:invite-link:redeem:${ip}`;
    const count = await incrWithExpire(redis, key, REDEEM_WINDOW_SEC);
    if (count > REDEEM_WINDOW_LIMIT) {
      const retryAfter = await getRetryAfter(redis, key, REDEEM_WINDOW_SEC);
      return c.json(
        {
          error: "RATE_LIMIT_EXCEEDED",
          message: `Rate limited. Retry in ${retryAfter} seconds`,
          retry_after: retryAfter,
        },
        429,
        {
          "Retry-After": String(retryAfter),
          "X-RateLimit-Limit": String(REDEEM_WINDOW_LIMIT),
          "X-RateLimit-Remaining": "0",
        },
      );
    }
  }

  const result = await redeemInviteLink({
    db,
    token,
    redeemedByUserId: userId,
    redeemedEmail: userEmail,
  });

  if (!result.ok) {
    return c.json(
      { error: result.reason, status: result.reason },
      statusForFailure(result.reason) as 400 | 401 | 404 | 410,
    );
  }

  return c.json({
    noteId: result.noteId,
    role: result.role,
    isNewRedemption: result.isNewRedemption,
    alreadyMember: result.alreadyMember,
    status: "accepted",
  });
});

export default app;
