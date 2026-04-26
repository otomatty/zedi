/**
 * /api/onboarding のテスト（POST /complete, GET /status）。
 * Tests for /api/onboarding routes (POST /complete, GET /status).
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

const { mockInsertWelcomePage, mockRetryWelcomePageIfNeeded } = vi.hoisted(() => ({
  mockInsertWelcomePage: vi.fn(),
  mockRetryWelcomePageIfNeeded: vi.fn(),
}));

vi.mock("../../lib/welcomePageService.js", () => ({
  insertWelcomePage: mockInsertWelcomePage,
  retryWelcomePageIfNeeded: mockRetryWelcomePageIfNeeded,
}));

import { Hono } from "hono";
import onboardingRoutes from "../../routes/onboarding.js";
import { errorHandler } from "../../middleware/errorHandler.js";
import { createMockDb } from "../createMockDb.js";

const TEST_USER_ID = "user-onboard-1";

function createTestApp(dbResults: unknown[]) {
  const { db, chains } = createMockDb(dbResults);
  const app = new Hono<AppEnv>();
  app.use("*", async (c, next) => {
    c.set("db", db as unknown as AppEnv["Variables"]["db"]);
    await next();
  });
  app.onError(errorHandler);
  app.route("/api/onboarding", onboardingRoutes);
  return { app, chains };
}

function authHeaders(userId: string = TEST_USER_ID): Record<string, string> {
  return {
    "x-test-user-id": userId,
    "Content-Type": "application/json",
  };
}

beforeEach(() => {
  mockInsertWelcomePage.mockReset();
  mockRetryWelcomePageIfNeeded.mockReset();
});

// ── POST /api/onboarding/complete ───────────────────────────────────────────

describe("POST /api/onboarding/complete", () => {
  const finalRow = {
    setupCompletedAt: new Date("2026-04-01T00:00:00Z"),
    welcomePageId: "page-welcome-1",
    welcomePageCreatedAt: new Date("2026-04-01T00:00:00Z"),
  };

  it("returns 200 with normalized state when display_name and locale are valid", async () => {
    mockInsertWelcomePage.mockResolvedValue({
      pageId: "page-welcome-1",
      locale: "ja",
    });
    // tx.update(users), tx.insert(userOnboardingStatus), tx.select() の 3 回。
    // The handler calls tx.update, tx.insert, then tx.select inside the transaction.
    const { app } = createTestApp([undefined, undefined, [finalRow]]);

    const res = await app.request("/api/onboarding/complete", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        display_name: "  Alice  ",
        avatar_url: "  https://example.com/a.png  ",
        locale: "ja",
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      setup_completed_at: string | null;
      welcome_page_id: string | null;
      welcome_page_created_at: string | null;
      welcome_page_locale: string | null;
    };
    expect(body.setup_completed_at).toBe("2026-04-01T00:00:00.000Z");
    expect(body.welcome_page_id).toBe("page-welcome-1");
    expect(body.welcome_page_locale).toBe("ja");

    // insertWelcomePage は trim 後の値ではなく正規化された locale を受け取る。
    // insertWelcomePage receives the normalized locale (ja|en|null).
    expect(mockInsertWelcomePage).toHaveBeenCalledTimes(1);
    expect(mockInsertWelcomePage.mock.calls[0]?.[2]).toBe("ja");
  });

  it("normalizes unknown locale to null", async () => {
    mockInsertWelcomePage.mockResolvedValue({ pageId: "p", locale: null });
    const { app } = createTestApp([undefined, undefined, [finalRow]]);

    const res = await app.request("/api/onboarding/complete", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ display_name: "Alice", locale: "fr" }),
    });

    expect(res.status).toBe(200);
    expect(mockInsertWelcomePage.mock.calls[0]?.[2]).toBeNull();
  });

  it("returns 400 for invalid JSON body", async () => {
    const { app } = createTestApp([]);

    const res = await app.request("/api/onboarding/complete", {
      method: "POST",
      headers: authHeaders(),
      body: "not-json",
    });

    expect(res.status).toBe(400);
  });

  it("returns 400 when body is not an object", async () => {
    const { app } = createTestApp([]);

    const res = await app.request("/api/onboarding/complete", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(null),
    });

    expect(res.status).toBe(400);
  });

  it("returns 400 when display_name is missing or empty after trim", async () => {
    const { app } = createTestApp([]);

    const res = await app.request("/api/onboarding/complete", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ display_name: "   " }),
    });

    expect(res.status).toBe(400);
  });

  it("returns 400 when display_name exceeds 120 characters", async () => {
    const { app } = createTestApp([]);
    const longName = "a".repeat(121);

    const res = await app.request("/api/onboarding/complete", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ display_name: longName }),
    });

    expect(res.status).toBe(400);
  });

  it("returns 401 without auth header", async () => {
    const { app } = createTestApp([]);

    const res = await app.request("/api/onboarding/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ display_name: "Alice" }),
    });

    expect(res.status).toBe(401);
  });

  it("does not include welcome_page fields when insertWelcomePage returns null (existing welcome)", async () => {
    mockInsertWelcomePage.mockResolvedValue(null);
    const rowWithoutWelcome = {
      setupCompletedAt: new Date("2026-04-01T00:00:00Z"),
      welcomePageId: null,
      welcomePageCreatedAt: null,
    };
    const { app } = createTestApp([undefined, undefined, [rowWithoutWelcome]]);

    const res = await app.request("/api/onboarding/complete", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ display_name: "Alice", locale: "en" }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.welcome_page_id).toBeNull();
    expect(body.welcome_page_created_at).toBeNull();
    expect(body.welcome_page_locale).toBeNull();
  });
});

// ── GET /api/onboarding/status ──────────────────────────────────────────────

describe("GET /api/onboarding/status", () => {
  it("returns the persisted onboarding row", async () => {
    mockRetryWelcomePageIfNeeded.mockResolvedValue(undefined);
    const row = {
      setupCompletedAt: new Date("2026-04-01T00:00:00Z"),
      welcomePageId: "page-1",
      welcomePageCreatedAt: new Date("2026-04-01T00:00:00Z"),
      homeSlidesShownAt: new Date("2026-04-02T00:00:00Z"),
      autoCreateUpdateNotice: false,
    };
    const { app } = createTestApp([[row]]);

    const res = await app.request("/api/onboarding/status", {
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toEqual({
      setup_completed_at: "2026-04-01T00:00:00.000Z",
      welcome_page_id: "page-1",
      welcome_page_created_at: "2026-04-01T00:00:00.000Z",
      home_slides_shown_at: "2026-04-02T00:00:00.000Z",
      auto_create_update_notice: false,
    });
    expect(mockRetryWelcomePageIfNeeded).toHaveBeenCalledTimes(1);
  });

  it("returns nulls and auto_create_update_notice=true when no row exists", async () => {
    mockRetryWelcomePageIfNeeded.mockResolvedValue(undefined);
    const { app } = createTestApp([[]]);

    const res = await app.request("/api/onboarding/status", {
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toEqual({
      setup_completed_at: null,
      welcome_page_id: null,
      welcome_page_created_at: null,
      home_slides_shown_at: null,
      auto_create_update_notice: true,
    });
  });

  it("returns 401 without auth header", async () => {
    const { app } = createTestApp([]);

    const res = await app.request("/api/onboarding/status", {
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status).toBe(401);
  });
});
