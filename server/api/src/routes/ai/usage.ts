import { Hono } from "hono";
import { authRequired } from "../../middleware/auth.js";
import { getUserTier } from "../../services/subscriptionService.js";
import { checkUsage } from "../../services/usageService.js";
import type { AppEnv } from "../../types/index.js";

const app = new Hono<AppEnv>();

app.get("/", authRequired, async (c) => {
  const userId = c.get("userId");
  const db = c.get("db");

  const tier = await getUserTier(userId, db);
  const usage = await checkUsage(userId, tier, db);

  return c.json({
    tier,
    budget_units: usage.budgetUnits,
    consumed_units: usage.consumedUnits,
    remaining_units: usage.remaining,
    usage_percent: usage.usagePercent,
  });
});

export default app;
