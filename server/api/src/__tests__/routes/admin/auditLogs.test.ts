/**
 * 管理監査ログ API (`GET /api/admin/audit-logs`) のテスト。
 * Tests for the admin audit-log list API.
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
const USER_ROLE_RESULT = [{ role: "user" }];

import { createAdminTestApp, adminAuthHeaders } from "./setup.js";

/**
 * Build a single audit-log row matching the shape returned by the JOIN select.
 * JOIN 結果の 1 行分を組み立てる。
 */
function createMockAuditLogRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "log-001",
    actorUserId: "user-admin-001",
    actorEmail: "admin@example.com",
    actorName: "Admin",
    action: "user.role.update",
    targetType: "user",
    targetId: "user-target-001",
    targetEmail: "target@example.com",
    targetName: "Target",
    before: { role: "user" },
    after: { role: "admin" },
    ipAddress: "203.0.113.10",
    userAgent: "vitest/1.0",
    createdAt: new Date("2026-04-11T00:00:00Z"),
    ...overrides,
  };
}

// ── GET /api/admin/audit-logs ────────────────────────────────────────────────
//
// DB chain order:
//   [0] adminRequired → ADMIN_ROLE_RESULT
//   [1] list select (with leftJoin) → rows
//   [2] count select → [{ count }]

describe("GET /api/admin/audit-logs", () => {
  it("returns 200 with logs and total", async () => {
    const r1 = createMockAuditLogRow({ id: "log-001" });
    const r2 = createMockAuditLogRow({ id: "log-002" });
    const { app } = createAdminTestApp([ADMIN_ROLE_RESULT, [r1, r2], [{ count: 2 }]]);

    const res = await app.request("/api/admin/audit-logs", {
      headers: adminAuthHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      logs: Record<string, unknown>[];
      total: number;
    };
    expect(body).toHaveProperty("logs");
    expect(body).toHaveProperty("total", 2);
    expect(body.logs).toHaveLength(2);
    expect(body.logs[0]).toMatchObject({
      id: "log-001",
      action: "user.role.update",
      targetType: "user",
      targetId: "user-target-001",
      actorEmail: "admin@example.com",
      targetEmail: "target@example.com",
      before: { role: "user" },
      after: { role: "admin" },
      ipAddress: "203.0.113.10",
    });
  });

  it("returns empty list and total when no logs exist", async () => {
    const { app } = createAdminTestApp([ADMIN_ROLE_RESULT, [], [{ count: 0 }]]);

    const res = await app.request("/api/admin/audit-logs", {
      headers: adminAuthHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { logs: unknown[]; total: number };
    expect(body.logs).toEqual([]);
    expect(body.total).toBe(0);
  });

  it("honors limit and offset", async () => {
    const r1 = createMockAuditLogRow();
    const { app, chains } = createAdminTestApp([ADMIN_ROLE_RESULT, [r1], [{ count: 100 }]]);

    const res = await app.request("/api/admin/audit-logs?limit=10&offset=20", {
      headers: adminAuthHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { logs: unknown[]; total: number };
    expect(body.logs).toHaveLength(1);
    expect(body.total).toBe(100);

    // Confirm the list-select chain actually invoked .limit(10) and .offset(20).
    // list-select はチェーン index=1（admin role check の次）
    const listChain = chains[1];
    const limitOp = listChain?.ops.find((op) => op.method === "limit");
    const offsetOp = listChain?.ops.find((op) => op.method === "offset");
    expect(limitOp?.args[0]).toBe(10);
    expect(offsetOp?.args[0]).toBe(20);
  });

  it("clamps overly large limit and negative offset", async () => {
    const { app, chains } = createAdminTestApp([ADMIN_ROLE_RESULT, [], [{ count: 0 }]]);

    const res = await app.request("/api/admin/audit-logs?limit=9999&offset=-5", {
      headers: adminAuthHeaders(),
    });

    expect(res.status).toBe(200);
    const listChain = chains[1];
    const limitOp = listChain?.ops.find((op) => op.method === "limit");
    const offsetOp = listChain?.ops.find((op) => op.method === "offset");
    expect(limitOp?.args[0]).toBeLessThanOrEqual(200);
    expect(offsetOp?.args[0]).toBe(0);
  });

  it("returns 400 when 'from' query is not a valid date", async () => {
    const { app } = createAdminTestApp([ADMIN_ROLE_RESULT]);

    const res = await app.request("/api/admin/audit-logs?from=not-a-date", {
      headers: adminAuthHeaders(),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toMatch(/from|date/i);
  });

  it("returns 400 when 'to' query is not a valid date", async () => {
    const { app } = createAdminTestApp([ADMIN_ROLE_RESULT]);

    const res = await app.request("/api/admin/audit-logs?to=garbage", {
      headers: adminAuthHeaders(),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toMatch(/to|date/i);
  });

  it("accepts filter query params without error", async () => {
    const { app } = createAdminTestApp([ADMIN_ROLE_RESULT, [], [{ count: 0 }]]);

    const res = await app.request(
      "/api/admin/audit-logs?actorUserId=u1&action=user.role.update&targetType=user&targetId=t1&from=2026-01-01T00:00:00Z&to=2026-12-31T23:59:59Z",
      { headers: adminAuthHeaders() },
    );

    expect(res.status).toBe(200);
  });

  it("returns 401 without auth", async () => {
    const { app } = createAdminTestApp([]);

    const res = await app.request("/api/admin/audit-logs", {
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status).toBe(401);
  });

  it("returns 403 when user is not admin", async () => {
    const { app } = createAdminTestApp([USER_ROLE_RESULT]);

    const res = await app.request("/api/admin/audit-logs", {
      headers: adminAuthHeaders(),
    });

    expect(res.status).toBe(403);
  });
});
