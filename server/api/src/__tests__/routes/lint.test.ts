/**
 * /api/lint のテスト（run, findings, page-scoped findings, resolve）。
 * Tests for /api/lint routes.
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

const { mockRunAll, mockGetUnresolved, mockGetForPage, mockResolve } = vi.hoisted(() => ({
  mockRunAll: vi.fn(),
  mockGetUnresolved: vi.fn(),
  mockGetForPage: vi.fn(),
  mockResolve: vi.fn(),
}));

vi.mock("../../services/lintEngine/index.js", () => ({
  runAllLintRules: mockRunAll,
  getUnresolvedFindings: mockGetUnresolved,
  getFindingsForPage: mockGetForPage,
  resolveFinding: mockResolve,
}));

import { Hono } from "hono";
import lintRoutes from "../../routes/lint.js";
import { errorHandler } from "../../middleware/errorHandler.js";
import { createMockDb } from "../createMockDb.js";

const TEST_USER_ID = "user-lint-1";

function createTestApp() {
  const { db } = createMockDb([]);
  const app = new Hono<AppEnv>();
  app.use("*", async (c, next) => {
    c.set("db", db as unknown as AppEnv["Variables"]["db"]);
    await next();
  });
  app.onError(errorHandler);
  app.route("/api/lint", lintRoutes);
  return app;
}

function authHeaders(userId: string = TEST_USER_ID): Record<string, string> {
  return {
    "x-test-user-id": userId,
    "Content-Type": "application/json",
  };
}

beforeEach(() => {
  mockRunAll.mockReset();
  mockGetUnresolved.mockReset();
  mockGetForPage.mockReset();
  mockResolve.mockReset();
});

// ── POST /api/lint/run ──────────────────────────────────────────────────────

describe("POST /api/lint/run", () => {
  it("returns aggregated summary and total finding count", async () => {
    mockRunAll.mockResolvedValue([
      { rule: "orphan", findings: [{}, {}] },
      { rule: "broken_link", findings: [{}] },
      { rule: "ghost_many", findings: [] },
    ]);
    const app = createTestApp();

    const res = await app.request("/api/lint/run", {
      method: "POST",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      summary: Array<{ rule: string; count: number }>;
      total: number;
    };
    expect(body.summary).toEqual([
      { rule: "orphan", count: 2 },
      { rule: "broken_link", count: 1 },
      { rule: "ghost_many", count: 0 },
    ]);
    expect(body.total).toBe(3);
  });

  it("returns 401 without auth", async () => {
    const app = createTestApp();

    const res = await app.request("/api/lint/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status).toBe(401);
    expect(mockRunAll).not.toHaveBeenCalled();
  });
});

// ── GET /api/lint/findings ──────────────────────────────────────────────────

describe("GET /api/lint/findings", () => {
  it("returns mapped findings with snake_case fields and total", async () => {
    mockGetUnresolved.mockResolvedValue([
      {
        id: "f-1",
        rule: "orphan",
        severity: "info",
        pageIds: ["p-1"],
        detail: { title: "T" },
        createdAt: new Date("2026-04-01T00:00:00Z"),
      },
    ]);
    const app = createTestApp();

    const res = await app.request("/api/lint/findings", { headers: authHeaders() });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      findings: Array<Record<string, unknown>>;
      total: number;
    };
    expect(body.total).toBe(1);
    expect(body.findings[0]).toEqual({
      id: "f-1",
      rule: "orphan",
      severity: "info",
      page_ids: ["p-1"],
      detail: { title: "T" },
      created_at: "2026-04-01T00:00:00.000Z",
    });
  });

  it("returns empty list when no unresolved findings", async () => {
    mockGetUnresolved.mockResolvedValue([]);
    const app = createTestApp();

    const res = await app.request("/api/lint/findings", { headers: authHeaders() });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { findings: unknown[]; total: number };
    expect(body.findings).toEqual([]);
    expect(body.total).toBe(0);
  });
});

// ── GET /api/lint/findings/page/:pageId ─────────────────────────────────────

describe("GET /api/lint/findings/page/:pageId", () => {
  it("forwards pageId to service and returns findings", async () => {
    mockGetForPage.mockResolvedValue([
      {
        id: "f-2",
        rule: "broken_link",
        severity: "error",
        pageIds: ["p-9", "p-10"],
        detail: {},
        createdAt: new Date("2026-04-02T00:00:00Z"),
      },
    ]);
    const app = createTestApp();

    const res = await app.request("/api/lint/findings/page/p-9", {
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    expect(mockGetForPage).toHaveBeenCalledWith(TEST_USER_ID, "p-9", expect.anything());
    const body = (await res.json()) as { findings: Array<Record<string, unknown>>; total: number };
    expect(body.total).toBe(1);
    expect(body.findings[0]?.id).toBe("f-2");
  });
});

// ── POST /api/lint/findings/:id/resolve ─────────────────────────────────────

describe("POST /api/lint/findings/:id/resolve", () => {
  it("returns the resolved finding when present", async () => {
    mockResolve.mockResolvedValue({
      id: "f-3",
      rule: "orphan",
      severity: "info",
      pageIds: ["p-3"],
      detail: {},
      resolvedAt: new Date("2026-04-03T00:00:00Z"),
      createdAt: new Date("2026-04-01T00:00:00Z"),
    });
    const app = createTestApp();

    const res = await app.request("/api/lint/findings/f-3/resolve", {
      method: "POST",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { finding: Record<string, unknown> };
    expect(body.finding.id).toBe("f-3");
    expect(body.finding.resolved_at).toBe("2026-04-03T00:00:00.000Z");
    expect(body.finding.created_at).toBe("2026-04-01T00:00:00.000Z");
    expect(body.finding.page_ids).toEqual(["p-3"]);
  });

  it("returns 404 when finding does not exist or belongs to another user", async () => {
    mockResolve.mockResolvedValue(null);
    const app = createTestApp();

    const res = await app.request("/api/lint/findings/missing/resolve", {
      method: "POST",
      headers: authHeaders(),
    });

    expect(res.status).toBe(404);
  });

  it("handles null resolvedAt by serializing to null", async () => {
    mockResolve.mockResolvedValue({
      id: "f-4",
      rule: "orphan",
      severity: "info",
      pageIds: [],
      detail: {},
      resolvedAt: null,
      createdAt: new Date("2026-04-01T00:00:00Z"),
    });
    const app = createTestApp();

    const res = await app.request("/api/lint/findings/f-4/resolve", {
      method: "POST",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { finding: Record<string, unknown> };
    expect(body.finding.resolved_at).toBeNull();
  });
});
