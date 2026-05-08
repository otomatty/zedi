/**
 * GET /api/search のスコープ分離テスト (Issue #718 Phase 5-1)。
 * Tests for scope separation on GET /api/search (Issue #718 Phase 5-1).
 *
 * Issue #823: `scope=own` は呼び出し元のデフォルトノート配下に限定し、`scope=shared`
 * は共有ノート（オーナー / メンバー / ドメインルール）へ所属するページを横断する。
 * `note_pages` テーブルは廃止されている。
 *
 * Issue #823: `scope=own` restricts to the caller's default note; `scope=shared` spans
 * pages in notes reachable via owner / member / domain access. The `note_pages` table
 * is gone.
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

  it("scope=own uses default-note subquery on p.note_id (issue #823)", async () => {
    const { app, chains } = createSearchApp([{ rows: [] }]);

    const res = await app.request("/api/search?q=hello&scope=own", {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const executeChain = chains.find((chain) => chain.startMethod === "execute");
    expect(executeChain).toBeDefined();
    const serialised = JSON.stringify(executeChain?.startArgs);
    expect(serialised).toContain("is_default");
    expect(serialised).toContain("p.note_id");
    expect(serialised).toContain(TEST_USER_ID);
  });

  it("defaults to scope=own when scope query parameter is omitted", async () => {
    const { app, chains } = createSearchApp([{ rows: [] }]);

    const res = await app.request("/api/search?q=hello", {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const executeChain = chains.find((chain) => chain.startMethod === "execute");
    expect(executeChain).toBeDefined();
    const serialised = JSON.stringify(executeChain?.startArgs);
    expect(serialised).toContain("is_default");
    expect(serialised).toContain("p.note_id");
  });

  it("scope=shared uses note ownership / member / domain EXISTS branches without note_pages", async () => {
    const { app, chains } = createSearchApp([{ rows: [] }]);

    const res = await app.request("/api/search?q=hello&scope=shared", {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const executeChain = chains.find((chain) => chain.startMethod === "execute");
    expect(executeChain).toBeDefined();
    const serialised = JSON.stringify(executeChain?.startArgs);
    expect(serialised).not.toContain("note_pages");
    expect(serialised).toContain("note_members");
    expect(serialised).toContain("OR EXISTS");
  });

  it("falls back to the default limit when the limit query is non-numeric", async () => {
    const { app } = createSearchApp([{ rows: [] }]);

    const res = await app.request("/api/search?q=hello&scope=shared&limit=abc", {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
  });

  it("scope=shared keeps note-scoped EXISTS predicates (no note_pages join)", async () => {
    const { app, chains } = createSearchApp([{ rows: [] }]);

    const res = await app.request("/api/search?q=hello&scope=shared", {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const executeChain = chains.find((chain) => chain.startMethod === "execute");
    expect(executeChain).toBeDefined();
    const serialised = JSON.stringify(executeChain?.startArgs);
    expect(serialised).toContain(TEST_USER_ID);
    expect(serialised).not.toContain("note_pages");
    expect(serialised).toContain("p.note_id");
  });

  it("response rows include note_id so callers can distinguish pages by owning note", async () => {
    const defaultNotePageId = "11111111-1111-1111-1111-111111111111";
    const { app, chains } = createSearchApp([
      {
        rows: [
          {
            id: defaultNotePageId,
            title: "In default note",
            content_preview: null,
            updated_at: new Date("2026-04-01T00:00:00Z").toISOString(),
            note_id: defaultNotePageId,
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

    const executeChain = chains.find((chain) => chain.startMethod === "execute");
    const serialised = JSON.stringify(executeChain?.startArgs);
    expect(serialised).toContain("p.note_id");
  });

  it("scope=own SELECT list exposes p.note_id (default-note constraint)", async () => {
    const defaultNotePageId = "22222222-2222-2222-2222-222222222222";
    const { app, chains } = createSearchApp([
      {
        rows: [
          {
            id: defaultNotePageId,
            title: "Own scope page",
            content_preview: null,
            updated_at: new Date("2026-04-01T00:00:00Z").toISOString(),
            note_id: defaultNotePageId,
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
    expect(body.results[0]).toHaveProperty("note_id", defaultNotePageId);

    const executeChain = chains.find((chain) => chain.startMethod === "execute");
    const serialised = JSON.stringify(executeChain?.startArgs);
    expect(serialised).toContain("p.note_id");
    expect(serialised).toContain("is_default");
  });
});
