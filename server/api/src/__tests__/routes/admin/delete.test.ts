/**
 * ユーザー削除 API ルートのテスト
 * Tests for DELETE /api/admin/users/:id and GET /api/admin/users/:id/impact endpoints.
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

const ADMIN_ROLE_RESULT = [{ role: "admin" }];

import { createAdminTestApp, createMockUserRow, adminAuthHeaders, TEST_ADMIN_ID } from "./setup.js";

// ── DELETE /api/admin/users/:id ────────────────────────────────────────────
//
// DB chain order:
//   [0] adminRequired → ADMIN_ROLE_RESULT
//   [1] tx.select target → [{ id, status }]
//   [2] tx.select (anonymizeUser before-snapshot) → [{ id, name, email, image, status }]
//   [3] tx.delete sessions → []
//   [4] tx.delete account → []
//   [5] tx.update returning (anonymize) → [updated]
//   [6] tx.insert audit log → []

describe("DELETE /api/admin/users/:id", () => {
  it("returns 200 and deletes (anonymizes) the user", async () => {
    const updated = createMockUserRow({
      id: "user-target-001",
      name: "Deleted User",
      email: "deleted-user-target-001@example.invalid",
      status: "deleted",
    });
    const { app } = createAdminTestApp([
      ADMIN_ROLE_RESULT,
      [{ id: "user-target-001", status: "active" }], // target check
      [
        {
          id: "user-target-001",
          name: "Test User",
          email: "user@example.com",
          image: null,
          status: "active",
        },
      ], // anonymizeUser before-snapshot
      [], // delete sessions
      [], // delete account
      [updated], // update returning
      [], // audit log insert
    ]);

    const res = await app.request("/api/admin/users/user-target-001", {
      method: "DELETE",
      headers: adminAuthHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { user: Record<string, unknown> };
    expect(body).toHaveProperty("user");
    expect(body.user).toMatchObject({
      id: "user-target-001",
      status: "deleted",
      name: "Deleted User",
    });
  });

  it("deletes all sessions and account records for the user", async () => {
    const updated = createMockUserRow({
      id: "user-target-001",
      status: "deleted",
      name: "Deleted User",
      email: "deleted-user-target-001@example.invalid",
    });
    const { app, chains } = createAdminTestApp([
      ADMIN_ROLE_RESULT,
      [{ id: "user-target-001", status: "active" }],
      [
        {
          id: "user-target-001",
          name: "Test User",
          email: "user@example.com",
          image: null,
          status: "active",
        },
      ],
      [], // delete sessions
      [], // delete account
      [updated],
      [],
    ]);

    const res = await app.request("/api/admin/users/user-target-001", {
      method: "DELETE",
      headers: adminAuthHeaders(),
    });

    expect(res.status).toBe(200);

    // Two delete chains: sessions and account
    const deleteChains = chains.filter((ch) => ch.startMethod === "delete");
    expect(deleteChains.length).toBeGreaterThanOrEqual(2);
  });

  it("records an audit log with action user.delete", async () => {
    const updated = createMockUserRow({
      id: "user-target-001",
      status: "deleted",
      name: "Deleted User",
      email: "deleted-user-target-001@example.invalid",
    });
    const { app, chains } = createAdminTestApp([
      ADMIN_ROLE_RESULT,
      [{ id: "user-target-001", status: "active" }],
      [
        {
          id: "user-target-001",
          name: "Test User",
          email: "user@example.com",
          image: null,
          status: "active",
        },
      ],
      [],
      [],
      [updated],
      [],
    ]);

    const res = await app.request("/api/admin/users/user-target-001", {
      method: "DELETE",
      headers: adminAuthHeaders(),
    });

    expect(res.status).toBe(200);

    const insertChains = chains.filter((ch) => ch.startMethod === "insert");
    expect(insertChains).toHaveLength(1);

    const valuesOp = insertChains[0]?.ops.find((op) => op.method === "values");
    expect(valuesOp).toBeDefined();
    const values = valuesOp?.args[0] as Record<string, unknown>;
    expect(values.action).toBe("user.delete");
    expect(values.targetType).toBe("user");
    expect(values.targetId).toBe("user-target-001");
    expect(values.actorUserId).toBe(TEST_ADMIN_ID);
  });

  it("returns 400 when trying to delete yourself", async () => {
    const { app } = createAdminTestApp([ADMIN_ROLE_RESULT]);

    const res = await app.request(`/api/admin/users/${TEST_ADMIN_ID}`, {
      method: "DELETE",
      headers: adminAuthHeaders(),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toContain("yourself");
  });

  it("returns 400 when user is already deleted", async () => {
    const { app } = createAdminTestApp([
      ADMIN_ROLE_RESULT,
      [{ id: "user-target-001", status: "deleted" }],
    ]);

    const res = await app.request("/api/admin/users/user-target-001", {
      method: "DELETE",
      headers: adminAuthHeaders(),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toContain("already deleted");
  });

  it("returns 404 when user not found", async () => {
    const { app } = createAdminTestApp([
      ADMIN_ROLE_RESULT,
      [], // no user found
    ]);

    const res = await app.request("/api/admin/users/nonexistent", {
      method: "DELETE",
      headers: adminAuthHeaders(),
    });

    expect(res.status).toBe(404);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toContain("not found");
  });

  it("returns 401 without auth", async () => {
    const { app } = createAdminTestApp([]);

    const res = await app.request("/api/admin/users/some-id", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status).toBe(401);
  });

  it("can delete a suspended user", async () => {
    const updated = createMockUserRow({
      id: "user-target-001",
      status: "deleted",
      name: "Deleted User",
      email: "deleted-user-target-001@example.invalid",
    });
    const { app } = createAdminTestApp([
      ADMIN_ROLE_RESULT,
      [{ id: "user-target-001", status: "suspended" }],
      [
        {
          id: "user-target-001",
          name: "Test User",
          email: "user@example.com",
          image: null,
          status: "suspended",
        },
      ],
      [],
      [],
      [updated],
      [],
    ]);

    const res = await app.request("/api/admin/users/user-target-001", {
      method: "DELETE",
      headers: adminAuthHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { user: Record<string, unknown> };
    expect(body.user).toMatchObject({
      id: "user-target-001",
      status: "deleted",
    });
  });
});

// ── GET /api/admin/users/:id/impact ────────────────────────────────────────
//
// DB chain order:
//   [0] adminRequired → ADMIN_ROLE_RESULT
//   [1] select user existence → [{ id }]
//   [2-5] parallel: notesCount, sessionsCount, subscription, aiUsage

describe("GET /api/admin/users/:id/impact", () => {
  it("returns 200 with impact data", async () => {
    const { app } = createAdminTestApp([
      ADMIN_ROLE_RESULT,
      [{ id: "user-target-001" }], // user exists
      [{ count: 5 }], // notesCount
      [{ count: 2 }], // sessionsCount
      [{ status: "active" }], // subscription
      [{ createdAt: new Date("2026-04-01T12:00:00Z") }], // lastAiUsage
    ]);

    const res = await app.request("/api/admin/users/user-target-001/impact", {
      method: "GET",
      headers: adminAuthHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toHaveProperty("notesCount");
    expect(body).toHaveProperty("sessionsCount");
    expect(body).toHaveProperty("activeSubscription");
    expect(body).toHaveProperty("lastAiUsageAt");
  });

  it("returns 404 when user not found", async () => {
    const { app } = createAdminTestApp([
      ADMIN_ROLE_RESULT,
      [], // no user found
    ]);

    const res = await app.request("/api/admin/users/nonexistent/impact", {
      method: "GET",
      headers: adminAuthHeaders(),
    });

    expect(res.status).toBe(404);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toContain("not found");
  });

  it("returns 401 without auth", async () => {
    const { app } = createAdminTestApp([]);

    const res = await app.request("/api/admin/users/some-id/impact", {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status).toBe(401);
  });
});
