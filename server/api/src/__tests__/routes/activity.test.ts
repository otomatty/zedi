/**
 * /api/activity のテスト（list, index 読み取り, index 再構築）。
 * Tests for /api/activity routes (list, index read, index rebuild).
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

const { mockListActivity, mockRecordActivity, mockBuildIndex, mockRebuildIndex } = vi.hoisted(
  () => ({
    mockListActivity: vi.fn(),
    mockRecordActivity: vi.fn(),
    mockBuildIndex: vi.fn(),
    mockRebuildIndex: vi.fn(),
  }),
);

vi.mock("../../services/activityLogService.js", () => ({
  listActivityForOwner: mockListActivity,
  recordActivity: mockRecordActivity,
  ACTIVITY_LIST_DEFAULT_LIMIT: 50,
  ACTIVITY_LIST_MAX_LIMIT: 200,
}));

vi.mock("../../services/indexBuilder.js", () => ({
  buildIndexForOwner: mockBuildIndex,
  rebuildIndexForOwner: mockRebuildIndex,
}));

import { Hono } from "hono";
import activityRoutes from "../../routes/activity.js";
import { errorHandler } from "../../middleware/errorHandler.js";
import { createMockDb } from "../createMockDb.js";

const TEST_USER_ID = "user-act-1";

function createTestApp(dbResults: unknown[]) {
  const { db, chains } = createMockDb(dbResults);
  const app = new Hono<AppEnv>();
  app.use("*", async (c, next) => {
    c.set("db", db as unknown as AppEnv["Variables"]["db"]);
    await next();
  });
  app.onError(errorHandler);
  app.route("/api/activity", activityRoutes);
  return { app, chains };
}

function authHeaders(userId: string = TEST_USER_ID): Record<string, string> {
  return {
    "x-test-user-id": userId,
    "Content-Type": "application/json",
  };
}

beforeEach(() => {
  mockListActivity.mockReset();
  mockRecordActivity.mockReset();
  mockBuildIndex.mockReset();
  mockRebuildIndex.mockReset();
});

// ── GET /api/activity ───────────────────────────────────────────────────────

describe("GET /api/activity", () => {
  it("returns mapped entries with snake_case field names", async () => {
    mockListActivity.mockResolvedValue({
      rows: [
        {
          id: "act-1",
          kind: "lint_run",
          actor: "system",
          targetPageIds: ["p-1"],
          detail: { count: 3 },
          createdAt: new Date("2026-04-01T00:00:00Z"),
        },
      ],
      total: 1,
    });
    const { app } = createTestApp([]);

    const res = await app.request("/api/activity", { headers: authHeaders() });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      entries: Array<Record<string, unknown>>;
      total: number;
      limit: number;
    };
    expect(body.entries[0]).toEqual({
      id: "act-1",
      kind: "lint_run",
      actor: "system",
      target_page_ids: ["p-1"],
      detail: { count: 3 },
      created_at: "2026-04-01T00:00:00.000Z",
    });
    expect(body.total).toBe(1);
    expect(body.limit).toBe(50);
  });

  it("clamps limit to ACTIVITY_LIST_MAX_LIMIT (200) in the response", async () => {
    mockListActivity.mockResolvedValue({ rows: [], total: 0 });
    const { app } = createTestApp([]);

    const res = await app.request("/api/activity?limit=9999", { headers: authHeaders() });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { limit: number };
    expect(body.limit).toBe(200);
    // 何が下流に渡されるかはサービス側の責務なので、ここではアサートしない。
    // Don't pin the value passed downstream — leave the bounding contract to the service.
  });

  it("rejects invalid kind with 400", async () => {
    const { app } = createTestApp([]);

    const res = await app.request("/api/activity?kind=bogus", { headers: authHeaders() });

    expect(res.status).toBe(400);
    expect(mockListActivity).not.toHaveBeenCalled();
  });

  it("rejects invalid actor with 400", async () => {
    const { app } = createTestApp([]);

    const res = await app.request("/api/activity?actor=robot", { headers: authHeaders() });

    expect(res.status).toBe(400);
    expect(mockListActivity).not.toHaveBeenCalled();
  });

  it("rejects invalid 'from' date with 400", async () => {
    const { app } = createTestApp([]);

    const res = await app.request("/api/activity?from=not-a-date", { headers: authHeaders() });

    expect(res.status).toBe(400);
  });

  it("rejects inverted from > to range with 400", async () => {
    const { app } = createTestApp([]);

    const res = await app.request(
      "/api/activity?from=2026-04-10T00:00:00Z&to=2026-04-01T00:00:00Z",
      { headers: authHeaders() },
    );

    expect(res.status).toBe(400);
  });

  it("falls back to default limit when limit query is non-numeric", async () => {
    mockListActivity.mockResolvedValue({ rows: [], total: 0 });
    const { app } = createTestApp([]);

    const res = await app.request("/api/activity?limit=abc", { headers: authHeaders() });

    expect(res.status).toBe(200);
    expect(mockListActivity.mock.calls[0]?.[2]?.limit).toBe(50);
  });

  it("returns 401 without auth", async () => {
    const { app } = createTestApp([]);

    const res = await app.request("/api/activity", {
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status).toBe(401);
  });
});

// ── GET /api/activity/index ─────────────────────────────────────────────────

describe("GET /api/activity/index", () => {
  it("returns pageId=null and category summary when no __index__ page exists", async () => {
    mockBuildIndex.mockResolvedValue({
      totalPages: 10,
      categories: [
        { label: "Foo", entries: [{ id: "p-1" }, { id: "p-2" }] },
        { label: "Bar", entries: [{ id: "p-3" }] },
      ],
    });
    // db.select(...).from(pages).where(...) returns empty.
    const { app } = createTestApp([[]]);

    const res = await app.request("/api/activity/index", { headers: authHeaders() });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      pageId: string | null;
      lastBuiltAt: string | null;
      totalPages: number;
      categories: Array<{ label: string; count: number }>;
    };
    expect(body.pageId).toBeNull();
    expect(body.lastBuiltAt).toBeNull();
    expect(body.totalPages).toBe(10);
    expect(body.categories).toEqual([
      { label: "Foo", count: 2 },
      { label: "Bar", count: 1 },
    ]);
  });

  it("returns pageId and lastBuiltAt when __index__ page exists", async () => {
    mockBuildIndex.mockResolvedValue({ totalPages: 0, categories: [] });
    const built = new Date("2026-04-15T12:00:00Z");
    const { app } = createTestApp([[{ id: "page-index", updatedAt: built }]]);

    const res = await app.request("/api/activity/index", { headers: authHeaders() });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      pageId: string | null;
      lastBuiltAt: string | null;
      totalPages: number;
      categories: unknown[];
    };
    expect(body.pageId).toBe("page-index");
    expect(body.lastBuiltAt).toBe("2026-04-15T12:00:00.000Z");
  });
});

// ── POST /api/activity/index/rebuild ────────────────────────────────────────

describe("POST /api/activity/index/rebuild", () => {
  it("returns rebuilt summary and records an index_build activity", async () => {
    mockRebuildIndex.mockResolvedValue({
      pageId: "page-index",
      created: true,
      document: {
        totalPages: 5,
        categories: [{ label: "A", entries: [{ id: "p" }] }],
        generatedAt: "2026-04-26T00:00:00.000Z",
      },
    });
    mockRecordActivity.mockResolvedValue(undefined);
    const { app } = createTestApp([]);

    const res = await app.request("/api/activity/index/rebuild", {
      method: "POST",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      pageId: string;
      created: boolean;
      totalPages: number;
      categories: Array<{ label: string; count: number }>;
      generatedAt: string;
    };
    expect(body.pageId).toBe("page-index");
    expect(body.created).toBe(true);
    expect(body.totalPages).toBe(5);
    expect(body.categories).toEqual([{ label: "A", count: 1 }]);

    expect(mockRecordActivity).toHaveBeenCalledTimes(1);
    expect(mockRecordActivity.mock.calls[0]?.[1]).toMatchObject({
      ownerId: TEST_USER_ID,
      kind: "index_build",
      actor: "user",
      targetPageIds: ["page-index"],
    });
  });

  it("returns 401 without auth", async () => {
    const { app } = createTestApp([]);

    const res = await app.request("/api/activity/index/rebuild", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status).toBe(401);
  });
});
