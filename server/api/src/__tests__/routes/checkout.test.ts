/**
 * /api/checkout のテスト（Polar 連携、Origin 検証、successUrl 構築）。
 * Tests for /api/checkout (Polar integration, origin validation, successUrl).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
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

const { mockCheckoutsCreate, mockCustomerSessionsCreate, mockGetAllowedOrigins, mockGetEnv } =
  vi.hoisted(() => ({
    mockCheckoutsCreate: vi.fn(),
    mockCustomerSessionsCreate: vi.fn(),
    mockGetAllowedOrigins: vi.fn(),
    mockGetEnv: vi.fn(),
  }));

vi.mock("@polar-sh/sdk", () => ({
  Polar: class MockPolar {
    checkouts = { create: mockCheckoutsCreate };
    customerSessions = { create: mockCustomerSessionsCreate };
  },
}));

vi.mock("../../lib/cors.js", () => ({
  getAllowedOrigins: () => mockGetAllowedOrigins(),
}));

vi.mock("../../lib/env.js", () => ({
  getEnv: (key: string) => mockGetEnv(key),
}));

import { Hono } from "hono";
import checkoutRoutes from "../../routes/checkout.js";
import { errorHandler } from "../../middleware/errorHandler.js";

const TEST_USER_ID = "user-checkout-1";

function createTestApp() {
  const app = new Hono<AppEnv>();
  app.onError(errorHandler);
  app.route("/api", checkoutRoutes);
  return app;
}

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    "x-test-user-id": TEST_USER_ID,
    "Content-Type": "application/json",
    ...extra,
  };
}

beforeEach(() => {
  mockCheckoutsCreate.mockReset();
  mockCustomerSessionsCreate.mockReset();
  mockGetAllowedOrigins.mockReset().mockReturnValue([]);
  mockGetEnv.mockReset().mockReturnValue("polar-token");
});

// ── POST /api/checkout ──────────────────────────────────────────────────────

describe("POST /api/checkout", () => {
  it("returns 400 when productId is missing", async () => {
    const app = createTestApp();

    const res = await app.request("/api/checkout", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("productId is required");
    expect(mockCheckoutsCreate).not.toHaveBeenCalled();
  });

  it("uses Origin header when allowed and builds successUrl", async () => {
    mockGetAllowedOrigins.mockReturnValue([
      "https://app.example.com",
      "https://staging.example.com",
    ]);
    mockCheckoutsCreate.mockResolvedValue({ url: "https://polar.example/checkout/abc" });
    const app = createTestApp();

    const res = await app.request("/api/checkout", {
      method: "POST",
      headers: authHeaders({ Origin: "https://app.example.com" }),
      body: JSON.stringify({ productId: "prod-1" }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { url: string };
    expect(body.url).toBe("https://polar.example/checkout/abc");
    expect(mockCheckoutsCreate).toHaveBeenCalledWith({
      products: ["prod-1"],
      externalCustomerId: TEST_USER_ID,
      successUrl: "https://app.example.com/pricing?checkout=success",
    });
  });

  it("rejects untrusted Origin by leaving successUrl undefined", async () => {
    mockGetAllowedOrigins.mockReturnValue(["https://app.example.com"]);
    mockCheckoutsCreate.mockResolvedValue({ url: "https://polar.example/checkout/abc" });
    const app = createTestApp();

    const res = await app.request("/api/checkout", {
      method: "POST",
      headers: authHeaders({ Origin: "https://evil.example.com" }),
      body: JSON.stringify({ productId: "prod-1" }),
    });

    expect(res.status).toBe(200);
    expect(mockCheckoutsCreate).toHaveBeenCalledWith({
      products: ["prod-1"],
      externalCustomerId: TEST_USER_ID,
    });
  });

  it("falls back to first allowed origin when no Origin header is present", async () => {
    mockGetAllowedOrigins.mockReturnValue([
      "https://primary.example.com",
      "https://other.example.com",
    ]);
    mockCheckoutsCreate.mockResolvedValue({ url: "https://polar.example/checkout/xyz" });
    const app = createTestApp();

    const res = await app.request("/api/checkout", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ productId: "prod-2" }),
    });

    expect(res.status).toBe(200);
    expect(mockCheckoutsCreate).toHaveBeenCalledWith({
      products: ["prod-2"],
      externalCustomerId: TEST_USER_ID,
      successUrl: "https://primary.example.com/pricing?checkout=success",
    });
  });

  it("returns 401 without auth", async () => {
    const app = createTestApp();

    const res = await app.request("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId: "p" }),
    });

    expect(res.status).toBe(401);
  });
});

// ── POST /api/customer-portal ───────────────────────────────────────────────

describe("POST /api/customer-portal", () => {
  it("returns the customer portal URL from Polar", async () => {
    mockCustomerSessionsCreate.mockResolvedValue({
      customerPortalUrl: "https://polar.example/portal/u1",
    });
    const app = createTestApp();

    const res = await app.request("/api/customer-portal", {
      method: "POST",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { url: string };
    expect(body.url).toBe("https://polar.example/portal/u1");
    expect(mockCustomerSessionsCreate).toHaveBeenCalledWith({
      externalCustomerId: TEST_USER_ID,
    });
  });

  it("returns 401 without auth", async () => {
    const app = createTestApp();

    const res = await app.request("/api/customer-portal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status).toBe(401);
  });
});
