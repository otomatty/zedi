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
import { parseAdminUserStatusFilter } from "../../../routes/admin/index.js";

// ── GET /api/admin/users ─────────────────────────────────────────────────────

describe("parseAdminUserStatusFilter", () => {
  it("returns a valid status filter unchanged", () => {
    expect(parseAdminUserStatusFilter("active")).toBe("active");
    expect(parseAdminUserStatusFilter("suspended")).toBe("suspended");
    expect(parseAdminUserStatusFilter("deleted")).toBe("deleted");
  });

  it("falls back to null for missing or invalid values", () => {
    expect(parseAdminUserStatusFilter(undefined)).toBeNull();
    expect(parseAdminUserStatusFilter("")).toBeNull();
    expect(parseAdminUserStatusFilter("archived")).toBeNull();
  });
});

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
//
// DB chain order after audit-log integration:
//   [0] adminRequired  → ADMIN_ROLE_RESULT
//   [1] tx.select before → [{ id, role }]
//   [2] tx.update returning → [updated]
//   [3] tx.insert audit log → [] (only when role actually changes)

describe("PATCH /api/admin/users/:id", () => {
  it("returns 200 and updated user when role is valid", async () => {
    const updated = createMockUserRow({
      id: "user-target-001",
      email: "user@example.com",
      role: "admin",
    });
    const { app } = createAdminTestApp([
      ADMIN_ROLE_RESULT,
      [{ id: "user-target-001", role: "user" }], // before snapshot
      [updated], // update returning
      [], // audit log insert
    ]);

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
      createdAt: updated.createdAt.toISOString(),
    });
  });

  it("records an audit log row when the role actually changes", async () => {
    const updated = createMockUserRow({
      id: "user-target-001",
      email: "user@example.com",
      role: "admin",
    });
    const { app, chains } = createAdminTestApp([
      ADMIN_ROLE_RESULT,
      [{ id: "user-target-001", role: "user" }],
      [updated],
      [],
    ]);

    const res = await app.request("/api/admin/users/user-target-001", {
      method: "PATCH",
      headers: adminAuthHeaders(),
      body: JSON.stringify({ role: "admin" }),
    });

    expect(res.status).toBe(200);

    // An insert chain (audit log) must have been recorded.
    const insertChains = chains.filter((ch) => ch.startMethod === "insert");
    expect(insertChains).toHaveLength(1);

    const firstInsert = insertChains.at(0);
    expect(firstInsert).toBeDefined();
    const valuesOp = (firstInsert as NonNullable<typeof firstInsert>).ops.find(
      (op) => op.method === "values",
    );
    expect(valuesOp).toBeDefined();
    const values = valuesOp?.args[0] as Record<string, unknown>;
    expect(values.action).toBe("user.role.update");
    expect(values.targetType).toBe("user");
    expect(values.targetId).toBe("user-target-001");
    expect(values.before).toEqual({ role: "user" });
    expect(values.after).toEqual({ role: "admin" });
    expect(values.actorUserId).toBe("user-admin-001");
  });

  it("does not record an audit log row when the role is unchanged", async () => {
    const updated = createMockUserRow({
      id: "user-target-001",
      email: "user@example.com",
      role: "admin",
    });
    const { app, chains } = createAdminTestApp([
      ADMIN_ROLE_RESULT,
      [{ id: "user-target-001", role: "admin" }], // already admin
      [updated],
    ]);

    const res = await app.request("/api/admin/users/user-target-001", {
      method: "PATCH",
      headers: adminAuthHeaders(),
      body: JSON.stringify({ role: "admin" }),
    });

    expect(res.status).toBe(200);
    const insertChains = chains.filter((ch) => ch.startMethod === "insert");
    expect(insertChains).toHaveLength(0);
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

  it("returns 400 when JSON body is invalid", async () => {
    const { app } = createAdminTestApp([ADMIN_ROLE_RESULT]);

    const res = await app.request("/api/admin/users/some-id", {
      method: "PATCH",
      headers: adminAuthHeaders(),
      body: "{invalid",
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toContain("invalid JSON body");
  });

  it("returns 404 when user not found", async () => {
    const { app } = createAdminTestApp([
      ADMIN_ROLE_RESULT,
      [], // tx.select before → no row
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
