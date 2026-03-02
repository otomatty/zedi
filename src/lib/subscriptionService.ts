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

/** Uses same base URL as REST API (VITE_API_BASE_URL). */
const getAIAPIBaseUrl = () => (import.meta.env.VITE_API_BASE_URL as string) ?? "";

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

  const raw = (await response.json()) as {
    plan: "free" | "pro";
    subscription?: {
      status?: string;
      billingInterval?: "monthly" | "yearly" | null;
      currentPeriodEnd?: string | null;
      billing_interval?: string | null;
      current_period_end?: string | null;
    } | null;
    usage?: SubscriptionState["usage"];
  };

  const sub = raw.subscription;
  const currentPeriodEnd = sub?.currentPeriodEnd ?? sub?.current_period_end ?? null;

  return {
    plan: raw.plan,
    status: sub?.status ?? "active",
    billingInterval: (sub?.billingInterval ??
      sub?.billing_interval ??
      null) as SubscriptionState["billingInterval"],
    currentPeriodEnd: currentPeriodEnd != null ? String(currentPeriodEnd) : null,
    usage: raw.usage ?? {
      consumedUnits: 0,
      budgetUnits: 1500,
      usagePercent: 0,
    },
  };
}

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
// ---------------------------------------------------------------------------

export interface SubscriptionDetails {
  plan: "free" | "pro";
  status: string;
  billingInterval: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  externalId?: string;
  usage: {
    budgetUnits: number;
    consumedUnits: number;
    remainingUnits: number;
    usagePercent: number;
  };
}

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

export async function fetchSubscriptionDetails(): Promise<SubscriptionDetails> {
  return subscriptionApiCall<SubscriptionDetails>("/details");
}

export async function cancelSubscription(): Promise<{ success: boolean; message: string }> {
  return subscriptionApiCall("/cancel", "POST");
}

export async function reactivateSubscription(): Promise<{ success: boolean; message: string }> {
  return subscriptionApiCall("/reactivate", "POST");
}

export async function changeBillingInterval(
  billingInterval: BillingInterval,
): Promise<{ success: boolean; message: string }> {
  return subscriptionApiCall("/change-plan", "POST", { billingInterval });
}
