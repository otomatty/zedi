/**
 * GET /api/search のスコープ分離テスト (Issue #718 Phase 5-1)。
 * Tests for scope separation on GET /api/search (Issue #718 Phase 5-1).
 *
 * Phase 1〜4 で `pages.note_id` による個人 / ノートネイティブページのスコープ分離が
 * 導入されたため、`scope=own` でも SQL レベルで `p.note_id IS NULL` を強制し、
 * ノートネイティブページがリークしないことを検証する。
 *
 * Ensures `scope=own` restricts results to personal pages (note_id IS NULL) at
 * the SQL layer so note-native pages cannot leak into personal search results,
 * while `scope=shared` keeps its existing cross-scope behavior.
 */
import { describe, it, expect, vi } from "vitest";
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

import { Hono } from "hono";
import searchRoutes from "../../routes/search.js";
import { createMockDb } from "../createMockDb.js";

const TEST_USER_ID = "user-search-test-001";

function authHeaders() {
  return {
    "x-test-user-id": TEST_USER_ID,
    "Content-Type": "application/json",
  };
}

function createSearchApp(dbResults: unknown[]) {
  const { db, chains } = createMockDb(dbResults);
  const app = new Hono<AppEnv>();
  app.use("*", async (c, next) => {
    c.set("db", db as unknown as AppEnv["Variables"]["db"]);
    await next();
  });
  app.route("/api/search", searchRoutes);
  return { app, chains };
}

describe("GET /api/search", () => {
  it("returns 401 without auth header", async () => {
    const { app } = createSearchApp([{ rows: [] }]);

    const res = await app.request("/api/search?q=hello", { method: "GET" });

    expect(res.status).toBe(401);
  });

  it("returns empty results when q is missing (no DB call)", async () => {
    const { app, chains } = createSearchApp([]);

    const res = await app.request("/api/search", {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { results: unknown[] };
    expect(body.results).toEqual([]);
    expect(chains).toHaveLength(0);
  });

  it("scope=own restricts SQL to personal pages (note_id IS NULL) to prevent note-native leakage", async () => {
    // Phase 5-1 防御的修正: 個人検索結果にノートネイティブページが混ざってはならない。
    // Phase 5-1 defensive fix: personal search results must never include note-native pages.
    const { app, chains } = createSearchApp([{ rows: [] }]);

    const res = await app.request("/api/search?q=hello&scope=own", {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const executeChain = chains.find((chain) => chain.startMethod === "execute");
    expect(executeChain).toBeDefined();
    const serialised = JSON.stringify(executeChain?.startArgs);
    expect(serialised).toContain("p.note_id IS NULL");
    expect(serialised).toContain("p.owner_id");
  });

  it("defaults to scope=own when scope query parameter is omitted", async () => {
    // scope 未指定時の既定は個人スコープ。省略時にノートネイティブがリークしないよう同じガードを要求する。
    // Omitted scope defaults to personal, so the same guard must apply.
    const { app, chains } = createSearchApp([{ rows: [] }]);

    const res = await app.request("/api/search?q=hello", {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const executeChain = chains.find((chain) => chain.startMethod === "execute");
    expect(executeChain).toBeDefined();
    const serialised = JSON.stringify(executeChain?.startArgs);
    expect(serialised).toContain("p.note_id IS NULL");
  });

  it("scope=shared does NOT force p.note_id IS NULL (keeps cross-scope behavior)", async () => {
    // shared は個人 + 参加ノートの混在検索を維持する。
    // `shared` retains existing cross-scope behavior and must not restrict to personal pages.
    const { app, chains } = createSearchApp([{ rows: [] }]);

    const res = await app.request("/api/search?q=hello&scope=shared", {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const executeChain = chains.find((chain) => chain.startMethod === "execute");
    expect(executeChain).toBeDefined();
    const serialised = JSON.stringify(executeChain?.startArgs);
    expect(serialised).not.toContain("p.note_id IS NULL");
  });

  it("response rows include note_id so callers can distinguish personal vs note-native", async () => {
    // 呼び出し側 (フロント / MCP) がスコープ判定できるよう、レスポンスには必ず note_id を含める。
    // Callers (frontend / MCP) must be able to tell personal vs note-native, so include note_id.
    const { app, chains } = createSearchApp([
      {
        rows: [
          {
            id: "page-personal",
            title: "Personal",
            content_preview: null,
            updated_at: new Date("2026-04-01T00:00:00Z").toISOString(),
            note_id: null,
          },
        ],
      },
    ]);

    const res = await app.request("/api/search?q=hello&scope=shared", {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { results: Array<Record<string, unknown>> };
    expect(body.results).toHaveLength(1);
    expect(body.results[0]).toHaveProperty("note_id");

    // SELECT 句に p.note_id が含まれていることも検証する (両スコープ)。
    // Verify SELECT list includes p.note_id regardless of scope.
    const executeChain = chains.find((chain) => chain.startMethod === "execute");
    const serialised = JSON.stringify(executeChain?.startArgs);
    expect(serialised).toContain("p.note_id");
  });

  it("scope=own SELECT list exposes p.note_id and response surfaces note_id: null", async () => {
    // SQL の SELECT に note_id が含まれること、かつ JSON ペイロード上も
    // note_id (個人ページなので null) が露出することを併せて契約する。
    // Pin both the SQL projection and the JSON payload contract: scope=own
    // surfaces note_id (null for personal pages) on each result row.
    const { app, chains } = createSearchApp([
      {
        rows: [
          {
            id: "page-own",
            title: "Own page",
            content_preview: null,
            updated_at: new Date("2026-04-01T00:00:00Z").toISOString(),
            note_id: null,
          },
        ],
      },
    ]);

    const res = await app.request("/api/search?q=hello&scope=own", {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { results: Array<Record<string, unknown>> };
    expect(body.results).toHaveLength(1);
    expect(body.results[0]).toHaveProperty("note_id", null);

    const executeChain = chains.find((chain) => chain.startMethod === "execute");
    const serialised = JSON.stringify(executeChain?.startArgs);
    expect(serialised).toContain("p.note_id");
  });
});
