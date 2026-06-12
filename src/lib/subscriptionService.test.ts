import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { jsonResponse } from "@/test/fetchTestHelpers";
import {
  createFreeSubscriptionState,
  fetchSubscription,
  openProCheckout,
  openCustomerPortal,
  cancelSubscription,
  reactivateSubscription,
  changeBillingInterval,
} from "./subscriptionService";

const API_BASE = "https://api.example.com";
const MONTHLY_PRODUCT_ID = "prod_monthly_123";
const YEARLY_PRODUCT_ID = "prod_yearly_456";

const JSON_HEADERS = { "Content-Type": "application/json" } as const;

type SubscriptionMutationCase = {
  label: string;
  path: string;
  invoke: () => Promise<{ success: boolean; message: string }>;
  successMessage: string;
  apiErrorMessage: string;
  requestBody?: Record<string, unknown>;
};

const subscriptionMutationCases: SubscriptionMutationCase[] = [
  {
    label: "cancelSubscription",
    path: "/cancel",
    invoke: cancelSubscription,
    successMessage: "Subscription will be canceled at period end",
    apiErrorMessage: "No active subscription found",
  },
  {
    label: "reactivateSubscription",
    path: "/reactivate",
    invoke: reactivateSubscription,
    successMessage: "Subscription reactivated",
    apiErrorMessage: "Failed to reactivate subscription",
  },
  {
    label: "changeBillingInterval",
    path: "/change-plan",
    invoke: () => changeBillingInterval("yearly"),
    successMessage: "Switched to yearly billing",
    apiErrorMessage: "Failed to change plan",
    requestBody: { billingInterval: "yearly" },
  },
];

function subscriptionPostInit(body?: Record<string, unknown>): RequestInit {
  return {
    method: "POST",
    credentials: "include",
    headers: JSON_HEADERS,
    ...(body ? { body: JSON.stringify(body) } : {}),
  };
}

describe("subscriptionService", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  let windowOpenSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    windowOpenSpy = vi.fn();
    vi.stubGlobal("open", windowOpenSpy);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe("createFreeSubscriptionState", () => {
    it("毎回 plan free・status active・billingInterval null の新しい状態を返す / returns a fresh free active state each call", () => {
      const a = createFreeSubscriptionState();
      const b = createFreeSubscriptionState();

      expect(a).toEqual({
        plan: "free",
        status: "active",
        billingInterval: null,
        currentPeriodStart: null,
        currentPeriodEnd: null,
        externalId: null,
        usage: {
          consumedUnits: 0,
          budgetUnits: 1500,
          remainingUnits: 1500,
          usagePercent: 0,
        },
      });
      expect(b).toEqual(a);
      expect(a).not.toBe(b);
    });

    it("usage オブジェクトは呼び出しごとに独立している / each call returns an independent usage object", () => {
      const a = createFreeSubscriptionState();
      const b = createFreeSubscriptionState();

      expect(a.usage).not.toBe(b.usage);
      a.usage.consumedUnits = 99;
      expect(b.usage.consumedUnits).toBe(0);
    });
  });

  describe("fetchSubscription", () => {
    it("VITE_API_BASE_URL 未設定時はネットワークせず free フォールバックを返す / without API base URL returns free fallback without network", async () => {
      vi.stubEnv("VITE_API_BASE_URL", "");

      const result = await fetchSubscription();

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(result.plan).toBe("free");
      expect(result.status).toBe("active");
      expect(result.usage.budgetUnits).toBe(1500);
    });

    it("GET {base}/api/ai/subscription を credentials include で呼ぶ / calls subscription endpoint with credentials include", async () => {
      vi.stubEnv("VITE_API_BASE_URL", API_BASE);
      fetchSpy.mockResolvedValue(
        jsonResponse({
          plan: "free",
          subscription: null,
          usage: {
            budgetUnits: 1500,
            consumedUnits: 0,
            remainingUnits: 1500,
            usagePercent: 0,
          },
        }),
      );

      await fetchSubscription();

      expect(fetchSpy).toHaveBeenCalledWith(`${API_BASE}/api/ai/subscription`, {
        method: "GET",
        credentials: "include",
        headers: JSON_HEADERS,
      });
    });

    it("401 のとき Error AUTH_REQUIRED を投げる / throws AUTH_REQUIRED on 401", async () => {
      vi.stubEnv("VITE_API_BASE_URL", API_BASE);
      fetchSpy.mockResolvedValue(
        jsonResponse({ error: "unauthorized" }, { status: 401, ok: false }),
      );

      await expect(fetchSubscription()).rejects.toThrow("AUTH_REQUIRED");
    });

    it("401 以外の非 OK は Failed to fetch subscription を投げる / throws on other non-OK responses", async () => {
      vi.stubEnv("VITE_API_BASE_URL", API_BASE);
      fetchSpy.mockResolvedValue(jsonResponse({ error: "boom" }, { status: 500, ok: false }));

      await expect(fetchSubscription()).rejects.toThrow("Failed to fetch subscription");
    });

    it("plan は subscription.plan を raw.plan より優先する / prefers subscription.plan over top-level plan", async () => {
      vi.stubEnv("VITE_API_BASE_URL", API_BASE);
      fetchSpy.mockResolvedValue(
        jsonResponse({
          plan: "free",
          subscription: {
            plan: "pro",
            status: "active",
            billingInterval: "monthly",
            currentPeriodStart: "2026-01-01T00:00:00Z",
            currentPeriodEnd: "2026-02-01T00:00:00Z",
            externalId: "sub_1",
          },
          usage: {
            budgetUnits: 50000,
            consumedUnits: 100,
            remainingUnits: 49900,
            usagePercent: 0.2,
          },
        }),
      );

      const result = await fetchSubscription();

      expect(result.plan).toBe("pro");
    });

    it("status 未設定時は active をデフォルトにする / defaults status to active when missing", async () => {
      vi.stubEnv("VITE_API_BASE_URL", API_BASE);
      fetchSpy.mockResolvedValue(
        jsonResponse({
          plan: "pro",
          subscription: {
            plan: "pro",
            billingInterval: "monthly",
          },
          usage: {},
        }),
      );

      const result = await fetchSubscription();

      expect(result.status).toBe("active");
    });

    it('billingInterval は monthly または yearly のみ受け付け、それ以外は null / accepts only "monthly" or "yearly"', async () => {
      vi.stubEnv("VITE_API_BASE_URL", API_BASE);
      fetchSpy.mockResolvedValue(
        jsonResponse({
          plan: "pro",
          subscription: {
            plan: "pro",
            status: "active",
            billingInterval: "weekly",
          },
          usage: {},
        }),
      );

      const result = await fetchSubscription();

      expect(result.billingInterval).toBeNull();
    });

    it('billingInterval が "monthly" のとき monthly を返す / returns monthly when billingInterval is monthly', async () => {
      vi.stubEnv("VITE_API_BASE_URL", API_BASE);
      fetchSpy.mockResolvedValue(
        jsonResponse({
          plan: "pro",
          subscription: {
            plan: "pro",
            status: "active",
            billingInterval: "monthly",
          },
          usage: {},
        }),
      );

      const result = await fetchSubscription();

      expect(result.billingInterval).toBe("monthly");
    });

    it("billingInterval の snake_case レガシー billing_interval も解釈する / supports snake_case billing_interval legacy", async () => {
      vi.stubEnv("VITE_API_BASE_URL", API_BASE);
      fetchSpy.mockResolvedValue(
        jsonResponse({
          plan: "pro",
          subscription: {
            plan: "pro",
            status: "active",
            billing_interval: "yearly",
          },
          usage: {},
        }),
      );

      const result = await fetchSubscription();

      expect(result.billingInterval).toBe("yearly");
    });

    it("期間フィールドは camelCase を snake_case より優先する / prefers camelCase period fields over snake_case", async () => {
      vi.stubEnv("VITE_API_BASE_URL", API_BASE);
      fetchSpy.mockResolvedValue(
        jsonResponse({
          plan: "pro",
          subscription: {
            plan: "pro",
            status: "active",
            currentPeriodStart: "2026-03-01T00:00:00Z",
            currentPeriodEnd: "2026-04-01T00:00:00Z",
            current_period_start: "legacy-start",
            current_period_end: "legacy-end",
          },
          usage: {},
        }),
      );

      const result = await fetchSubscription();

      expect(result.currentPeriodStart).toBe("2026-03-01T00:00:00Z");
      expect(result.currentPeriodEnd).toBe("2026-04-01T00:00:00Z");
    });

    it("期間・externalId は snake_case フォールバックし非 null を String に変換する / falls back to snake_case and coerces non-null ids to string", async () => {
      vi.stubEnv("VITE_API_BASE_URL", API_BASE);
      fetchSpy.mockResolvedValue(
        jsonResponse({
          plan: "pro",
          subscription: {
            plan: "pro",
            status: "active",
            current_period_start: "2026-05-01T00:00:00Z",
            current_period_end: "2026-06-01T00:00:00Z",
            external_id: 42,
          },
          usage: {},
        }),
      );

      const result = await fetchSubscription();

      expect(result.currentPeriodStart).toBe("2026-05-01T00:00:00Z");
      expect(result.currentPeriodEnd).toBe("2026-06-01T00:00:00Z");
      expect(result.externalId).toBe("42");
    });

    it("usage 欠損時は budgetUnits/consumedUnits 0・remainingUnits は max(0,budget-consumed)・usagePercent 0 / applies usage defaults when fields are missing", async () => {
      vi.stubEnv("VITE_API_BASE_URL", API_BASE);
      fetchSpy.mockResolvedValue(
        jsonResponse({
          plan: "free",
          subscription: null,
          usage: {
            budgetUnits: 100,
            consumedUnits: 150,
          },
        }),
      );

      const result = await fetchSubscription();

      expect(result.usage).toEqual({
        budgetUnits: 100,
        consumedUnits: 150,
        remainingUnits: 0,
        usagePercent: 0,
      });
    });

    it("期間・externalId が明示的 null のとき null のまま返す / keeps null period and externalId fields when explicitly null", async () => {
      vi.stubEnv("VITE_API_BASE_URL", API_BASE);
      fetchSpy.mockResolvedValue(
        jsonResponse({
          plan: "pro",
          subscription: {
            plan: "pro",
            status: "active",
            currentPeriodStart: null,
            currentPeriodEnd: null,
            externalId: null,
          },
          usage: {},
        }),
      );

      const result = await fetchSubscription();

      expect(result.currentPeriodStart).toBeNull();
      expect(result.currentPeriodEnd).toBeNull();
      expect(result.externalId).toBeNull();
    });

    it("usage が完全に欠損しても 0 デフォルトを適用する / applies zero defaults when usage object is empty", async () => {
      vi.stubEnv("VITE_API_BASE_URL", API_BASE);
      fetchSpy.mockResolvedValue(
        jsonResponse({
          plan: "free",
          subscription: null,
        }),
      );

      const result = await fetchSubscription();

      expect(result.usage).toEqual({
        budgetUnits: 0,
        consumedUnits: 0,
        remainingUnits: 0,
        usagePercent: 0,
      });
    });
  });

  describe("openProCheckout", () => {
    it("API URL 未設定時は console.error し throw も window.open もしない / logs and returns quietly when API URL missing", async () => {
      vi.stubEnv("VITE_API_BASE_URL", "");
      vi.stubEnv("VITE_POLAR_PRO_MONTHLY_PRODUCT_ID", MONTHLY_PRODUCT_ID);

      await openProCheckout("monthly");

      expect(vi.mocked(console.error)).toHaveBeenCalledWith("API base URL not configured");
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(windowOpenSpy).not.toHaveBeenCalled();
    });

    it("月額 product ID 未設定時は console.error する / logs when monthly Polar product ID is missing", async () => {
      vi.stubEnv("VITE_API_BASE_URL", API_BASE);
      vi.stubEnv("VITE_POLAR_PRO_MONTHLY_PRODUCT_ID", "");

      await openProCheckout("monthly");

      expect(vi.mocked(console.error)).toHaveBeenCalledWith("Polar product ID not configured");
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(windowOpenSpy).not.toHaveBeenCalled();
    });

    it("年額 product ID 未設定時は console.error する / logs when yearly Polar product ID is missing", async () => {
      vi.stubEnv("VITE_API_BASE_URL", API_BASE);
      vi.stubEnv("VITE_POLAR_PRO_YEARLY_PRODUCT_ID", "");

      await openProCheckout("yearly");

      expect(vi.mocked(console.error)).toHaveBeenCalledWith("Polar product ID not configured");
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(windowOpenSpy).not.toHaveBeenCalled();
    });

    it("monthly は VITE_POLAR_PRO_MONTHLY_PRODUCT_ID で POST /api/checkout する / monthly checkout uses monthly product id", async () => {
      vi.stubEnv("VITE_API_BASE_URL", API_BASE);
      vi.stubEnv("VITE_POLAR_PRO_MONTHLY_PRODUCT_ID", MONTHLY_PRODUCT_ID);
      fetchSpy.mockResolvedValue(
        jsonResponse({ url: "https://checkout.polar.sh/session/monthly" }),
      );

      await openProCheckout("monthly");

      expect(fetchSpy).toHaveBeenCalledWith(`${API_BASE}/api/checkout`, {
        method: "POST",
        credentials: "include",
        headers: JSON_HEADERS,
        body: JSON.stringify({ productId: MONTHLY_PRODUCT_ID }),
      });
      expect(windowOpenSpy).toHaveBeenCalledWith(
        "https://checkout.polar.sh/session/monthly",
        "_blank",
        "noopener,noreferrer",
      );
    });

    it("yearly は VITE_POLAR_PRO_YEARLY_PRODUCT_ID で POST /api/checkout する / yearly checkout uses yearly product id", async () => {
      vi.stubEnv("VITE_API_BASE_URL", API_BASE);
      vi.stubEnv("VITE_POLAR_PRO_YEARLY_PRODUCT_ID", YEARLY_PRODUCT_ID);
      fetchSpy.mockResolvedValue(jsonResponse({ url: "https://checkout.polar.sh/session/yearly" }));

      await openProCheckout("yearly");

      expect(fetchSpy).toHaveBeenCalledWith(`${API_BASE}/api/checkout`, {
        method: "POST",
        credentials: "include",
        headers: JSON_HEADERS,
        body: JSON.stringify({ productId: YEARLY_PRODUCT_ID }),
      });
      expect(windowOpenSpy).toHaveBeenCalledWith(
        "https://checkout.polar.sh/session/yearly",
        "_blank",
        "noopener,noreferrer",
      );
    });

    it("401 のとき console.error Auth token not available / logs auth error on 401", async () => {
      vi.stubEnv("VITE_API_BASE_URL", API_BASE);
      vi.stubEnv("VITE_POLAR_PRO_MONTHLY_PRODUCT_ID", MONTHLY_PRODUCT_ID);
      fetchSpy.mockResolvedValue(
        jsonResponse({ error: "unauthorized" }, { status: 401, ok: false }),
      );

      await openProCheckout("monthly");

      expect(vi.mocked(console.error)).toHaveBeenCalledWith("Auth token not available");
      expect(windowOpenSpy).not.toHaveBeenCalled();
    });

    it("401 以外の非 OK は console.error Failed to create checkout session / logs checkout failure on other errors", async () => {
      vi.stubEnv("VITE_API_BASE_URL", API_BASE);
      vi.stubEnv("VITE_POLAR_PRO_MONTHLY_PRODUCT_ID", MONTHLY_PRODUCT_ID);
      fetchSpy.mockResolvedValue(jsonResponse({ error: "bad" }, { status: 500, ok: false }));

      await openProCheckout("monthly");

      expect(vi.mocked(console.error)).toHaveBeenCalledWith("Failed to create checkout session");
      expect(windowOpenSpy).not.toHaveBeenCalled();
    });
  });

  describe("openCustomerPortal", () => {
    it("API URL 未設定時は API base URL not configured を投げる / throws when API base URL is missing", async () => {
      vi.stubEnv("VITE_API_BASE_URL", "");

      await expect(openCustomerPortal()).rejects.toThrow("API base URL not configured");
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("POST {base}/api/customer-portal を credentials include で呼ぶ / posts to customer portal endpoint", async () => {
      vi.stubEnv("VITE_API_BASE_URL", API_BASE);
      fetchSpy.mockResolvedValue(jsonResponse({ url: "https://polar.sh/portal/abc" }));

      await openCustomerPortal();

      expect(fetchSpy).toHaveBeenCalledWith(`${API_BASE}/api/customer-portal`, {
        method: "POST",
        credentials: "include",
        headers: JSON_HEADERS,
      });
      expect(windowOpenSpy).toHaveBeenCalledWith(
        "https://polar.sh/portal/abc",
        "_blank",
        "noopener,noreferrer",
      );
    });

    it("401 のとき Auth token not available を投げる / throws on 401", async () => {
      vi.stubEnv("VITE_API_BASE_URL", API_BASE);
      fetchSpy.mockResolvedValue(
        jsonResponse({ error: "unauthorized" }, { status: 401, ok: false }),
      );

      await expect(openCustomerPortal()).rejects.toThrow("Auth token not available");
      expect(windowOpenSpy).not.toHaveBeenCalled();
    });

    it("非 OK 時はレスポンスの error を投げる / throws response error message on failure", async () => {
      vi.stubEnv("VITE_API_BASE_URL", API_BASE);
      fetchSpy.mockResolvedValue(
        jsonResponse({ error: "Portal unavailable" }, { status: 500, ok: false }),
      );

      await expect(openCustomerPortal()).rejects.toThrow("Portal unavailable");
    });

    it("非 OK で error が無いときは Failed to get customer portal URL を投げる / throws default portal error when response has no error field", async () => {
      vi.stubEnv("VITE_API_BASE_URL", API_BASE);
      fetchSpy.mockResolvedValue(jsonResponse({}, { status: 500, ok: false }));

      await expect(openCustomerPortal()).rejects.toThrow("Failed to get customer portal URL");
    });

    it("非 OK で JSON が null のときはデフォルトメッセージを投げる / throws default portal error when error JSON is null", async () => {
      vi.stubEnv("VITE_API_BASE_URL", API_BASE);
      fetchSpy.mockResolvedValue(jsonResponse(null, { status: 500, ok: false }));

      await expect(openCustomerPortal()).rejects.toThrow("Failed to get customer portal URL");
    });
  });

  describe.each(subscriptionMutationCases)(
    "$label",
    ({ path, invoke, successMessage, apiErrorMessage, requestBody }) => {
      it("API URL 未設定時は API base URL not configured を投げる / throws when API base URL is missing", async () => {
        vi.stubEnv("VITE_API_BASE_URL", "");

        await expect(invoke()).rejects.toThrow("API base URL not configured");
      });

      it("POST を credentials include で呼び成功 JSON を返す / posts endpoint and returns JSON", async () => {
        vi.stubEnv("VITE_API_BASE_URL", API_BASE);
        fetchSpy.mockResolvedValue(jsonResponse({ success: true, message: successMessage }));

        const result = await invoke();

        expect(fetchSpy).toHaveBeenCalledWith(
          `${API_BASE}/api/subscription${path}`,
          subscriptionPostInit(requestBody),
        );
        expect(result).toEqual({ success: true, message: successMessage });
      });

      it("401 のとき AUTH_REQUIRED を投げる / throws AUTH_REQUIRED on 401", async () => {
        vi.stubEnv("VITE_API_BASE_URL", API_BASE);
        fetchSpy.mockResolvedValue(
          jsonResponse({ error: "unauthorized" }, { status: 401, ok: false }),
        );

        await expect(invoke()).rejects.toThrow("AUTH_REQUIRED");
      });

      it("非 OK 時はレスポンスの error を投げる / throws response error on failure", async () => {
        vi.stubEnv("VITE_API_BASE_URL", API_BASE);
        fetchSpy.mockResolvedValue(
          jsonResponse({ error: apiErrorMessage }, { status: 500, ok: false }),
        );

        await expect(invoke()).rejects.toThrow(apiErrorMessage);
      });

      it("非 OK で error が無いときは Request failed を投げる / throws Request failed when response has no error field", async () => {
        vi.stubEnv("VITE_API_BASE_URL", API_BASE);
        fetchSpy.mockResolvedValue(jsonResponse({}, { status: 500, ok: false }));

        await expect(invoke()).rejects.toThrow("Request failed");
      });

      it("非 OK で JSON が null のときは Request failed を投げる / throws Request failed when error JSON is null", async () => {
        vi.stubEnv("VITE_API_BASE_URL", API_BASE);
        fetchSpy.mockResolvedValue(jsonResponse(null, { status: 500, ok: false }));

        await expect(invoke()).rejects.toThrow("Request failed");
      });
    },
  );
});
