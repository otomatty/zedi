import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { eq } from "drizzle-orm";
import { validateEvent, WebhookVerificationError } from "@polar-sh/sdk/webhooks";
import { subscriptions, users } from "../../schema/index.js";
import type { AppEnv } from "../../types/index.js";

const app = new Hono<AppEnv>();

app.post("/", async (c) => {
  const webhookSecret = process.env.POLAR_WEBHOOK_SECRET;
  if (!webhookSecret) {
    throw new HTTPException(500, { message: "Polar webhook secret not configured" });
  }

  const rawBody = await c.req.text();
  const headers: Record<string, string> = {};
  c.req.raw.headers.forEach((value, key) => {
    headers[key] = value;
  });

  let event: { type: string; data: Record<string, unknown> };
  try {
    event = validateEvent(rawBody, headers, webhookSecret) as {
      type: string;
      data: Record<string, unknown>;
    };
  } catch (error: unknown) {
    if (error instanceof WebhookVerificationError) {
      console.error("[polar-webhook] Signature verification failed:", (error as Error).message);
      throw new HTTPException(403, { message: "Invalid webhook signature" });
    }
    throw error;
  }

  const eventType = event.type;
  const data = event.data;
  const db = c.get("db");

  let userId: string | null = null;
  const customer = data.customer as { externalId?: string } | undefined;
  if (customer?.externalId) {
    const userRow = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, customer.externalId))
      .limit(1);
    userId = userRow[0]?.id ?? null;
  }

  if (!userId) {
    console.error(`[polar-webhook] Cannot resolve userId for event ${eventType}`);
    return c.json({ received: true, warning: "userId not resolved" });
  }

  const externalId = data.id ? String(data.id) : null;
  const externalCustomerId = customer?.externalId ?? null;
  const recurringInterval = data.recurringInterval as string | undefined;
  const billingInterval =
    recurringInterval === "month" ? "monthly" : recurringInterval === "year" ? "yearly" : null;
  const currentPeriodStart = data.currentPeriodStart as string | undefined;
  const currentPeriodEnd = data.currentPeriodEnd as string | undefined;

  switch (eventType) {
    case "subscription.created":
    case "subscription.active":
    case "subscription.uncanceled": {
      await db
        .insert(subscriptions)
        .values({
          userId,
          plan: "pro",
          status: "active",
          externalId,
          externalCustomerId,
          billingInterval,
          currentPeriodStart: currentPeriodStart ? new Date(currentPeriodStart) : null,
          currentPeriodEnd: currentPeriodEnd ? new Date(currentPeriodEnd) : null,
        })
        .onConflictDoUpdate({
          target: subscriptions.userId,
          set: {
            plan: "pro",
            status: "active",
            externalId,
            externalCustomerId,
            billingInterval,
            currentPeriodStart: currentPeriodStart ? new Date(currentPeriodStart) : undefined,
            currentPeriodEnd: currentPeriodEnd ? new Date(currentPeriodEnd) : undefined,
            updatedAt: new Date(),
          },
        });
      console.log(`[polar-webhook] ${eventType}: userId=${userId} → pro/active`);
      break;
    }
    case "subscription.canceled": {
      await db
        .update(subscriptions)
        .set({ status: "canceled", updatedAt: new Date() })
        .where(eq(subscriptions.userId, userId));
      console.log(`[polar-webhook] ${eventType}: userId=${userId} → canceled`);
      break;
    }
    case "subscription.revoked": {
      await db
        .update(subscriptions)
        .set({ plan: "free", status: "canceled", updatedAt: new Date() })
        .where(eq(subscriptions.userId, userId));
      console.log(`[polar-webhook] ${eventType}: userId=${userId} → free/canceled`);
      break;
    }
    case "subscription.past_due": {
      await db
        .update(subscriptions)
        .set({ status: "past_due", updatedAt: new Date() })
        .where(eq(subscriptions.userId, userId));
      console.log(`[polar-webhook] ${eventType}: userId=${userId} → past_due`);
      break;
    }
    case "subscription.updated": {
      const status = data.status as string | undefined;
      if (status === "past_due") {
        await db
          .update(subscriptions)
          .set({ status: "past_due", updatedAt: new Date() })
          .where(eq(subscriptions.userId, userId));
      } else if (status === "active") {
        await db
          .update(subscriptions)
          .set({
            plan: "pro",
            status: "active",
            billingInterval,
            currentPeriodStart: currentPeriodStart ? new Date(currentPeriodStart) : undefined,
            currentPeriodEnd: currentPeriodEnd ? new Date(currentPeriodEnd) : undefined,
            updatedAt: new Date(),
          })
          .where(eq(subscriptions.userId, userId));
      }
      break;
    }
    case "order.paid": {
      console.log(`[polar-webhook] ${eventType}: order paid for userId=${userId}`);
      break;
    }
    default:
      console.log(`[polar-webhook] Unhandled event: ${eventType}`);
  }

  return c.json({ received: true });
});

export default app;
