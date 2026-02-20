/**
 * POST /api/webhooks/lemonsqueezy — LemonSqueezy Webhook
 *
 * HMAC-SHA256 署名検証 + サブスクリプション状態更新
 * 認証: API GW JWT ではなく Webhook 署名 (X-Signature ヘッダー)
 */
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { eq, sql } from 'drizzle-orm';
import { subscriptions, users } from '../../schema';
import type { AppEnv } from '../../types';
import { getEnvConfig } from '../../env';

const app = new Hono<AppEnv>();

app.post('/', async (c) => {
  const env = getEnvConfig();
  const webhookSecret = env.WEBHOOK_SECRET;

  if (!webhookSecret) {
    throw new HTTPException(500, { message: 'Webhook secret not configured' });
  }

  // 署名検証
  const signature = c.req.header('x-signature') || c.req.header('X-Signature');
  if (!signature) {
    throw new HTTPException(401, { message: 'Missing signature' });
  }

  const rawBody = await c.req.text();

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(webhookSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(rawBody));
  const computedHex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  // タイミングセーフ比較
  if (computedHex.length !== signature.length) {
    throw new HTTPException(401, { message: 'Invalid signature' });
  }
  const a = encoder.encode(computedHex);
  const b = encoder.encode(signature);
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  if (mismatch !== 0) {
    throw new HTTPException(401, { message: 'Invalid signature' });
  }

  // イベント処理
  const payload = JSON.parse(rawBody) as {
    meta: { event_name: string; custom_data?: { user_id?: string } };
    data: {
      id: string;
      attributes: {
        customer_id?: number;
        status?: string;
        renews_at?: string;
        ends_at?: string;
        current_period_start?: string;
        current_period_end?: string;
        billing_anchor?: number;
        variant_id?: number;
        first_subscription_item?: { price_id?: number };
      };
    };
  };

  const eventName = payload.meta.event_name;
  const customUserId = payload.meta.custom_data?.user_id;
  const attrs = payload.data.attributes;
  const externalId = String(payload.data.id);
  const externalCustomerId = attrs.customer_id ? String(attrs.customer_id) : null;

  const db = c.get('db');

  // userId を解決
  let userId: string | null = null;
  if (customUserId) {
    // custom_data.user_id が直接 users.id の場合
    const userRow = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, customUserId))
      .limit(1);
    userId = userRow[0]?.id ?? null;
  }

  if (!userId) {
    console.error(`[webhook] Cannot resolve userId for event ${eventName}`);
    // Webhook は 200 を返さないと再送され続ける
    return c.json({ received: true, warning: 'userId not resolved' });
  }

  // billing_interval を判定
  const billingInterval = determineBillingInterval(payload);

  switch (eventName) {
    case 'subscription_created':
    case 'subscription_updated':
    case 'subscription_resumed':
    case 'subscription_payment_success': {
      // UPSERT: pro + active
      await db
        .insert(subscriptions)
        .values({
          userId,
          plan: 'pro',
          status: 'active',
          externalId,
          externalCustomerId,
          billingInterval,
          currentPeriodStart: attrs.current_period_start
            ? new Date(attrs.current_period_start)
            : null,
          currentPeriodEnd: attrs.current_period_end
            ? new Date(attrs.current_period_end)
            : null,
        })
        .onConflictDoUpdate({
          target: subscriptions.userId,
          set: {
            plan: 'pro',
            status: 'active',
            externalId,
            externalCustomerId,
            billingInterval,
            currentPeriodStart: attrs.current_period_start
              ? new Date(attrs.current_period_start)
              : undefined,
            currentPeriodEnd: attrs.current_period_end
              ? new Date(attrs.current_period_end)
              : undefined,
            updatedAt: new Date(),
          },
        });

      console.log(`[webhook] ${eventName}: userId=${userId} → pro/active`);
      break;
    }

    case 'subscription_cancelled': {
      await db
        .update(subscriptions)
        .set({
          status: 'canceled',
          updatedAt: new Date(),
        })
        .where(eq(subscriptions.userId, userId));

      console.log(`[webhook] ${eventName}: userId=${userId} → canceled`);
      break;
    }

    case 'subscription_expired': {
      await db
        .update(subscriptions)
        .set({
          plan: 'free',
          status: 'canceled',
          updatedAt: new Date(),
        })
        .where(eq(subscriptions.userId, userId));

      console.log(`[webhook] ${eventName}: userId=${userId} → free/canceled`);
      break;
    }

    case 'subscription_payment_failed': {
      await db
        .update(subscriptions)
        .set({
          status: 'past_due',
          updatedAt: new Date(),
        })
        .where(eq(subscriptions.userId, userId));

      console.log(`[webhook] ${eventName}: userId=${userId} → past_due`);
      break;
    }

    default:
      console.log(`[webhook] Unhandled event: ${eventName}`);
  }

  return c.json({ received: true });
});

/**
 * billing_interval を判定
 */
function determineBillingInterval(
  payload: Record<string, unknown>,
): string | null {
  try {
    const meta = (payload as { meta?: { custom_data?: { billing_interval?: string } } })
      .meta;
    if (meta?.custom_data?.billing_interval) {
      return meta.custom_data.billing_interval;
    }
    // variant_id などから判定するロジックも可能だが、カスタムデータ優先
    return null;
  } catch {
    return null;
  }
}

export default app;
