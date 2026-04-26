/**
 * /api/subscription のテスト（details / cancel / reactivate / change-plan）。
 * Tests for subscription management routes.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Context, Next } from "hono";
import type { AppEnv } from "../../types/index.js";

vi.mock("../../middleware/auth.js", () => ({
  authRequired: async (c: Context<AppEnv>, next: Next) => {
    const userId = c.req.header("x-test-user-id");
    if (!userId) return c.json({ message: "Unauthorized" }, 401);
    c.set("userId", userId);
    await next();
  },
}));

const {
  mockSubscriptionsUpdate,
  mockGetUserTier,
  mockGetSubscription,
  mockCheckUsage,
  mockGetEnv,
} = vi.hoisted(() => ({
  mockSubscriptionsUpdate: vi.fn(),
  mockGetUserTier: vi.fn(),
  mockGetSubscription: vi.fn(),
  mockCheckUsage: vi.fn(),
  mockGetEnv: vi.fn(),
}));

vi.mock("@polar-sh/sdk", () => ({
  Polar: class MockPolar {
    subscriptions = { update: mockSubscriptionsUpdate };
  },
}));

vi.mock("../../lib/env.js", () => ({
  getEnv: (key: string) => mockGetEnv(key),
}));

vi.mock("../../services/subscriptionService.js", () => ({
  getUserTier: mockGetUserTier,
  getSubscription: mockGetSubscription,
}));

vi.mock("../../services/usageService.js", () => ({
  checkUsage: mockCheckUsage,
}));

import { Hono } from "hono";
import subRoutes from "../../routes/subscriptionManage.js";
import { errorHandler } from "../../middleware/errorHandler.js";
import { createMockDb } from "../createMockDb.js";

const TEST_USER_ID = "user-sub-1";
const ORIGINAL_ENV = { ...process.env };

function createTestApp() {
  const { db } = createMockDb([]);
  const app = new Hono<AppEnv>();
  app.use("*", async (c, next) => {
    c.set("db", db as unknown as AppEnv["Variables"]["db"]);
    await next();
  });
  app.onError(errorHandler);
  app.route("/api/subscription", subRoutes);
  return app;
}

function authHeaders(): Record<string, string> {
  return {
    "x-test-user-id": TEST_USER_ID,
    "Content-Type": "application/json",
  };
}

beforeEach(() => {
  mockSubscriptionsUpdate.mockReset();
  mockGetUserTier.mockReset();
  mockGetSubscription.mockReset();
  mockCheckUsage.mockReset();
  mockGetEnv.mockReset().mockReturnValue("polar-token");
  process.env = { ...ORIGINAL_ENV };
});

// process.env はワーカー間で共有されうるので、テスト終了後にも必ず元へ戻す。
// process.env can leak between test files via shared workers — restore it after every test.
afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

// ── GET /details ────────────────────────────────────────────────────────────

describe("GET /api/subscription/details", () => {
  it("returns free-plan response when user has no subscription", async () => {
    mockGetUserTier.mockResolvedValue("free");
    mockGetSubscription.mockResolvedValue(null);
    mockCheckUsage.mockResolvedValue({
      budgetUnits: 1500,
      consumedUnits: 100,
      remaining: 1400,
      usagePercent: 6.67,
    });
    const app = createTestApp();

    const res = await app.request("/api/subscription/details", { headers: authHeaders() });

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      plan: "free",
      status: "active",
      billingInterval: null,
      currentPeriodStart: null,
      currentPeriodEnd: null,
      usage: {
        budgetUnits: 1500,
        consumedUnits: 100,
        remainingUnits: 1400,
      },
    });
  });

  it("returns paid plan details when subscription exists", async () => {
    mockGetUserTier.mockResolvedValue("pro");
    mockGetSubscription.mockResolvedValue({
      plan: "pro",
      status: "active",
      billingInterval: "monthly",
      currentPeriodStart: "2026-04-01",
      currentPeriodEnd: "2026-05-01",
      externalId: "sub_123",
    });
    mockCheckUsage.mockResolvedValue({
      budgetUnits: 15000,
      consumedUnits: 7500,
      remaining: 7500,
      usagePercent: 50,
    });
    const app = createTestApp();

    const res = await app.request("/api/subscription/details", { headers: authHeaders() });

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      plan: "pro",
      status: "active",
      billingInterval: "monthly",
      usage: { budgetUnits: 15000, consumedUnits: 7500, remainingUnits: 7500, usagePercent: 50 },
    });
  });
});

// ── POST /cancel ────────────────────────────────────────────────────────────

describe("POST /api/subscription/cancel", () => {
  it("returns 404 when no active subscription", async () => {
    mockGetSubscription.mockResolvedValue(null);
    const app = createTestApp();

    const res = await app.request("/api/subscription/cancel", {
      method: "POST",
      headers: authHeaders(),
    });

    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("No active subscription found");
    expect(mockSubscriptionsUpdate).not.toHaveBeenCalled();
  });

  it("calls Polar update with cancelAtPeriodEnd: true and returns success", async () => {
    mockGetSubscription.mockResolvedValue({ externalId: "sub_42" });
    mockSubscriptionsUpdate.mockResolvedValue({});
    const app = createTestApp();

    const res = await app.request("/api/subscription/cancel", {
      method: "POST",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean; message: string };
    expect(body.success).toBe(true);
    expect(mockSubscriptionsUpdate).toHaveBeenCalledWith({
      id: "sub_42",
      subscriptionUpdate: { cancelAtPeriodEnd: true },
    });
  });

  it("returns 500 when Polar throws", async () => {
    mockGetSubscription.mockResolvedValue({ externalId: "sub_42" });
    mockSubscriptionsUpdate.mockRejectedValue(new Error("Polar down"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const app = createTestApp();

    const res = await app.request("/api/subscription/cancel", {
      method: "POST",
      headers: authHeaders(),
    });

    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Failed to cancel subscription");
    consoleSpy.mockRestore();
  });
});

// ── POST /reactivate ────────────────────────────────────────────────────────

describe("POST /api/subscription/reactivate", () => {
  it("returns 404 when no subscription", async () => {
    mockGetSubscription.mockResolvedValue(null);
    const app = createTestApp();

    const res = await app.request("/api/subscription/reactivate", {
      method: "POST",
      headers: authHeaders(),
    });

    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("No subscription found");
  });

  it("calls Polar update with cancelAtPeriodEnd: false", async () => {
    mockGetSubscription.mockResolvedValue({ externalId: "sub_99" });
    mockSubscriptionsUpdate.mockResolvedValue({});
    const app = createTestApp();

    const res = await app.request("/api/subscription/reactivate", {
      method: "POST",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    expect(mockSubscriptionsUpdate).toHaveBeenCalledWith({
      id: "sub_99",
      subscriptionUpdate: { cancelAtPeriodEnd: false },
    });
  });

  it("returns 500 when Polar throws", async () => {
    mockGetSubscription.mockResolvedValue({ externalId: "sub_99" });
    mockSubscriptionsUpdate.mockRejectedValue(new Error("oops"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const app = createTestApp();

    const res = await app.request("/api/subscription/reactivate", {
      method: "POST",
      headers: authHeaders(),
    });

    expect(res.status).toBe(500);
    consoleSpy.mockRestore();
  });
});

// ── POST /change-plan ───────────────────────────────────────────────────────

describe("POST /api/subscription/change-plan", () => {
  it("returns 400 when JSON body is invalid", async () => {
    const app = createTestApp();

    const res = await app.request("/api/subscription/change-plan", {
      method: "POST",
      headers: authHeaders(),
      body: "{not json",
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Invalid JSON body");
  });

  it("returns 400 when billingInterval is missing or invalid", async () => {
    const app = createTestApp();

    const res = await app.request("/api/subscription/change-plan", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ billingInterval: "weekly" }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("billingInterval must be 'monthly' or 'yearly'");
  });

  it("returns 404 when no active subscription", async () => {
    mockGetSubscription.mockResolvedValue(null);
    const app = createTestApp();

    const res = await app.request("/api/subscription/change-plan", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ billingInterval: "yearly" }),
    });

    expect(res.status).toBe(404);
  });

  it("returns 500 when product ID env var is not configured", async () => {
    mockGetSubscription.mockResolvedValue({ externalId: "sub_1" });
    delete process.env.POLAR_PRO_YEARLY_PRODUCT_ID;
    delete process.env.POLAR_PRO_MONTHLY_PRODUCT_ID;
    const app = createTestApp();

    const res = await app.request("/api/subscription/change-plan", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ billingInterval: "yearly" }),
    });

    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Product ID not configured for this billing interval");
  });

  it("calls Polar update with the yearly productId when billingInterval is 'yearly'", async () => {
    mockGetSubscription.mockResolvedValue({ externalId: "sub_y" });
    mockSubscriptionsUpdate.mockResolvedValue({});
    process.env.POLAR_PRO_YEARLY_PRODUCT_ID = "prod_yearly";
    const app = createTestApp();

    const res = await app.request("/api/subscription/change-plan", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ billingInterval: "yearly" }),
    });

    expect(res.status).toBe(200);
    expect(mockSubscriptionsUpdate).toHaveBeenCalledWith({
      id: "sub_y",
      subscriptionUpdate: { productId: "prod_yearly" },
    });
  });

  it("calls Polar update with the monthly productId when billingInterval is 'monthly'", async () => {
    mockGetSubscription.mockResolvedValue({ externalId: "sub_m" });
    mockSubscriptionsUpdate.mockResolvedValue({});
    process.env.POLAR_PRO_MONTHLY_PRODUCT_ID = "prod_monthly";
    const app = createTestApp();

    const res = await app.request("/api/subscription/change-plan", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ billingInterval: "monthly" }),
    });

    expect(res.status).toBe(200);
    expect(mockSubscriptionsUpdate).toHaveBeenCalledWith({
      id: "sub_m",
      subscriptionUpdate: { productId: "prod_monthly" },
    });
  });

  it("returns 500 when Polar throws", async () => {
    mockGetSubscription.mockResolvedValue({ externalId: "sub_x" });
    mockSubscriptionsUpdate.mockRejectedValue(new Error("Polar 503"));
    process.env.POLAR_PRO_MONTHLY_PRODUCT_ID = "prod_monthly";
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const app = createTestApp();

    const res = await app.request("/api/subscription/change-plan", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ billingInterval: "monthly" }),
    });

    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Failed to change plan");
    consoleSpy.mockRestore();
  });
});
