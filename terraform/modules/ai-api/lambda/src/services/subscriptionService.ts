/**
 * Subscription service — retrieves user subscription status from Aurora
 */

import { execute } from "../lib/db.js";
import type { EnvConfig, Subscription } from "../types/index";

// Simple in-memory cache (per Lambda invocation warm instance)
const _cache = new Map<string, { sub: Subscription | null; at: number }>();
const CACHE_TTL = 30 * 1000; // 30 seconds

export async function getSubscription(
  userId: string,
  env: EnvConfig
): Promise<Subscription | null> {
  const now = Date.now();
  const cached = _cache.get(userId);
  if (cached && now - cached.at < CACHE_TTL) {
    return cached.sub;
  }

  const rows = await execute<Subscription>(
    `SELECT id, user_id, plan, status, current_period_start, current_period_end
     FROM subscriptions
     WHERE user_id = :userId AND status IN ('active', 'trialing')
     LIMIT 1`,
    { userId },
    env
  );

  const sub = rows.length > 0 ? rows[0] : null;
  _cache.set(userId, { sub, at: now });
  return sub;
}
