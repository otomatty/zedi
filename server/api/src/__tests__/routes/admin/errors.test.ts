/**
 * 管理 API: `GET /api/admin/errors`, `GET /api/admin/errors/:id`,
 * `PATCH /api/admin/errors/:id` のテスト。
 *
 * Tests for the admin `api_errors` list / detail / status-update endpoints.
 *
 * DB chain order on each request:
 *   [0] adminRequired → ADMIN_ROLE_RESULT (or USER_ROLE_RESULT for 403 cases)
 *   [1..] handler queries (depends on the route)
 */
import { afterEach, describe, it, expect, vi } from "vitest";
import type { Context, Next } from "hono";
import type { AppEnv } from "../../../types/index.js";
import {
  clearApiErrorSubscribers,
  publishApiErrorUpdate,
} from "../../../services/apiErrorBroadcaster.js";

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
 * `apiErrors` 行のテストフィクスチャ。シリアライズ後の比較で扱いやすいよう
 * Date は `new Date(...)` ではなくフィクスチャ生成側で固定する。
 *
 * Test fixture for an `api_errors` row; Date instances are created up front so
 * post-serialization comparisons are deterministic.
 */
function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    sentryIssueId: "sentry-issue-1",
    fingerprint: null,
    title: "TypeError: x is undefined",
    route: "POST /api/ingest",
    statusCode: 500,
    occurrences: 3,
    firstSeenAt: new Date("2026-05-01T00:00:00Z"),
    lastSeenAt: new Date("2026-05-04T00:00:00Z"),
    severity: "unknown" as const,
    status: "open" as const,
    aiSummary: null,
    aiSuspectedFiles: null,
    aiRootCause: null,
    aiSuggestedFix: null,
    githubIssueNumber: null,
    createdAt: new Date("2026-05-01T00:00:00Z"),
    updatedAt: new Date("2026-05-04T00:00:00Z"),
    ...overrides,
  };
}

// ── GET /api/admin/errors ────────────────────────────────────────────────────

describe("GET /api/admin/errors", () => {
  it("returns 200 with rows, total, limit, and offset", async () => {
    const r1 = makeRow({ id: "00000000-0000-0000-0000-000000000001" });
    const r2 = makeRow({ id: "00000000-0000-0000-0000-000000000002" });
    // listApiErrors issues: [list, count]
    const { app } = createAdminTestApp([ADMIN_ROLE_RESULT, [r1, r2], [{ count: 2 }]]);

    const res = await app.request("/api/admin/errors", { headers: adminAuthHeaders() });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      errors: { id: string }[];
      total: number;
      limit: number;
      offset: number;
    };
    expect(body.errors).toHaveLength(2);
    expect(body.total).toBe(2);
    expect(body.limit).toBe(50);
    expect(body.offset).toBe(0);
  });

  it("clamps limit to MAX_LIMIT (200) and accepts offset", async () => {
    const { app } = createAdminTestApp([ADMIN_ROLE_RESULT, [], [{ count: 0 }]]);

    const res = await app.request("/api/admin/errors?limit=10000&offset=5", {
      headers: adminAuthHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { limit: number; offset: number };
    expect(body.limit).toBe(200);
    expect(body.offset).toBe(5);
  });

  it("ignores unknown status / severity filters", async () => {
    const { app } = createAdminTestApp([ADMIN_ROLE_RESULT, [], [{ count: 0 }]]);

    const res = await app.request("/api/admin/errors?status=garbage&severity=nope", {
      headers: adminAuthHeaders(),
    });
    expect(res.status).toBe(200);
  });

  it("returns 401 without auth", async () => {
    const { app } = createAdminTestApp([]);
    const res = await app.request("/api/admin/errors", {
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(401);
  });

  it("returns 403 when user is not admin", async () => {
    const { app } = createAdminTestApp([USER_ROLE_RESULT]);
    const res = await app.request("/api/admin/errors", { headers: adminAuthHeaders() });
    expect(res.status).toBe(403);
  });
});

// ── GET /api/admin/errors/:id ───────────────────────────────────────────────

describe("GET /api/admin/errors/:id", () => {
  it("returns 200 with the row when found", async () => {
    const row = makeRow({ id: "00000000-0000-0000-0000-000000000010" });
    const { app } = createAdminTestApp([ADMIN_ROLE_RESULT, [row]]);

    const res = await app.request("/api/admin/errors/00000000-0000-0000-0000-000000000010", {
      headers: adminAuthHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { error: { id: string } };
    expect(body.error.id).toBe("00000000-0000-0000-0000-000000000010");
  });

  it("returns 404 when the row is not found", async () => {
    const { app } = createAdminTestApp([ADMIN_ROLE_RESULT, []]);

    const res = await app.request("/api/admin/errors/00000000-0000-0000-0000-000000000099", {
      headers: adminAuthHeaders(),
    });

    expect(res.status).toBe(404);
  });

  it("returns 403 when user is not admin", async () => {
    const { app } = createAdminTestApp([USER_ROLE_RESULT]);
    const res = await app.request("/api/admin/errors/00000000-0000-0000-0000-000000000010", {
      headers: adminAuthHeaders(),
    });
    expect(res.status).toBe(403);
  });

  it("returns 404 when id is not a valid UUID (no DB query issued)", async () => {
    // 不正な UUID は Postgres まで投げると 500 になるので、ルート層で 404 にする。
    // Malformed UUIDs would otherwise surface as a Postgres-level 500; reject early.
    const { app, chains } = createAdminTestApp([ADMIN_ROLE_RESULT]);
    const res = await app.request("/api/admin/errors/not-a-uuid", { headers: adminAuthHeaders() });
    expect(res.status).toBe(404);
    // Only the adminRequired role-check chain ran; no errors-table SELECT was issued.
    expect(chains).toHaveLength(1);
  });
});

// ── PATCH /api/admin/errors/:id ─────────────────────────────────────────────

const VALID_UUID = "00000000-0000-0000-0000-000000000001";

describe("PATCH /api/admin/errors/:id", () => {
  it("updates status when transition is valid", async () => {
    const before = makeRow({ status: "open" });
    const after = makeRow({ ...before, status: "investigating" });
    // updateApiErrorStatus issues: [select current, update returning].
    const { app } = createAdminTestApp([ADMIN_ROLE_RESULT, [before], [after]]);

    const res = await app.request(`/api/admin/errors/${before.id}`, {
      method: "PATCH",
      headers: adminAuthHeaders(),
      body: JSON.stringify({ status: "investigating" }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { error: { status: string } };
    expect(body.error.status).toBe("investigating");
  });

  it("returns 200 (no-op) when transitioning to the same status", async () => {
    const row = makeRow({ status: "open" });
    // Same-status short-circuits: only the SELECT is issued.
    const { app } = createAdminTestApp([ADMIN_ROLE_RESULT, [row]]);

    const res = await app.request(`/api/admin/errors/${row.id}`, {
      method: "PATCH",
      headers: adminAuthHeaders(),
      body: JSON.stringify({ status: "open" }),
    });

    expect(res.status).toBe(200);
  });

  it("returns 400 when body is invalid JSON", async () => {
    const { app } = createAdminTestApp([ADMIN_ROLE_RESULT]);
    const res = await app.request(`/api/admin/errors/${VALID_UUID}`, {
      method: "PATCH",
      headers: adminAuthHeaders(),
      body: "{not-json",
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when status is missing", async () => {
    const { app } = createAdminTestApp([ADMIN_ROLE_RESULT]);
    const res = await app.request(`/api/admin/errors/${VALID_UUID}`, {
      method: "PATCH",
      headers: adminAuthHeaders(),
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when body is JSON null", async () => {
    // body が "null" のときに body.status を読むと TypeError になりうる。
    // Sending a literal `null` body must short-circuit to 400 before
    // dereferencing `.status`.
    const { app } = createAdminTestApp([ADMIN_ROLE_RESULT]);
    const res = await app.request(`/api/admin/errors/${VALID_UUID}`, {
      method: "PATCH",
      headers: adminAuthHeaders(),
      body: "null",
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when status is not a recognized value", async () => {
    const { app } = createAdminTestApp([ADMIN_ROLE_RESULT]);
    const res = await app.request(`/api/admin/errors/${VALID_UUID}`, {
      method: "PATCH",
      headers: adminAuthHeaders(),
      body: JSON.stringify({ status: "garbage" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 404 when id is not a valid UUID (no DB query issued)", async () => {
    const { app, chains } = createAdminTestApp([ADMIN_ROLE_RESULT]);
    const res = await app.request("/api/admin/errors/not-a-uuid", {
      method: "PATCH",
      headers: adminAuthHeaders(),
      body: JSON.stringify({ status: "investigating" }),
    });
    expect(res.status).toBe(404);
    // Only the adminRequired role-check chain ran; no SELECT/UPDATE was issued.
    expect(chains).toHaveLength(1);
  });

  it("returns 400 on a disallowed transition (ignored -> resolved)", async () => {
    const before = makeRow({ status: "ignored" });
    // updateApiErrorStatus throws after the SELECT; only one chain is needed.
    const { app } = createAdminTestApp([ADMIN_ROLE_RESULT, [before]]);

    const res = await app.request(`/api/admin/errors/${before.id}`, {
      method: "PATCH",
      headers: adminAuthHeaders(),
      body: JSON.stringify({ status: "resolved" }),
    });

    expect(res.status).toBe(400);
  });

  it("returns 404 when the row does not exist", async () => {
    const { app } = createAdminTestApp([ADMIN_ROLE_RESULT, []]);
    const res = await app.request("/api/admin/errors/00000000-0000-0000-0000-000000000099", {
      method: "PATCH",
      headers: adminAuthHeaders(),
      body: JSON.stringify({ status: "investigating" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 409 when a concurrent update wins the race", async () => {
    const before = makeRow({ status: "open" });
    // Mock the conflict: SELECT returns row, but the conditional UPDATE returns no rows.
    const { app } = createAdminTestApp([ADMIN_ROLE_RESULT, [before], []]);

    const res = await app.request(`/api/admin/errors/${before.id}`, {
      method: "PATCH",
      headers: adminAuthHeaders(),
      body: JSON.stringify({ status: "investigating" }),
    });

    expect(res.status).toBe(409);
  });

  it("returns 401 without auth", async () => {
    const { app } = createAdminTestApp([]);
    const res = await app.request(`/api/admin/errors/${VALID_UUID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "investigating" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 403 when user is not admin", async () => {
    const { app } = createAdminTestApp([USER_ROLE_RESULT]);
    const res = await app.request(`/api/admin/errors/${VALID_UUID}`, {
      method: "PATCH",
      headers: adminAuthHeaders(),
      body: JSON.stringify({ status: "investigating" }),
    });
    expect(res.status).toBe(403);
  });
});

// ── GET /api/admin/errors/stream ────────────────────────────────────────────

/**
 * SSE のレスポンスは ReadableStream で延々と続くため、テストでは最初のチャンクを
 * 1〜2 個読んだら必ず cancel して接続を閉じる。閉じないと vitest がハングする。
 *
 * SSE responses keep streaming, so each test reads at most a couple of chunks
 * and then cancels the body. Forgetting to cancel hangs the test runner.
 */
async function readUntil(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  predicate: (text: string) => boolean,
  timeoutMs = 1_000,
): Promise<string> {
  const decoder = new TextDecoder();
  let acc = "";
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) acc += decoder.decode(value, { stream: true });
    if (predicate(acc)) return acc;
  }
  return acc;
}

describe("GET /api/admin/errors/stream", () => {
  afterEach(() => {
    // テスト間で broadcaster の購読者が残らないようにクリアする。
    // Reset broadcaster state between tests so a leaked subscriber doesn't
    // cross-contaminate later cases.
    clearApiErrorSubscribers();
  });

  it("returns 200 with text/event-stream and the initial ready event", async () => {
    const { app } = createAdminTestApp([ADMIN_ROLE_RESULT]);

    const res = await app.request("/api/admin/errors/stream", {
      headers: adminAuthHeaders(),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/event-stream/i);
    const body = res.body;
    if (!body) throw new Error("expected SSE body");
    const reader = body.getReader();
    const text = await readUntil(reader, (t) => t.includes("event: ready"));
    expect(text).toContain("event: ready");
    expect(text).toContain("retry: 30000");
    await reader.cancel();
  });

  it("forwards published rows as `update` events to subscribers", async () => {
    const { app } = createAdminTestApp([ADMIN_ROLE_RESULT]);

    const res = await app.request("/api/admin/errors/stream", {
      headers: adminAuthHeaders(),
    });
    expect(res.status).toBe(200);
    const body = res.body;
    if (!body) throw new Error("expected SSE body");
    const reader = body.getReader();
    // Wait for the initial ready event so the subscriber is registered before
    // we publish.
    await readUntil(reader, (t) => t.includes("event: ready"));

    const row = makeRow({ id: "00000000-0000-0000-0000-0000000000aa" });
    publishApiErrorUpdate(row);

    const text = await readUntil(reader, (t) => t.includes("event: update"));
    expect(text).toContain("event: update");
    expect(text).toContain('"id":"00000000-0000-0000-0000-0000000000aa"');
    await reader.cancel();
  });

  it("returns 401 without auth", async () => {
    const { app } = createAdminTestApp([]);
    const res = await app.request("/api/admin/errors/stream", {
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(401);
  });

  it("returns 403 when user is not admin", async () => {
    const { app } = createAdminTestApp([USER_ROLE_RESULT]);
    const res = await app.request("/api/admin/errors/stream", { headers: adminAuthHeaders() });
    expect(res.status).toBe(403);
  });
});
