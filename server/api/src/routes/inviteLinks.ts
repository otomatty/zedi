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
import { and, eq } from "drizzle-orm";
import { noteInviteLinks, notes, users } from "../schema/index.js";
import { authRequired } from "../middleware/auth.js";
import {
  classifyInviteLink,
  redeemInviteLink,
  type RedeemFailureReason,
} from "../services/inviteLinkService.js";
import { extractClientIp } from "../lib/clientIp.js";
import type { AppEnv } from "../types/index.js";
import type { KvStore } from "../lib/kv/index.js";

const app = new Hono<AppEnv>();

// ── Rate limiting (redeem) ─────────────────────────────────────────────────

/** Redeem のレート制限ウィンドウ（1 分）/ Redeem rate-limit window (1 min). */
const REDEEM_WINDOW_SEC = 60;
/** Redeem の 1 ウィンドウ上限 / Max redeem attempts per IP per minute. */
const REDEEM_WINDOW_LIMIT = 30;

/**
 * 残りの再試行待ち秒数を算出する（現時点での TTL ベース）。固定ウィンドウの
 * INCR + EXPIRE-on-create は KvStore の `incrWithTtl` がストア側で原子的に行う。
 *
 * Compute retry-after from the current TTL. The atomic fixed-window counter
 * (INCR + EXPIRE-on-create) lives in KvStore#incrWithTtl.
 */
async function getRetryAfter(kv: KvStore, key: string, fallbackSec: number): Promise<number> {
  return (await kv.ttl(key)) ?? fallbackSec;
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

  // 論理削除されたノートのリンクは「不明」扱いにする（#672 review: soft-delete
  // されたノートでプレビューが成立すると誤解を招く）。`notes` を INNER JOIN
  // し `isDeleted = false` を条件に加える。
  //
  // Links whose note has been soft-deleted are treated as unknown tokens.
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
    .innerJoin(notes, eq(notes.id, noteInviteLinks.noteId))
    .leftJoin(users, eq(users.id, noteInviteLinks.createdByUserId))
    .where(and(eq(noteInviteLinks.token, token), eq(notes.isDeleted, false)))
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

  // レート制限: KvStore がある場合のみ。user + IP の複合キーで 30/分。
  //
  // IP は `extractClientIp` 経由で取得し、`TRUST_PROXY` が false のときは
  // ソケット由来のアドレスのみを採用する（#672 review: 生の XFF を信じると
  // ヘッダ偽装でレート制限を迂回できる）。IP が取れないときは `"unknown"`
  // に畳むが、`userId` がキーに含まれるので匿名の大量投擲にはならない。
  //
  // KvStore 呼び出しは best-effort: タイムアウトや一時的な障害で redeem 本体を
  // 落とさないよう、全ての KvStore 操作を try/catch に包み、失敗時はレート制限
  // 無効のまま続行する（#672 review: Critical — outage で 500 にしない）。
  //
  // Rate limit is best-effort: combine authenticated user id with a trusted
  // client IP (falling back to the socket peer when proxy headers are not
  // trusted) and tolerate store outages so a transient failure cannot take
  // down redeem. When the limiter can't evaluate, we let the request through.
  const kv = c.get("kv");
  if (kv) {
    const ip = extractClientIp(c) ?? "unknown";
    const key = `ratelimit:invite-link:redeem:${userId}:${ip}`;
    try {
      const count = await kv.incrWithTtl(key, REDEEM_WINDOW_SEC);
      if (count > REDEEM_WINDOW_LIMIT) {
        const retryAfter = await getRetryAfter(kv, key, REDEEM_WINDOW_SEC);
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
    } catch (err) {
      // レート制限は保護的機能でありコアロジックではない。失敗時はスキップする。
      // Best-effort: a limiter outage must not block a valid redeem.
      console.warn("[invite-links] rate-limit check skipped due to KV store error:", err);
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
