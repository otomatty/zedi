/**
 * ユーザールートのテスト（GET /me, GET /:id）
 * Tests for user routes (GET /me, GET /:id)
 */
import { describe, it, expect, vi } from "vitest";
import type { Context, Next } from "hono";
import { Hono } from "hono";
import type { AppEnv } from "../../types/index.js";
import { createMockDb } from "../createMockDb.js";

vi.mock("../../middleware/auth.js", () => ({
  authRequired: async (c: Context<AppEnv>, next: Next) => {
    const userId = c.req.header("x-test-user-id");
    if (!userId) return c.json({ message: "Unauthorized" }, 401);
    c.set("userId", userId);
    await next();
  },
}));

import userRoutes from "../../routes/users.js";

const TEST_USER_ID = "user-test-123";
const OTHER_USER_ID = "user-other-456";

/** GET /me のモック行（users テーブル全列に相当） / Mock row shape for GET /me (full user row). */
type MockFullUserRow = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string;
  role: "user";
  createdAt: Date;
  updatedAt: Date;
};

function createTestApp(dbResults: unknown[]): {
  app: Hono<AppEnv>;
  chains: ReturnType<typeof createMockDb>["chains"];
} {
  const { db, chains } = createMockDb(dbResults);
  const app = new Hono<AppEnv>();

  app.use("*", async (c, next) => {
    c.set("db", db as unknown as AppEnv["Variables"]["db"]);
    await next();
  });

  app.route("/api/users", userRoutes);
  return { app, chains };
}

function authHeaders(userId: string = TEST_USER_ID): Record<string, string> {
  return {
    "x-test-user-id": userId,
    "Content-Type": "application/json",
  };
}

function createMockUser(overrides: Partial<MockFullUserRow> = {}): MockFullUserRow {
  return {
    id: TEST_USER_ID,
    name: "Test User",
    email: "test@example.com",
    emailVerified: true,
    image: "https://example.com/avatar.png",
    role: "user" as const,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

// ── GET /api/users/me ───────────────────────────────────────────────────────

describe("GET /api/users/me", () => {
  it("returns the current user's full profile", async () => {
    const mockUser = createMockUser();
    const { app } = createTestApp([[mockUser]]);

    const res = await app.request("/api/users/me", { headers: authHeaders() });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { user: Record<string, unknown> };
    expect(body.user).toMatchObject({
      id: TEST_USER_ID,
      name: "Test User",
      email: "test@example.com",
      emailVerified: true,
      image: "https://example.com/avatar.png",
      role: "user",
    });
    expect(body.user.createdAt).toEqual(expect.any(String));
    expect(body.user.updatedAt).toEqual(expect.any(String));
  });

  it("returns 404 when user does not exist in DB", async () => {
    const { app } = createTestApp([[]]);

    const res = await app.request("/api/users/me", { headers: authHeaders() });

    expect(res.status).toBe(404);
  });

  it("returns 401 without auth", async () => {
    const { app } = createTestApp([]);

    const res = await app.request("/api/users/me", {
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status).toBe(401);
  });
});

// ── GET /api/users/:id ──────────────────────────────────────────────────────

describe("GET /api/users/:id", () => {
  it("returns own profile (limited fields) when id matches authenticated user", async () => {
    /**
     * Drizzle の部分 select と同じ形。モックが余分な列を返すとレスポンス契約のテストにならない。
     * Same shape as Drizzle partial select; extra columns in the mock would invalidate the response contract test.
     */
    const mockPublicProfile = {
      id: TEST_USER_ID,
      name: "Test User",
      image: "https://example.com/avatar.png",
    };
    const { app } = createTestApp([[mockPublicProfile]]);

    const res = await app.request(`/api/users/${TEST_USER_ID}`, {
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { user: Record<string, unknown> };
    expect(Object.keys(body.user).sort()).toEqual(["id", "image", "name"]);
    expect(body.user).toMatchObject({
      id: TEST_USER_ID,
      name: "Test User",
      image: "https://example.com/avatar.png",
    });
    expect(body.user).not.toHaveProperty("email");
    expect(body.user).not.toHaveProperty("role");
  });

  it("returns 403 when requesting another user's profile", async () => {
    const { app } = createTestApp([]);

    const res = await app.request(`/api/users/${OTHER_USER_ID}`, {
      headers: authHeaders(),
    });

    expect(res.status).toBe(403);
  });

  it("returns 404 when own user not found in DB", async () => {
    const { app } = createTestApp([[]]);

    const res = await app.request(`/api/users/${TEST_USER_ID}`, {
      headers: authHeaders(),
    });

    expect(res.status).toBe(404);
  });

  it("returns 401 without auth", async () => {
    const { app } = createTestApp([]);

    const res = await app.request(`/api/users/${TEST_USER_ID}`, {
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status).toBe(401);
  });
});
