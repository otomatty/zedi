/**
 * Subscription service — handles Polar checkout and subscription state
 *
 * @see https://polar.sh/docs/features/checkout/session
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

/** Uses same base URL as REST API (VITE_ZEDI_API_BASE_URL). */
const getAIAPIBaseUrl = () => (import.meta.env.VITE_ZEDI_API_BASE_URL as string) ?? "";

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
 * Open Polar checkout for the Pro plan.
 * Creates a Checkout Session via the backend API, which sets
 * customerExternalId to the Cognito userId for webhook reconciliation.
 */
export async function openProCheckout(
  userId: string,
  billingInterval: BillingInterval
): Promise<void> {
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

  const { getIdToken } = await import("@/lib/auth");
  const token = await getIdToken();
  if (!token) {
    console.error("Auth token not available");
    return;
  }

  const response = await fetch(`${apiBaseUrl}/api/checkout`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ productId }),
  });

  if (!response.ok) {
    console.error("Failed to create checkout session");
    return;
  }

  const { url } = (await response.json()) as { url: string };
  window.open(url, "_blank");
}

/**
 * Open the Polar customer portal for managing subscriptions.
 * Requests a portal URL from the backend API.
 */
export async function openCustomerPortal(): Promise<void> {
  const apiBaseUrl = getAIAPIBaseUrl();
  if (!apiBaseUrl) {
    console.error("API base URL not configured");
    return;
  }

  const { getIdToken } = await import("@/lib/auth");
  const token = await getIdToken();
  if (!token) {
    console.error("Auth token not available");
    return;
  }

  const response = await fetch(`${apiBaseUrl}/api/customer-portal`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    console.error("Failed to get customer portal URL");
    return;
  }

  const { url } = (await response.json()) as { url: string };
  window.open(url, "_blank");
}
