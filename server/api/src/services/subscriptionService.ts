import { eq, and, or } from "drizzle-orm";
import { subscriptions } from "../schema/index.js";
import type { Database, UserTier } from "../types/index.js";

const _cache = new Map<string, { plan: UserTier; at: number }>();
const CACHE_TTL = 30_000;

export async function getUserTier(userId: string, db: Database): Promise<UserTier> {
  const now = Date.now();
  const cached = _cache.get(userId);
  if (cached && now - cached.at < CACHE_TTL) return cached.plan;

  const row = await db
    .select({ plan: subscriptions.plan })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.userId, userId),
        or(eq(subscriptions.status, "active"), eq(subscriptions.status, "trialing")),
      ),
    )
    .limit(1);

  const plan: UserTier = (row[0]?.plan as UserTier) ?? "free";
  _cache.set(userId, { plan, at: now });
  return plan;
}

export async function getSubscription(userId: string, db: Database) {
  const row = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .limit(1);

  return row[0] ?? null;
}
