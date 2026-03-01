import { Hono } from "hono";
import { Polar } from "@polar-sh/sdk";
import { authRequired } from "../middleware/auth.js";
import { getEnv } from "../lib/env.js";
import { getSubscription, getUserTier } from "../services/subscriptionService.js";
import { checkUsage } from "../services/usageService.js";
import type { AppEnv } from "../types/index.js";

function createPolar(): Polar {
  return new Polar({
    accessToken: getEnv("POLAR_ACCESS_TOKEN"),
    server: process.env.NODE_ENV === "production" ? "production" : "sandbox",
  });
}

// Polar SDK >=0.43 exposes `subscriptions` on the Polar class but TS 5.9 + NodeNext
// resolution occasionally fails to resolve the getter's return type via the dist d.ts.
// At runtime the property is always present. We access it through a helper to keep the
// rest of the code type-safe while silencing the false-positive.
function polarSubscriptions(polar: Polar) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (polar as any).subscriptions as {
    update(req: { id: string; subscriptionUpdate: Record<string, unknown> }): Promise<unknown>;
  };
}

const app = new Hono<AppEnv>();

/**
 * GET /details — subscription details for the authenticated user
 */
app.get("/details", authRequired, async (c) => {
  const userId = c.get("userId");
  const db = c.get("db");

  const tier = await getUserTier(userId, db);
  const subscription = await getSubscription(userId, db);
  const usage = await checkUsage(userId, tier, db);

  if (!subscription) {
    return c.json({
      plan: "free" as const,
      status: "active",
      billingInterval: null,
      currentPeriodStart: null,
      currentPeriodEnd: null,
      usage: {
        budgetUnits: usage.budgetUnits,
        consumedUnits: usage.consumedUnits,
        remainingUnits: usage.remaining,
        usagePercent: usage.usagePercent,
      },
    });
  }

  return c.json({
    plan: subscription.plan,
    status: subscription.status,
    billingInterval: subscription.billingInterval,
    currentPeriodStart: subscription.currentPeriodStart,
    currentPeriodEnd: subscription.currentPeriodEnd,
    usage: {
      budgetUnits: usage.budgetUnits,
      consumedUnits: usage.consumedUnits,
      remainingUnits: usage.remaining,
      usagePercent: usage.usagePercent,
    },
  });
});

/**
 * POST /cancel — cancel at period end
 */
app.post("/cancel", authRequired, async (c) => {
  const userId = c.get("userId");
  const db = c.get("db");

  const subscription = await getSubscription(userId, db);
  if (!subscription?.externalId) {
    return c.json({ error: "No active subscription found" }, 404);
  }

  const polar = createPolar();
  try {
    await polarSubscriptions(polar).update({
      id: subscription.externalId,
      subscriptionUpdate: { cancelAtPeriodEnd: true },
    });
    return c.json({ success: true, message: "Subscription will be canceled at period end" });
  } catch (err) {
    console.error("[subscriptionManage] cancel failed:", err);
    return c.json({ error: "Failed to cancel subscription" }, 500);
  }
});

/**
 * POST /reactivate — undo cancel-at-period-end
 */
app.post("/reactivate", authRequired, async (c) => {
  const userId = c.get("userId");
  const db = c.get("db");

  const subscription = await getSubscription(userId, db);
  if (!subscription?.externalId) {
    return c.json({ error: "No subscription found" }, 404);
  }

  const polar = createPolar();
  try {
    await polarSubscriptions(polar).update({
      id: subscription.externalId,
      subscriptionUpdate: { cancelAtPeriodEnd: false },
    });
    return c.json({ success: true, message: "Subscription reactivated" });
  } catch (err) {
    console.error("[subscriptionManage] reactivate failed:", err);
    return c.json({ error: "Failed to reactivate subscription" }, 500);
  }
});

/**
 * POST /change-plan — switch between monthly and yearly billing
 */
app.post("/change-plan", authRequired, async (c) => {
  const userId = c.get("userId");
  const db = c.get("db");
  let billingInterval: "monthly" | "yearly" | undefined;
  try {
    const body = await c.req.json<{ billingInterval?: unknown }>();
    billingInterval =
      body.billingInterval === "monthly" || body.billingInterval === "yearly"
        ? body.billingInterval
        : undefined;
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  if (!billingInterval) {
    return c.json({ error: "billingInterval must be 'monthly' or 'yearly'" }, 400);
  }

  const subscription = await getSubscription(userId, db);
  if (!subscription?.externalId) {
    return c.json({ error: "No active subscription found" }, 404);
  }

  const productId =
    billingInterval === "yearly"
      ? process.env.POLAR_PRO_YEARLY_PRODUCT_ID
      : process.env.POLAR_PRO_MONTHLY_PRODUCT_ID;

  if (!productId) {
    return c.json({ error: "Product ID not configured for this billing interval" }, 500);
  }

  const polar = createPolar();
  try {
    await polarSubscriptions(polar).update({
      id: subscription.externalId,
      subscriptionUpdate: { productId },
    });
    return c.json({ success: true, message: `Switched to ${billingInterval} billing` });
  } catch (err) {
    console.error("[subscriptionManage] change-plan failed:", err);
    return c.json({ error: "Failed to change plan" }, 500);
  }
});

export default app;
