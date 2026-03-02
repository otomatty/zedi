import { Hono } from "hono";
import { authRequired } from "../../middleware/auth.js";
import { getUserTier, getSubscription } from "../../services/subscriptionService.js";
import { checkUsage } from "../../services/usageService.js";
import type { AppEnv } from "../../types/index.js";

const app = new Hono<AppEnv>();

app.get("/", authRequired, async (c) => {
  const userId = c.get("userId");
  const db = c.get("db");

  const tier = await getUserTier(userId, db);
  const subscription = await getSubscription(userId, db);
  const usage = await checkUsage(userId, tier, db);

  return c.json({
    plan: tier,
    subscription,
    usage: {
      budgetUnits: usage.budgetUnits,
      consumedUnits: usage.consumedUnits,
      remainingUnits: usage.remaining,
      usagePercent: usage.usagePercent,
    },
  });
});

export default app;
