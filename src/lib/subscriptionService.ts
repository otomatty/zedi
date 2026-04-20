/**
 * Subscription service — handles Polar checkout and subscription state.
 * Polar のチェックアウトとサブスクリプション状態管理を扱うクライアント。
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
 *
 * `plan` はサブスクリプション契約上のプラン（解約予約中の Pro でも "pro"）を
 * 表す。実際に使える機能のティアは使用量 API で別途判定する。
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
 * Return a fresh copy of the Free-plan fallback state so callers cannot mutate
 * the shared singleton and leak that mutation into subsequent requests.
 * 共有シングルトンを変異させて後続のリクエストに漏らさないよう、Free プランの
 * フォールバック状態を毎回新しいコピーとして返す。
 */
function freeFallbackCopy(): SubscriptionState {
  return {
    ...FREE_FALLBACK_STATE,
    usage: { ...FREE_FALLBACK_STATE.usage },
  };
}

function parseBillingInterval(raw: unknown): SubscriptionState["billingInterval"] {
  return raw === "monthly" || raw === "yearly" ? raw : null;
}

/**
 * Fetch the current subscription state from the AI API (requires auth).
 * AI API から現在のサブスクリプション状態を取得する（要認証）。
 *
 * The returned `plan` reflects the subscription contract's plan (so a Pro
 * subscription scheduled to cancel still returns `"pro"`), not the effective
 * access tier. Access-tier gating should be computed against `usage` or a
 * dedicated tier endpoint.
 *
 * 返り値の `plan` はサブスクリプション契約上のプランを表す（解約予約中でも
 * `"pro"`）。実効ティアの判定は `usage` または専用の API を使う。
 *
 * @throws Error with message `AUTH_REQUIRED` when the API returns 401.
 */
export async function fetchSubscription(): Promise<SubscriptionState> {
  const apiBaseUrl = getAIAPIBaseUrl();
  if (!apiBaseUrl) {
    return freeFallbackCopy();
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
      plan?: "free" | "pro";
      status?: string;
      billingInterval?: string | null;
      currentPeriodStart?: string | null;
      currentPeriodEnd?: string | null;
      externalId?: string | null;
      // Legacy snake_case fields kept for compatibility with older API responses.
      // 古い API レスポンスとの互換用に残しているスネークケースフィールド。
      billing_interval?: string | null;
      current_period_start?: string | null;
      current_period_end?: string | null;
      external_id?: string | null;
    } | null;
    usage?: Partial<SubscriptionState["usage"]>;
  };

  const sub = raw.subscription;
  // Prefer the subscription's own plan so canceled / past_due Pro subscriptions
  // surface as `"pro"` — `raw.plan` reflects the effective access tier, which
  // downgrades to `"free"` for non-active subscriptions.
  // サブスクリプション自身のプランを優先することで、解約予約中や past_due の Pro でも
  // `"pro"` として扱える。`raw.plan` は実効ティアなので非アクティブ時は `"free"` に落ちる。
  const plan = sub?.plan ?? raw.plan;
  const currentPeriodStart = sub?.currentPeriodStart ?? sub?.current_period_start ?? null;
  const currentPeriodEnd = sub?.currentPeriodEnd ?? sub?.current_period_end ?? null;
  const externalId = sub?.externalId ?? sub?.external_id ?? null;
  const billingInterval = parseBillingInterval(sub?.billingInterval ?? sub?.billing_interval);

  const budgetUnits = raw.usage?.budgetUnits ?? 0;
  const consumedUnits = raw.usage?.consumedUnits ?? 0;
  const remainingUnits = raw.usage?.remainingUnits ?? Math.max(0, budgetUnits - consumedUnits);
  const usagePercent = raw.usage?.usagePercent ?? 0;

  return {
    plan,
    status: sub?.status ?? "active",
    billingInterval,
    currentPeriodStart: currentPeriodStart != null ? String(currentPeriodStart) : null,
    currentPeriodEnd: currentPeriodEnd != null ? String(currentPeriodEnd) : null,
    externalId,
    usage: { consumedUnits, budgetUnits, remainingUnits, usagePercent },
  };
}

/**
 * Billing cadence for the Pro plan.
 * Pro プランの請求間隔。
 */
export type BillingInterval = "monthly" | "yearly";

/**
 * Open the Polar checkout session for the Pro plan in a new window.
 * Pro プランの Polar チェックアウトセッションを新しいウィンドウで開く。
 *
 * Creates a Checkout Session via the backend API. The backend derives
 * `customerExternalId` from the authenticated user's JWT so the Polar webhook
 * can reconcile the subscription; the client does not pass a userId.
 *
 * バックエンド API 経由で Checkout Session を作成する。`customerExternalId`
 * は認証済みユーザーの JWT からバックエンドが取り出すので、クライアントは
 * userId を渡さない。
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
 * Open the Polar customer portal for managing the subscription.
 * サブスクリプション管理用に Polar カスタマーポータルを開く。
 *
 * Requests a portal URL from the backend API and opens it in a new window.
 * バックエンド API からポータル URL を取得して新しいウィンドウで開く。
 *
 * @throws Error on non-OK response so callers can show error feedback.
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
 * Schedule cancellation of the active Pro subscription at period end.
 * 有効な Pro サブスクリプションを請求期間末で解約予約する。
 */
export async function cancelSubscription(): Promise<{ success: boolean; message: string }> {
  return subscriptionApiCall("/cancel", "POST");
}

/**
 * Undo a pending cancel-at-period-end so the Pro subscription keeps renewing.
 * 解約予約を取り消し、Pro サブスクリプションを継続更新に戻す。
 */
export async function reactivateSubscription(): Promise<{ success: boolean; message: string }> {
  return subscriptionApiCall("/reactivate", "POST");
}

/**
 * Switch the current Pro subscription between monthly and yearly billing.
 * 現在の Pro サブスクリプションの請求間隔を月額・年額で切り替える。
 */
export async function changeBillingInterval(
  billingInterval: BillingInterval,
): Promise<{ success: boolean; message: string }> {
  return subscriptionApiCall("/change-plan", "POST", { billingInterval });
}
