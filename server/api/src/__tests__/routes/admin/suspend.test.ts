/**
 * サスペンド/復活 API ルートのテスト
 * Tests for POST /api/admin/users/:id/suspend and /unsuspend endpoints.
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

// ── POST /api/admin/users/:id/suspend ───────────────────────────────────────
//
// DB chain order:
//   [0] adminRequired → ADMIN_ROLE_RESULT
//   [1] tx.select target → [{ id, status, role }]
//   [2] tx.update returning → [updated]
//   [3] tx.delete sessions → []
//   [4] tx.insert audit log → []

describe("POST /api/admin/users/:id/suspend", () => {
  it("returns 200 and suspends the user with reason", async () => {
    const updated = createMockUserRow({
      id: "user-target-001",
      status: "suspended",
      suspendedAt: new Date(),
      suspendedReason: "Abuse",
      suspendedBy: TEST_ADMIN_ID,
    });
    const { app } = createAdminTestApp([
      ADMIN_ROLE_RESULT,
      [{ id: "user-target-001", status: "active", role: "user" }], // target check
      [updated], // update returning
      [], // delete sessions
      [], // audit log insert
    ]);

    const res = await app.request("/api/admin/users/user-target-001/suspend", {
      method: "POST",
      headers: adminAuthHeaders(),
      body: JSON.stringify({ reason: "Abuse" }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { user: Record<string, unknown> };
    expect(body).toHaveProperty("user");
    expect(body.user).toMatchObject({
      id: "user-target-001",
      status: "suspended",
    });
  });

  it("returns 200 and suspends without a reason", async () => {
    const updated = createMockUserRow({
      id: "user-target-001",
      status: "suspended",
      suspendedAt: new Date(),
      suspendedReason: null,
      suspendedBy: TEST_ADMIN_ID,
    });
    const { app } = createAdminTestApp([
      ADMIN_ROLE_RESULT,
      [{ id: "user-target-001", status: "active", role: "user" }],
      [updated],
      [],
      [],
    ]);

    const res = await app.request("/api/admin/users/user-target-001/suspend", {
      method: "POST",
      headers: adminAuthHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { user: Record<string, unknown> };
    expect(body.user).toMatchObject({ id: "user-target-001", status: "suspended" });
  });

  it("deletes all sessions for the suspended user", async () => {
    const updated = createMockUserRow({
      id: "user-target-001",
      status: "suspended",
    });
    const { app, chains } = createAdminTestApp([
      ADMIN_ROLE_RESULT,
      [{ id: "user-target-001", status: "active", role: "user" }],
      [updated],
      [], // delete sessions
      [], // audit log
    ]);

    const res = await app.request("/api/admin/users/user-target-001/suspend", {
      method: "POST",
      headers: adminAuthHeaders(),
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);

    // A delete chain (session cleanup) must have been recorded.
    const deleteChains = chains.filter((ch) => ch.startMethod === "delete");
    expect(deleteChains.length).toBeGreaterThanOrEqual(1);
  });

  it("records an audit log with action user.suspend", async () => {
    const updated = createMockUserRow({
      id: "user-target-001",
      status: "suspended",
    });
    const { app, chains } = createAdminTestApp([
      ADMIN_ROLE_RESULT,
      [{ id: "user-target-001", status: "active", role: "user" }],
      [updated],
      [],
      [],
    ]);

    const res = await app.request("/api/admin/users/user-target-001/suspend", {
      method: "POST",
      headers: adminAuthHeaders(),
      body: JSON.stringify({ reason: "Violation" }),
    });

    expect(res.status).toBe(200);

    const insertChains = chains.filter((ch) => ch.startMethod === "insert");
    expect(insertChains).toHaveLength(1);

    const valuesOp = insertChains[0]?.ops.find((op) => op.method === "values");
    expect(valuesOp).toBeDefined();
    const values = valuesOp?.args[0] as Record<string, unknown>;
    expect(values.action).toBe("user.suspend");
    expect(values.targetType).toBe("user");
    expect(values.targetId).toBe("user-target-001");
    expect(values.actorUserId).toBe(TEST_ADMIN_ID);
  });

  it("returns 400 when trying to suspend yourself", async () => {
    const { app } = createAdminTestApp([ADMIN_ROLE_RESULT]);

    const res = await app.request(`/api/admin/users/${TEST_ADMIN_ID}/suspend`, {
      method: "POST",
      headers: adminAuthHeaders(),
      body: JSON.stringify({ reason: "test" }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toContain("yourself");
  });

  it("returns 400 when user is already suspended", async () => {
    const { app } = createAdminTestApp([
      ADMIN_ROLE_RESULT,
      [{ id: "user-target-001", status: "suspended", role: "user" }],
    ]);

    const res = await app.request("/api/admin/users/user-target-001/suspend", {
      method: "POST",
      headers: adminAuthHeaders(),
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toContain("already suspended");
  });

  it("returns 400 when user is already deleted", async () => {
    const { app } = createAdminTestApp([
      ADMIN_ROLE_RESULT,
      [{ id: "user-target-001", status: "deleted", role: "user" }],
    ]);

    const res = await app.request("/api/admin/users/user-target-001/suspend", {
      method: "POST",
      headers: adminAuthHeaders(),
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toContain("deleted");
  });

  it("returns 404 when user not found", async () => {
    const { app } = createAdminTestApp([
      ADMIN_ROLE_RESULT,
      [], // no user found
    ]);

    const res = await app.request("/api/admin/users/nonexistent/suspend", {
      method: "POST",
      headers: adminAuthHeaders(),
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(404);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toContain("not found");
  });

  it("returns 401 without auth", async () => {
    const { app } = createAdminTestApp([]);

    const res = await app.request("/api/admin/users/some-id/suspend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(401);
  });
});

// ── POST /api/admin/users/:id/unsuspend ─────────────────────────────────────
//
// DB chain order:
//   [0] adminRequired → ADMIN_ROLE_RESULT
//   [1] tx.select target → [{ id, status, suspendedReason }]
//   [2] tx.update returning → [updated]
//   [3] tx.insert audit log → []

describe("POST /api/admin/users/:id/unsuspend", () => {
  it("returns 200 and unsuspends the user", async () => {
    const updated = createMockUserRow({
      id: "user-target-001",
      status: "active",
      suspendedAt: null,
      suspendedReason: null,
      suspendedBy: null,
    });
    const { app } = createAdminTestApp([
      ADMIN_ROLE_RESULT,
      [{ id: "user-target-001", status: "suspended", suspendedReason: "Abuse" }],
      [updated],
      [], // audit log
    ]);

    const res = await app.request("/api/admin/users/user-target-001/unsuspend", {
      method: "POST",
      headers: adminAuthHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { user: Record<string, unknown> };
    expect(body.user).toMatchObject({
      id: "user-target-001",
      status: "active",
    });
  });

  it("records an audit log with action user.unsuspend", async () => {
    const updated = createMockUserRow({
      id: "user-target-001",
      status: "active",
    });
    const { app, chains } = createAdminTestApp([
      ADMIN_ROLE_RESULT,
      [{ id: "user-target-001", status: "suspended", suspendedReason: "Abuse" }],
      [updated],
      [],
    ]);

    const res = await app.request("/api/admin/users/user-target-001/unsuspend", {
      method: "POST",
      headers: adminAuthHeaders(),
    });

    expect(res.status).toBe(200);

    const insertChains = chains.filter((ch) => ch.startMethod === "insert");
    expect(insertChains).toHaveLength(1);

    const valuesOp = insertChains[0]?.ops.find((op) => op.method === "values");
    expect(valuesOp).toBeDefined();
    const values = valuesOp?.args[0] as Record<string, unknown>;
    expect(values.action).toBe("user.unsuspend");
    expect(values.targetType).toBe("user");
    expect(values.targetId).toBe("user-target-001");
  });

  it("returns 400 when user is not suspended", async () => {
    const { app } = createAdminTestApp([
      ADMIN_ROLE_RESULT,
      [{ id: "user-target-001", status: "active", suspendedReason: null }],
    ]);

    const res = await app.request("/api/admin/users/user-target-001/unsuspend", {
      method: "POST",
      headers: adminAuthHeaders(),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toContain("not suspended");
  });

  it("returns 404 when user not found", async () => {
    const { app } = createAdminTestApp([ADMIN_ROLE_RESULT, []]);

    const res = await app.request("/api/admin/users/nonexistent/unsuspend", {
      method: "POST",
      headers: adminAuthHeaders(),
    });

    expect(res.status).toBe(404);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toContain("not found");
  });

  it("returns 401 without auth", async () => {
    const { app } = createAdminTestApp([]);

    const res = await app.request("/api/admin/users/some-id/unsuspend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status).toBe(401);
  });
});
