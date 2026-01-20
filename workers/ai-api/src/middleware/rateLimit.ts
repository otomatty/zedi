import type { Context, Next } from "hono";
import type { Env } from "../types/env";
import type { AuthContext } from "./auth";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

function getLimitWindowSeconds(env: Env): number {
  const parsed = Number(env.RATE_LIMIT_WINDOW_SECONDS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 3600;
}

function getLimitMaxRequests(env: Env): number {
  const parsed = Number(env.RATE_LIMIT_MAX_REQUESTS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 100;
}

function getRateLimitKey(c: Context<{ Variables: AuthContext }>): string {
  const userId = c.get("userId");
  if (userId) return `user:${userId}`;
  const ip =
    c.req.header("CF-Connecting-IP") ??
    c.req.header("X-Forwarded-For") ??
    "unknown";
  return `ip:${ip}`;
}

export async function rateLimit(
  c: Context<{ Bindings: Env; Variables: AuthContext }>,
  next: Next
) {
  const key = getRateLimitKey(c);
  const now = Date.now();
  const windowSeconds = getLimitWindowSeconds(c.env);
  const maxRequests = getLimitMaxRequests(c.env);
  const resetAt = now + windowSeconds * 1000;

  const entry = rateLimitStore.get(key);
  if (!entry || entry.resetAt <= now) {
    rateLimitStore.set(key, { count: 1, resetAt });
    await next();
    return;
  }

  if (entry.count >= maxRequests) {
    const retryAfterSeconds = Math.ceil((entry.resetAt - now) / 1000);
    c.header("Retry-After", retryAfterSeconds.toString());
    return c.json(
      {
        error: "Rate limit exceeded",
        retryAfterSeconds,
      },
      429
    );
  }

  entry.count += 1;
  rateLimitStore.set(key, entry);
  await next();
}
