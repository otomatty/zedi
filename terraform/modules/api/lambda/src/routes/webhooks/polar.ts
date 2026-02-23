/**
 * POST /api/webhooks/polar — Polar Webhook
 *
 * Standard Webhooks 署名検証 + サブスクリプション状態更新
 * 認証: API GW JWT ではなく Webhook 署名 (Standard Webhooks ヘッダー)
 *
 * @see https://polar.sh/docs/integrate/webhooks/delivery
 */
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { eq } from "drizzle-orm";
import { validateEvent, WebhookVerificationError } from "@polar-sh/sdk/webhooks";
import { subscriptions, users } from "../../schema";
import type { AppEnv } from "../../types";
import { getPolarSecrets } from "../../lib/secrets";
import { getEnvConfig } from "../../env";

const app = new Hono<AppEnv>();

app.post("/", async (c) => {
  const env = getEnvConfig();
  const secretArn = env.POLAR_SECRET_ARN;

  if (!secretArn) {
    throw new HTTPException(500, { message: "Polar secret ARN not configured" });
  }

  // Secrets Manager から Webhook シークレットを取得
  const secrets = await getPolarSecrets(secretArn);
  const webhookSecret = secrets.POLAR_WEBHOOK_SECRET;

  if (!webhookSecret) {
    throw new HTTPException(500, { message: "Polar webhook secret not configured" });
  }

  // Standard Webhooks 署名検証
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
  } catch (error) {
    if (error instanceof WebhookVerificationError) {
      console.error("[polar-webhook] Signature verification failed:", error.message);
      throw new HTTPException(403, { message: "Invalid webhook signature" });
    }
    throw error;
  }

  const eventType = event.type;
  const data = event.data;
  const db = c.get("db");

  // ── userId を解決 ──
  // Polar の customer.external_id に Cognito userId を格納している前提
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
    // Webhook は 2xx を返さないと再送され続ける
    return c.json({ received: true, warning: "userId not resolved" });
  }

  // Polar の subscription/order ID
  const externalId = data.id ? String(data.id) : null;
  const externalCustomerId = customer?.externalId ?? null;

  // billing_interval を判定 (Polar: 'month' | 'year')
  const recurringInterval = data.recurringInterval as string | undefined;
  const billingInterval =
    recurringInterval === "month" ? "monthly" : recurringInterval === "year" ? "yearly" : null;

  // 期間情報
  const currentPeriodStart = data.currentPeriodStart as string | undefined;
  const currentPeriodEnd = data.currentPeriodEnd as string | undefined;

  switch (eventType) {
    // ── サブスクリプション有効化 ──
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

    // ── キャンセル（期間終了時予約 or 即時） ──
    case "subscription.canceled": {
      await db
        .update(subscriptions)
        .set({
          status: "canceled",
          updatedAt: new Date(),
        })
        .where(eq(subscriptions.userId, userId));

      console.log(`[polar-webhook] ${eventType}: userId=${userId} → canceled`);
      break;
    }

    // ── 最終無効化（billing 停止 + 特典剥奪） ──
    case "subscription.revoked": {
      await db
        .update(subscriptions)
        .set({
          plan: "free",
          status: "canceled",
          updatedAt: new Date(),
        })
        .where(eq(subscriptions.userId, userId));

      console.log(`[polar-webhook] ${eventType}: userId=${userId} → free/canceled`);
      break;
    }

    // ── 支払い失敗 ──
    case "subscription.past_due": {
      await db
        .update(subscriptions)
        .set({
          status: "past_due",
          updatedAt: new Date(),
        })
        .where(eq(subscriptions.userId, userId));

      console.log(`[polar-webhook] ${eventType}: userId=${userId} → past_due`);
      break;
    }

    // ── catch-all: subscription.updated ──
    case "subscription.updated": {
      const status = data.status as string | undefined;
      if (status === "past_due") {
        await db
          .update(subscriptions)
          .set({ status: "past_due", updatedAt: new Date() })
          .where(eq(subscriptions.userId, userId));
        console.log(`[polar-webhook] ${eventType}: userId=${userId} → past_due (via updated)`);
      } else if (status === "active") {
        // 期間更新など
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
        console.log(`[polar-webhook] ${eventType}: userId=${userId} → active (via updated)`);
      }
      break;
    }

    // ── 支払い成功（更新時） ──
    case "order.paid": {
      console.log(`[polar-webhook] ${eventType}: order paid for userId=${userId}`);
      // 期間情報は subscription.updated で更新されるため、ここではログのみ
      break;
    }

    default:
      console.log(`[polar-webhook] Unhandled event: ${eventType}`);
  }

  return c.json({ received: true });
});

export default app;
