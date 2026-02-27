import type { Redis } from "ioredis";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import type { AppEnv } from "../types/index.js";

const TIER_LIMITS: Record<string, number> = {
  free: 120,
  pro: 600,
};

function currentWindow(): string {
  return new Date().toISOString().slice(0, 13); // per-hour window
}

export function rateLimit(tier: string = "free") {
  return createMiddleware<AppEnv>(async (c, next) => {
    const redis = c.get("redis") as Redis | undefined;
    const userId = c.get("userId");

    if (!redis || !userId) {
      await next();
      return;
    }

    const key = `ratelimit:${userId}:${currentWindow()}`;
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, 7200);

    const limit = TIER_LIMITS[tier] ?? TIER_LIMITS.free ?? 120;
    if (count > limit) {
      throw new HTTPException(429, { message: "RATE_LIMIT_EXCEEDED" });
    }

    c.header("X-RateLimit-Limit", String(limit));
    c.header("X-RateLimit-Remaining", String(Math.max(0, limit - count)));
    await next();
  });
}
