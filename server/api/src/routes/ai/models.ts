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

  const rows = await db
    .select({
      id: aiModels.id,
      provider: aiModels.provider,
      modelId: aiModels.modelId,
      displayName: aiModels.displayName,
      tierRequired: aiModels.tierRequired,
      isActive: aiModels.isActive,
      sortOrder: aiModels.sortOrder,
    })
    .from(aiModels)
    .where(eq(aiModels.isActive, true))
    .orderBy(asc(aiModels.sortOrder));

  const toClientTier = (v: string | undefined): "free" | "paid" =>
    v === "pro" || v === "paid" ? "paid" : "free";

  const clientTier = toClientTier(tier);
  const models = rows.map((m) => {
    const tierRequired = toClientTier(m.tierRequired);
    return {
      id: m.id,
      provider: m.provider,
      modelId: m.modelId,
      displayName: m.displayName,
      tierRequired,
      available: clientTier === "paid" || tierRequired === "free",
    };
  });

  return c.json({ models, tier: clientTier });
});

export default app;
