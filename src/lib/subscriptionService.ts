/**
 * Subscription service — handles Polar checkout and subscription state
 *
 * @see https://polar.sh/docs/features/checkout/session
 */

/**
 * Subscription state shared between `/pricing` page sections and the
 * subscription management UI. Includes billing period boundaries and the
 * Polar externalId needed for the customer portal / cancellation flow.
 *
 * `/pricing` ページと契約管理 UI で共有するサブスクリプション状態。
 * 請求期間の開始/終了日と、Polar のキャンセル / カスタマーポータルで使う
 * externalId を含む。
 */
export interface SubscriptionState {
  plan: "free" | "pro";
  status: string;
  billingInterval: "monthly" | "yearly" | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  externalId: string | null;
  usage: {
    consumedUnits: number;
    budgetUnits: number;
    remainingUnits: number;
    usagePercent: number;
  };
}

/** Uses same base URL as REST API (VITE_API_BASE_URL). */
const getAIAPIBaseUrl = () => (import.meta.env.VITE_API_BASE_URL as string) ?? "";

/**
 * Fetch current subscription state from the AI API (requires auth).
 */
const FREE_FALLBACK_STATE: SubscriptionState = {
  plan: "free",
  status: "active",
  billingInterval: null,
  currentPeriodStart: null,
  currentPeriodEnd: null,
  externalId: null,
  usage: { consumedUnits: 0, budgetUnits: 1500, remainingUnits: 1500, usagePercent: 0 },
};

/**
 *
 */
export async function fetchSubscription(): Promise<SubscriptionState> {
  /**
   *
   */
  const apiBaseUrl = getAIAPIBaseUrl();
  if (!apiBaseUrl) {
    return FREE_FALLBACK_STATE;
  }

  /**
   *
   */
  const response = await fetch(`${apiBaseUrl}/api/ai/subscription`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
  });

  if (response.status === 401) {
    throw new Error("AUTH_REQUIRED");
  }

  if (!response.ok) {
    throw new Error("Failed to fetch subscription");
  }

  /**
   *
   */
  const raw = (await response.json()) as {
    plan: "free" | "pro";
    subscription?: {
      status?: string;
      billingInterval?: "monthly" | "yearly" | null;
      currentPeriodStart?: string | null;
      currentPeriodEnd?: string | null;
      externalId?: string | null;
      // Legacy snake_case fields kept for compatibility with older API responses.
      // / 古い API レスポンスとの互換用に残しているスネークケースフィールド。
      billing_interval?: string | null;
      current_period_start?: string | null;
      current_period_end?: string | null;
      external_id?: string | null;
    } | null;
    usage?: Partial<SubscriptionState["usage"]>;
  };

  /**
   *
   */
  const sub = raw.subscription;
  /**
   *
   */
  const currentPeriodStart = sub?.currentPeriodStart ?? sub?.current_period_start ?? null;
  /**
   *
   */
  const currentPeriodEnd = sub?.currentPeriodEnd ?? sub?.current_period_end ?? null;
  /**
   *
   */
  const externalId = sub?.externalId ?? sub?.external_id ?? null;
  /**
   *
   */
  const billingInterval = (sub?.billingInterval ??
    sub?.billing_interval ??
    null) as SubscriptionState["billingInterval"];

  /**
   *
   */
  const budgetUnits = raw.usage?.budgetUnits ?? 0;
  /**
   *
   */
  const consumedUnits = raw.usage?.consumedUnits ?? 0;
  /**
   *
   */
  const remainingUnits = raw.usage?.remainingUnits ?? Math.max(0, budgetUnits - consumedUnits);
  /**
   *
   */
  const usagePercent = raw.usage?.usagePercent ?? 0;

  return {
    plan: raw.plan,
    status: sub?.status ?? "active",
    billingInterval,
    currentPeriodStart: currentPeriodStart != null ? String(currentPeriodStart) : null,
    currentPeriodEnd: currentPeriodEnd != null ? String(currentPeriodEnd) : null,
    externalId,
    usage: { consumedUnits, budgetUnits, remainingUnits, usagePercent },
  };
}

/**
 *
 */
export type BillingInterval = "monthly" | "yearly";

/**
 * Open Polar checkout for the Pro plan.
 * Creates a Checkout Session via the backend API. The backend derives
 * customerExternalId from the authenticated user's JWT (Authorization header)
 * for webhook reconciliation; the client does not pass a userId.
 */
export async function openProCheckout(billingInterval: BillingInterval): Promise<void> {
  const apiBaseUrl = getAIAPIBaseUrl();
  if (!apiBaseUrl) {
    console.error("API base URL not configured");
    return;
  }

  const productId =
    billingInterval === "yearly"
      ? import.meta.env.VITE_POLAR_PRO_YEARLY_PRODUCT_ID
      : import.meta.env.VITE_POLAR_PRO_MONTHLY_PRODUCT_ID;

  if (!productId) {
    console.error("Polar product ID not configured");
    return;
  }

  const response = await fetch(`${apiBaseUrl}/api/checkout`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify({ productId }),
  });

  if (response.status === 401) {
    console.error("Auth token not available");
    return;
  }

  if (!response.ok) {
    console.error("Failed to create checkout session");
    return;
  }

  const { url } = (await response.json()) as { url: string };
  window.open(url, "_blank", "noopener,noreferrer");
}

/**
 * Open the Polar customer portal for managing subscriptions.
 * Requests a portal URL from the backend API.
 * @throws on non-OK response so callers can show error feedback
 */
export async function openCustomerPortal(): Promise<void> {
  const apiBaseUrl = getAIAPIBaseUrl();
  if (!apiBaseUrl) {
    throw new Error("API base URL not configured");
  }

  const response = await fetch(`${apiBaseUrl}/api/customer-portal`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
  });

  if (response.status === 401) {
    throw new Error("Auth token not available");
  }

  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? "Failed to get customer portal URL");
  }

  const { url } = (await response.json()) as { url: string };
  window.open(url, "_blank", "noopener,noreferrer");
}

// ---------------------------------------------------------------------------
// Subscription management API (in-app management)
// サブスクリプション管理 API（アプリ内での管理操作）
// ---------------------------------------------------------------------------

async function subscriptionApiCall<T>(
  path: string,
  method: "GET" | "POST" = "GET",
  body?: Record<string, unknown>,
): Promise<T> {
  const apiBaseUrl = getAIAPIBaseUrl();
  if (!apiBaseUrl) throw new Error("API base URL not configured");

  const response = await fetch(`${apiBaseUrl}/api/subscription${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  if (response.status === 401) throw new Error("AUTH_REQUIRED");
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? "Request failed");
  }
  return (await response.json()) as T;
}

/**
 *
 */
export async function cancelSubscription(): Promise<{ success: boolean; message: string }> {
  return subscriptionApiCall("/cancel", "POST");
}

/**
 *
 */
export async function reactivateSubscription(): Promise<{ success: boolean; message: string }> {
  return subscriptionApiCall("/reactivate", "POST");
}

/**
 *
 */
export async function changeBillingInterval(
  billingInterval: BillingInterval,
): Promise<{ success: boolean; message: string }> {
  return subscriptionApiCall("/change-plan", "POST", { billingInterval });
}
