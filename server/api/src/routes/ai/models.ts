import { Hono } from "hono";
import { eq, asc } from "drizzle-orm";
import { aiModels } from "../../schema/index.js";
import { authOptional } from "../../middleware/auth.js";
import { getUserTier } from "../../services/subscriptionService.js";
import type { AppEnv, UserTier } from "../../types/index.js";

const app = new Hono<AppEnv>();

app.get("/", authOptional, async (c) => {
  let userId: string | undefined;
  try {
    userId = c.get("userId");
  } catch {
    userId = undefined;
  }
  const db = c.get("db");

  let tier: UserTier = "free";
  if (userId) {
    tier = await getUserTier(userId, db);
  }

  const models = await db
    .select({
      id: aiModels.id,
      provider: aiModels.provider,
      model_id: aiModels.modelId,
      display_name: aiModels.displayName,
      tier_required: aiModels.tierRequired,
      is_active: aiModels.isActive,
      sort_order: aiModels.sortOrder,
    })
    .from(aiModels)
    .where(eq(aiModels.isActive, true))
    .orderBy(asc(aiModels.sortOrder));

  const filtered = models.map((m) => ({
    ...m,
    available: tier === "pro" || m.tier_required === "free",
  }));

  return c.json({ models: filtered, tier });
});

export default app;
