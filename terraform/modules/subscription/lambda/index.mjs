/**
 * LemonSqueezy Webhook Handler Lambda
 *
 * Receives webhook events from LemonSqueezy and updates the subscriptions
 * table in Aurora PostgreSQL via RDS Data API.
 *
 * Webhook events handled:
 * - subscription_created
 * - subscription_updated
 * - subscription_cancelled
 * - subscription_resumed
 * - subscription_expired
 * - subscription_payment_success
 * - subscription_payment_failed
 */

import crypto from "node:crypto";
import { RDSDataClient, ExecuteStatementCommand } from "@aws-sdk/client-rds-data";

const rdsClient = new RDSDataClient({});

const {
  AURORA_CLUSTER_ARN,
  DB_CREDENTIALS_SECRET,
  AURORA_DATABASE_NAME = "zedi",
  LEMONSQUEEZY_WEBHOOK_SECRET,
} = process.env;

// ============================================================================
// Signature verification
// ============================================================================

function verifySignature(payload, signature) {
  if (!LEMONSQUEEZY_WEBHOOK_SECRET) {
    console.error("LEMONSQUEEZY_WEBHOOK_SECRET not configured");
    return false;
  }
  const hmac = crypto.createHmac("sha256", LEMONSQUEEZY_WEBHOOK_SECRET);
  hmac.update(payload);
  const digest = hmac.digest("hex");
  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
}

// ============================================================================
// Database helpers
// ============================================================================

async function execute(sql, params = {}) {
  const parameters = Object.entries(params).map(([name, value]) => ({
    name,
    value:
      value === null || value === undefined
        ? { isNull: true }
        : typeof value === "number"
          ? Number.isInteger(value) ? { longValue: value } : { stringValue: String(value) }
          : typeof value === "boolean"
            ? { booleanValue: value }
            : { stringValue: String(value) },
    ...(typeof value === "string" && /^[0-9a-f]{8}-/.test(value) ? { typeHint: "UUID" } : {}),
  }));

  const command = new ExecuteStatementCommand({
    resourceArn: AURORA_CLUSTER_ARN,
    secretArn: DB_CREDENTIALS_SECRET,
    database: AURORA_DATABASE_NAME,
    sql,
    parameters: parameters.length ? parameters : undefined,
    formatRecordsAs: "JSON",
  });

  const response = await rdsClient.send(command);
  if (response.formattedRecords) {
    return JSON.parse(response.formattedRecords);
  }
  return [];
}

// ============================================================================
// Subscription handlers
// ============================================================================

/**
 * Map LemonSqueezy subscription status to our internal status
 */
function mapStatus(lsStatus) {
  switch (lsStatus) {
    case "active":
      return "active";
    case "cancelled":
      return "canceled";
    case "past_due":
    case "unpaid":
      return "past_due";
    case "on_trial":
      return "trialing";
    case "expired":
    case "paused":
      return "canceled";
    default:
      return "active";
  }
}

/**
 * Resolve the Zedi user_id from the LemonSqueezy custom data.
 * The frontend should pass the user's Cognito sub as custom_data.user_id
 * when creating the checkout.
 */
function resolveUserId(webhookData) {
  // Custom data passed during checkout creation
  const customData = webhookData?.meta?.custom_data;
  if (customData?.user_id) return customData.user_id;

  // Fallback: check attributes
  const attrs = webhookData?.data?.attributes;
  if (attrs?.custom_data?.user_id) return attrs.custom_data.user_id;

  return null;
}

async function handleSubscriptionEvent(webhookData) {
  const attrs = webhookData?.data?.attributes;
  if (!attrs) {
    console.error("Missing subscription attributes");
    return;
  }

  const userId = resolveUserId(webhookData);
  if (!userId) {
    console.error("Cannot resolve user_id from webhook data");
    return;
  }

  const externalId = String(webhookData?.data?.id || "");
  const externalCustomerId = String(attrs.customer_id || "");
  const status = mapStatus(attrs.status);
  const periodStart = attrs.current_period_start || null;
  const periodEnd = attrs.current_period_end || null;

  // Upsert subscription
  await execute(
    `INSERT INTO subscriptions (user_id, plan, status, current_period_start, current_period_end, external_id, external_customer_id, updated_at)
     VALUES (:userId, 'paid', :status, :periodStart, :periodEnd, :externalId, :externalCustomerId, NOW())
     ON CONFLICT (user_id)
     DO UPDATE SET
       plan = CASE WHEN :status IN ('active', 'trialing') THEN 'paid' ELSE subscriptions.plan END,
       status = :status,
       current_period_start = COALESCE(:periodStart, subscriptions.current_period_start),
       current_period_end = COALESCE(:periodEnd, subscriptions.current_period_end),
       external_id = :externalId,
       external_customer_id = :externalCustomerId,
       updated_at = NOW()`,
    {
      userId,
      status,
      periodStart,
      periodEnd,
      externalId,
      externalCustomerId,
    }
  );

  console.log(`Subscription updated for user ${userId}: status=${status}`);
}

async function handleSubscriptionCancelled(webhookData) {
  const userId = resolveUserId(webhookData);
  if (!userId) return;

  await execute(
    `UPDATE subscriptions
     SET status = 'canceled', updated_at = NOW()
     WHERE user_id = :userId`,
    { userId }
  );
  console.log(`Subscription cancelled for user ${userId}`);
}

async function handleSubscriptionExpired(webhookData) {
  const userId = resolveUserId(webhookData);
  if (!userId) return;

  // When subscription expires, downgrade to free
  await execute(
    `UPDATE subscriptions
     SET plan = 'free', status = 'canceled', updated_at = NOW()
     WHERE user_id = :userId`,
    { userId }
  );
  console.log(`Subscription expired for user ${userId}`);
}

async function handlePaymentFailed(webhookData) {
  const userId = resolveUserId(webhookData);
  if (!userId) return;

  await execute(
    `UPDATE subscriptions
     SET status = 'past_due', updated_at = NOW()
     WHERE user_id = :userId`,
    { userId }
  );
  console.log(`Payment failed for user ${userId}`);
}

// ============================================================================
// Lambda handler
// ============================================================================

export async function handler(event) {
  // Parse API Gateway HTTP API event
  const method = event.requestContext?.http?.method ?? "POST";

  if (method === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders(), body: "" };
  }

  if (method !== "POST") {
    return response(405, { error: "Method not allowed" });
  }

  try {
    const body = event.body || "";
    const signature = event.headers?.["x-signature"] || event.headers?.["X-Signature"] || "";

    // Verify webhook signature
    if (!verifySignature(body, signature)) {
      console.error("Invalid webhook signature");
      return response(401, { error: "Invalid signature" });
    }

    const webhookData = JSON.parse(body);
    const eventName = webhookData?.meta?.event_name;

    console.log(`Processing webhook event: ${eventName}`);

    switch (eventName) {
      case "subscription_created":
      case "subscription_updated":
      case "subscription_resumed":
      case "subscription_payment_success":
        await handleSubscriptionEvent(webhookData);
        break;
      case "subscription_cancelled":
        await handleSubscriptionCancelled(webhookData);
        break;
      case "subscription_expired":
        await handleSubscriptionExpired(webhookData);
        break;
      case "subscription_payment_failed":
        await handlePaymentFailed(webhookData);
        break;
      default:
        console.log(`Unhandled event: ${eventName}`);
    }

    return response(200, { success: true });
  } catch (error) {
    console.error("Webhook processing error:", error);
    return response(500, { error: "Internal server error" });
  }
}

function corsHeaders() {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Signature",
  };
}

function response(statusCode, body) {
  return {
    statusCode,
    headers: corsHeaders(),
    body: JSON.stringify(body),
  };
}
