/**
 * 管理 API ルートのテスト（GET /users, PATCH /users/:id）
 */
import { describe, it, expect, vi } from "vitest";
import type { Context, Next } from "hono";
import type { AppEnv } from "../../../types/index.js";

vi.mock("../../../middleware/auth.js", () => ({
  authRequired: async (c: Context<AppEnv>, next: Next) => {
    const userId = c.req.header("x-test-user-id");
    const userEmail = c.req.header("x-test-user-email");
    if (!userId) return c.json({ message: "Unauthorized" }, 401);
    c.set("userId", userId);
    if (userEmail) c.set("userEmail", userEmail);
    await next();
  },
  authOptional: async (c: Context<AppEnv>, next: Next) => {
    const userId = c.req.header("x-test-user-id");
    const userEmail = c.req.header("x-test-user-email");
    if (userId) c.set("userId", userId);
    if (userEmail) c.set("userEmail", userEmail);
    await next();
  },
}));

// adminRequired はモックしない。実装の db.select().from(users).where().limit(1) が
// モック DB の「最初のクエリ結果」を使うので、先頭に [{ role: 'admin' }] または [{ role: 'user' }] を渡す。
const ADMIN_ROLE_RESULT = [{ role: "admin" }];
const USER_ROLE_RESULT = [{ role: "user" }];

import { createAdminTestApp, createMockUserRow, adminAuthHeaders } from "./setup.js";

// ── GET /api/admin/users ─────────────────────────────────────────────────────

describe("GET /api/admin/users", () => {
  it("returns 200 with users and total", async () => {
    const u1 = createMockUserRow({ id: "u1", email: "a@example.com", role: "user" });
    const u2 = createMockUserRow({ id: "u2", email: "b@example.com", role: "admin" });
    const { app } = createAdminTestApp([ADMIN_ROLE_RESULT, [u1, u2], [{ count: 2 }]]);

    const res = await app.request("/api/admin/users", {
      headers: adminAuthHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { users: Record<string, unknown>[]; total: number };
    expect(body).toHaveProperty("users");
    expect(body).toHaveProperty("total", 2);
    expect(body.users).toHaveLength(2);
    expect(body.users[0]).toMatchObject({ id: "u1", email: "a@example.com", role: "user" });
    expect(body.users[1]).toMatchObject({ id: "u2", email: "b@example.com", role: "admin" });
  });

  it("returns empty list and total when no users", async () => {
    const { app } = createAdminTestApp([ADMIN_ROLE_RESULT, [], [{ count: 0 }]]);

    const res = await app.request("/api/admin/users", {
      headers: adminAuthHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { users: unknown[]; total: number };
    expect(body.users).toEqual([]);
    expect(body.total).toBe(0);
  });

  it("honors limit and offset", async () => {
    const u1 = createMockUserRow({ id: "u1" });
    const { app } = createAdminTestApp([ADMIN_ROLE_RESULT, [u1], [{ count: 100 }]]);

    const res = await app.request("/api/admin/users?limit=10&offset=5", {
      headers: adminAuthHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { users: unknown[]; total: number };
    expect(body.users).toHaveLength(1);
    expect(body.total).toBe(100);
  });

  it("returns 401 without auth", async () => {
    const { app } = createAdminTestApp([]);

    const res = await app.request("/api/admin/users", {
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status).toBe(401);
  });

  it("returns 403 when user is not admin", async () => {
    const { app } = createAdminTestApp([USER_ROLE_RESULT]);

    const res = await app.request("/api/admin/users", {
      headers: adminAuthHeaders(),
    });

    expect(res.status).toBe(403);
  });
});

// ── PATCH /api/admin/users/:id ──────────────────────────────────────────────

describe("PATCH /api/admin/users/:id", () => {
  it("returns 200 and updated user when role is valid", async () => {
    const updated = createMockUserRow({
      id: "user-target-001",
      email: "user@example.com",
      role: "admin",
    });
    const { app } = createAdminTestApp([ADMIN_ROLE_RESULT, [updated]]);

    const res = await app.request("/api/admin/users/user-target-001", {
      method: "PATCH",
      headers: adminAuthHeaders(),
      body: JSON.stringify({ role: "admin" }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { user: Record<string, unknown> };
    expect(body).toHaveProperty("user");
    expect(body.user).toMatchObject({
      id: "user-target-001",
      email: "user@example.com",
      role: "admin",
    });
  });

  it("returns 400 when role is missing", async () => {
    const { app } = createAdminTestApp([ADMIN_ROLE_RESULT]);

    const res = await app.request("/api/admin/users/some-id", {
      method: "PATCH",
      headers: adminAuthHeaders(),
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toContain("role");
  });

  it("returns 400 when role is invalid", async () => {
    const { app } = createAdminTestApp([ADMIN_ROLE_RESULT]);

    const res = await app.request("/api/admin/users/some-id", {
      method: "PATCH",
      headers: adminAuthHeaders(),
      body: JSON.stringify({ role: "superadmin" }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toMatch(/user|admin/);
  });

  it("returns 404 when user not found", async () => {
    const { app } = createAdminTestApp([
      ADMIN_ROLE_RESULT,
      [], // update ... returning → no row
    ]);

    const res = await app.request("/api/admin/users/nonexistent-id", {
      method: "PATCH",
      headers: adminAuthHeaders(),
      body: JSON.stringify({ role: "admin" }),
    });

    expect(res.status).toBe(404);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toContain("not found");
  });

  it("returns 401 without auth", async () => {
    const { app } = createAdminTestApp([]);

    const res = await app.request("/api/admin/users/some-id", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "admin" }),
    });

    expect(res.status).toBe(401);
  });

  it("returns 403 when user is not admin", async () => {
    const { app } = createAdminTestApp([USER_ROLE_RESULT]);

    const res = await app.request("/api/admin/users/some-id", {
      method: "PATCH",
      headers: adminAuthHeaders(),
      body: JSON.stringify({ role: "admin" }),
    });

    expect(res.status).toBe(403);
  });
});
