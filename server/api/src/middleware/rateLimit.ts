/**
 * rateLimit — Redis ベースのシンプルなレート制限ミドルウェア
 *
 * 使い方 / Usage:
 *   - 既存 API: `rateLimit()` もしくは `rateLimit("pro")`
 *     → 時間単位 (1h) の tier ごとの上限 (free=120, pro=600) を適用する。
 *   - 任意構成: `rateLimit({ limit: 30, windowSec: 60, keyBy: "user", label: "mcp:clip" })`
 *     → MCP のような細かい per-endpoint 制限を掛けたい場合に使う。
 *
 * 429 応答には `Retry-After` / `X-RateLimit-*` ヘッダと、
 * MCP クライアントが解釈できる JSON ボディを返す。
 *
 * Simple Redis-based rate limiter. Supports the legacy string-tier call form
 * and a richer options object for per-endpoint limits (windowSec, keyBy, label).
 */
import type { Redis } from "ioredis";
import { createMiddleware } from "hono/factory";
import { extractClientIp } from "../lib/clientIp.js";
import type { AppEnv } from "../types/index.js";

const TIER_LIMITS: Record<string, number> = {
  free: 120,
  pro: 600,
};

const HOUR_WINDOW_SEC = 3_600;

/**
 * レート制限のキー戦略 / Key strategy for the rate limit bucket.
 *
 * - `user`  : `userId` を優先し、無ければ IP にフォールバック。
 * - `ip`    : 常に IP を使う。認証前のエンドポイント (例: /api/mcp/session) 向け。
 * - `userOrIp` : `user` と同義 (別名として公開)。
 */
export type RateLimitKeyBy = "user" | "ip" | "userOrIp";

/**
 * rateLimit の詳細オプション / Options for the rate limit middleware.
 */
export interface RateLimitOptions {
  /** このウィンドウ内に許可する最大リクエスト数。 Max requests allowed per window. */
  limit: number;
  /** ウィンドウ長 (秒)。 Window length in seconds. */
  windowSec: number;
  /** キーの導出元。省略時は `user`。 Key derivation source; defaults to `user`. */
  keyBy?: RateLimitKeyBy;
  /** Redis キーの接頭辞 (エンドポイントの区別に使う)。 Redis key prefix used to scope the bucket per endpoint. */
  label?: string;
}

function isOptions(arg: unknown): arg is RateLimitOptions {
  return typeof arg === "object" && arg !== null && "limit" in arg && "windowSec" in arg;
}

function currentHourWindow(): string {
  // Per-hour window (ISO string truncated to the hour).
  return new Date().toISOString().slice(0, 13);
}

function currentWindowBucket(windowSec: number): number {
  return Math.floor(Date.now() / 1000 / windowSec);
}

/**
 * レート制限ミドルウェアを生成する。
 * Returns a Hono middleware that enforces a rate limit backed by Redis.
 *
 * @param arg - 既存互換の tier 文字列 (`"free"` / `"pro"`) もしくは {@link RateLimitOptions}.
 */
export function rateLimit(arg: string | RateLimitOptions = "free") {
  const options: Required<RateLimitOptions> = isOptions(arg)
    ? {
        limit: arg.limit,
        windowSec: arg.windowSec,
        keyBy: arg.keyBy ?? "user",
        label: arg.label ?? "default",
      }
    : {
        limit: TIER_LIMITS[arg] ?? TIER_LIMITS.free ?? 120,
        windowSec: HOUR_WINDOW_SEC,
        keyBy: "user",
        label: `tier:${arg}`,
      };

  return createMiddleware<AppEnv>(async (c, next) => {
    const redis = c.get("redis") as Redis | undefined;
    if (!redis) {
      await next();
      return;
    }

    const userId = c.get("userId");
    const ip = extractClientIp(c);

    // Resolve the subject we key on. `user` prefers userId and falls back to IP,
    // `ip` always uses IP. If neither is available we let the request through
    // (no reliable way to key the bucket).
    const subject = options.keyBy === "ip" ? ip : (userId ?? ip);
    if (!subject) {
      await next();
      return;
    }

    const windowToken =
      options.windowSec === HOUR_WINDOW_SEC
        ? currentHourWindow()
        : String(currentWindowBucket(options.windowSec));
    const key = `ratelimit:${options.label}:${subject}:${windowToken}`;

    // INCR と EXPIRE をトランザクションで発行することで、INCR 後にアプリが落ちても
    // TTL 無しのキーが残り続けることを防ぐ。ioredis の `multi().exec()` は Redis
    // の MULTI/EXEC を使うためサーバ側でアトミック。
    // Wrap INCR + EXPIRE in a MULTI/EXEC transaction so a crash between the two
    // commands cannot leave a TTL-less key lingering in Redis.
    const ttl = Math.max(options.windowSec * 2, options.windowSec + 60);
    const results = await redis.multi().incr(key).expire(key, ttl).exec();
    const incrResult = results?.[0];
    const count =
      Array.isArray(incrResult) && typeof incrResult[1] === "number" ? incrResult[1] : 0;

    if (count > options.limit) {
      // 現在のウィンドウが終わるまでの残り秒数。1h ウィンドウも実時間で計算する
      // (固定 60 秒だと legacy tier の呼び出し元でリトライが早すぎた)。
      // Remaining seconds until the current bucket rolls over — compute from
      // wall-clock so legacy hourly callers get an accurate Retry-After too.
      const retryAfter = Math.max(
        1,
        options.windowSec - (Math.floor(Date.now() / 1000) % options.windowSec),
      );
      return c.json(
        {
          error: "RATE_LIMIT_EXCEEDED",
          message: `Rate limited, retry in ${retryAfter} seconds`,
          retry_after: retryAfter,
        },
        429,
        {
          "Retry-After": String(retryAfter),
          "X-RateLimit-Limit": String(options.limit),
          "X-RateLimit-Remaining": "0",
        },
      );
    }

    c.header("X-RateLimit-Limit", String(options.limit));
    c.header("X-RateLimit-Remaining", String(Math.max(0, options.limit - count)));
    await next();
  });
}
