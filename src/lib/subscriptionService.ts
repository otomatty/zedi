/**
 * Subscription service — handles LemonSqueezy checkout and subscription state
 */

export interface SubscriptionState {
  plan: "free" | "pro";
  status: string;
  billingInterval: "monthly" | "yearly" | null;
  currentPeriodEnd: string | null;
  usage: {
    consumedUnits: number;
    budgetUnits: number;
    usagePercent: number;
  };
}

const getAIAPIBaseUrl = () => import.meta.env.VITE_AI_API_BASE_URL || "";

/**
 * Fetch current subscription state from the AI API (requires auth).
 */
export async function fetchSubscription(): Promise<SubscriptionState> {
  const apiBaseUrl = getAIAPIBaseUrl();
  if (!apiBaseUrl) {
    return {
      plan: "free",
      status: "active",
      billingInterval: null,
      currentPeriodEnd: null,
      usage: { consumedUnits: 0, budgetUnits: 1500, usagePercent: 0 },
    };
  }

  const { getIdToken } = await import("@/lib/auth");
  const token = await getIdToken();
  if (!token) {
    throw new Error("AUTH_REQUIRED");
  }

  const response = await fetch(`${apiBaseUrl}/api/ai/subscription`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error("Failed to fetch subscription");
  }

  return (await response.json()) as SubscriptionState;
}

export type BillingInterval = "monthly" | "yearly";

/**
 * Open LemonSqueezy checkout for the Pro plan.
 * Passes the user's Cognito sub and billing interval as custom_data for the webhook.
 */
export function openProCheckout(
  userId: string,
  billingInterval: BillingInterval
): void {
  const storeId = import.meta.env.VITE_LEMONSQUEEZY_STORE_ID || "";
  const productId =
    billingInterval === "yearly"
      ? import.meta.env.VITE_LEMONSQUEEZY_AI_YEARLY_PRODUCT_ID
      : import.meta.env.VITE_LEMONSQUEEZY_AI_MONTHLY_PRODUCT_ID ||
        import.meta.env.VITE_LEMONSQUEEZY_AI_PRODUCT_ID ||
        "";

  if (!storeId || !productId) {
    console.error("LemonSqueezy store/product IDs not configured");
    return;
  }

  const checkoutUrl = new URL(
    `https://${storeId}.lemonsqueezy.com/buy/${productId}`
  );
  checkoutUrl.searchParams.set("checkout[custom][user_id]", userId);
  checkoutUrl.searchParams.set(
    "checkout[custom][billing_interval]",
    billingInterval
  );
  window.open(checkoutUrl.toString(), "_blank");
}

/**
 * @deprecated Use openProCheckout(userId, 'monthly') for new Pro plan.
 * Open a LemonSqueezy checkout for the AI Power subscription.
 * Passes the user's Cognito sub as custom_data so the webhook
 * can associate the subscription with the correct user.
 */
export function openAISubscriptionCheckout(userId: string): void {
  openProCheckout(userId, "monthly");
}

/**
 * Open the LemonSqueezy customer portal for managing subscriptions.
 */
export function openCustomerPortal(): void {
  const portalUrl = import.meta.env.VITE_LEMONSQUEEZY_PORTAL_URL;
  if (!portalUrl) {
    console.error("LemonSqueezy portal URL not configured");
    return;
  }
  window.open(portalUrl, "_blank");
}
