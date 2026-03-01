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

  const now = new Date();
  const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  return c.json({
    tier,
    budgetUnits: usage.budgetUnits,
    consumedUnits: usage.consumedUnits,
    remaining: usage.remaining,
    usagePercent: usage.usagePercent,
    yearMonth,
  });
});

export default app;
