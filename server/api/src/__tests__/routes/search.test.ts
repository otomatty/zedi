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
 *
 * PDF ハイライト検索はデスクトップ版の廃止とともに削除した（ページのみを返す）。
 * PDF highlight search was removed together with the desktop app (pages only).
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

vi.mock("../../services/defaultNoteService.js", () => ({
  getDefaultNoteOrNull: vi.fn(async () => ({
    id: "default-note-search-mock",
    ownerId: "user-search-test-001",
    title: "Mock default",
    visibility: "private" as const,
    editPermission: "owner_only" as const,
    isOfficial: false,
    isDefault: true,
    viewCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    isDeleted: false,
  })),
}));

import { Hono } from "hono";
import searchRoutes from "../../routes/search.js";
import { createMockDb } from "../createMockDb.js";
import { getDefaultNoteOrNull } from "../../services/defaultNoteService.js";

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

/** デフォルトのモック DB 結果（ページ検索は空）。 / Default mock result: no page hits. */
function emptyDbResults() {
  return [{ rows: [] }];
}

describe("GET /api/search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 without auth header", async () => {
    const { app } = createSearchApp(emptyDbResults());

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

  it("scope=own binds listing to default note id from getDefaultNoteOrNull (issue #823)", async () => {
    const { app, chains } = createSearchApp(emptyDbResults());

    const res = await app.request("/api/search?q=hello&scope=own", {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const executeChains = chains.filter((chain) => chain.startMethod === "execute");
    expect(executeChains.length).toBeGreaterThanOrEqual(1);
    const pagesChain = executeChains[0];
    const serialised = JSON.stringify(pagesChain?.startArgs);
    expect(serialised).toContain("default-note-search-mock");
    expect(serialised).toContain("p.note_id");
    expect(serialised).not.toContain("is_default");
    expect(serialised).not.toContain("SELECT n.id FROM notes n");
  });

  it("defaults to scope=own when scope query parameter is omitted", async () => {
    const { app, chains } = createSearchApp(emptyDbResults());

    const res = await app.request("/api/search?q=hello", {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const executeChains = chains.filter((chain) => chain.startMethod === "execute");
    const pagesChain = executeChains[0];
    const serialised = JSON.stringify(pagesChain?.startArgs);
    expect(serialised).toContain("default-note-search-mock");
    expect(serialised).toContain("p.note_id");
  });

  it("scope=own returns no results and runs no query when the default note is missing", async () => {
    vi.mocked(getDefaultNoteOrNull).mockResolvedValueOnce(null);
    const { app, chains } = createSearchApp([]);

    const res = await app.request("/api/search?q=hello&scope=own", {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ results: [] });
    expect(chains.filter((chain) => chain.startMethod === "execute")).toHaveLength(0);
  });

  it("returns only page rows and never queries pdf_highlights", async () => {
    const { app, chains } = createSearchApp([
      {
        rows: [
          {
            id: "33333333-3333-3333-3333-333333333333",
            title: "Page with hello",
            content_preview: "hello there",
            updated_at: new Date("2026-04-01T00:00:00Z").toISOString(),
            note_id: "default-note-search-mock",
          },
        ],
      },
    ]);

    const res = await app.request("/api/search?q=hello&scope=shared", {
      method: "GET",
      headers: authHeaders(),
    });

    const body = (await res.json()) as { results: Array<Record<string, unknown>> };
    expect(body.results.map((r) => r.kind)).toEqual(["page"]);
    expect(JSON.stringify(chains.map((chain) => chain.startArgs))).not.toContain("pdf_highlights");
  });

  it("scope=shared uses note ownership / member / domain EXISTS branches without note_pages", async () => {
    const { app, chains } = createSearchApp(emptyDbResults());

    const res = await app.request("/api/search?q=hello&scope=shared", {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const executeChains = chains.filter((chain) => chain.startMethod === "execute");
    const pagesChain = executeChains[0];
    const serialised = JSON.stringify(pagesChain?.startArgs);
    expect(serialised).not.toContain("note_pages");
    expect(serialised).toContain("note_members");
    expect(serialised).toContain("OR EXISTS");
  });

  it("falls back to the default limit when the limit query is non-numeric", async () => {
    const { app } = createSearchApp(emptyDbResults());

    const res = await app.request("/api/search?q=hello&scope=shared&limit=abc", {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
  });

  it("scope=shared keeps note-scoped EXISTS predicates (no note_pages join)", async () => {
    const { app, chains } = createSearchApp(emptyDbResults());

    const res = await app.request("/api/search?q=hello&scope=shared", {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const executeChains = chains.filter((chain) => chain.startMethod === "execute");
    const pagesChain = executeChains[0];
    const serialised = JSON.stringify(pagesChain?.startArgs);
    expect(serialised).toContain(TEST_USER_ID);
    expect(serialised).not.toContain("note_pages");
    expect(serialised).toContain("p.note_id");
  });

  it("response page rows are tagged with kind='page' and include note_id", async () => {
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
      { rows: [] },
    ]);

    const res = await app.request("/api/search?q=hello&scope=shared", {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { results: Array<Record<string, unknown>> };
    expect(body.results).toHaveLength(1);
    expect(body.results[0]).toHaveProperty("note_id");
    expect(body.results[0]).toHaveProperty("kind", "page");

    const executeChains = chains.filter((chain) => chain.startMethod === "execute");
    const pagesChain = executeChains[0];
    const serialised = JSON.stringify(pagesChain?.startArgs);
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
      { rows: [] },
    ]);

    const res = await app.request("/api/search?q=hello&scope=own", {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { results: Array<Record<string, unknown>> };
    expect(body.results).toHaveLength(1);
    expect(body.results[0]).toHaveProperty("note_id", defaultNotePageId);
    expect(body.results[0]).toHaveProperty("kind", "page");

    const executeChains = chains.filter((chain) => chain.startMethod === "execute");
    const pagesChain = executeChains[0];
    const serialised = JSON.stringify(pagesChain?.startArgs);
    expect(serialised).toContain("p.note_id");
    expect(serialised).toContain("default-note-search-mock");
    expect(serialised).not.toContain("is_default");
  });

  it("does not leak content_text into the API response (PR #873 review: CodeRabbit)", async () => {
    // SQL から `pc.content_text` を引っ張る場合でも、レスポンスには含めない。
    // Even when the SQL row carries `content_text`, it must not appear in the
    // outbound JSON.
    const pageId = "55555555-5555-5555-5555-555555555555";
    const { app } = createSearchApp([
      {
        rows: [
          {
            id: pageId,
            title: "Page",
            content_preview: "snippet",
            updated_at: new Date("2026-04-01T00:00:00Z").toISOString(),
            note_id: "default-note-search-mock",
            // 仮に過去の SELECT が content_text を含んでいた場合のシミュレーション。
            // Simulate a row that still carries full body text.
            content_text: "FULL PAGE BODY MUST NOT LEAK",
          },
        ],
      },
      { rows: [] },
    ]);

    const res = await app.request("/api/search?q=hello&scope=own", {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { results: Array<Record<string, unknown>> };
    expect(body.results).toHaveLength(1);
    expect(body.results[0]).not.toHaveProperty("content_text");
    expect(JSON.stringify(body)).not.toContain("FULL PAGE BODY");
  });

  it("page-query SELECT no longer pulls pc.content_text into the outbound payload", async () => {
    // WHERE には残るが、SELECT 列から content_text が消えている。
    // The WHERE clause still references `content_text`, but the SELECT list
    // doesn't carry it anymore (PR #873 review: CodeRabbit).
    const { app, chains } = createSearchApp(emptyDbResults());

    await app.request("/api/search?q=hello&scope=own", {
      method: "GET",
      headers: authHeaders(),
    });

    const executeChains = chains.filter((chain) => chain.startMethod === "execute");
    const pagesChain = executeChains[0];
    const serialised = JSON.stringify(pagesChain?.startArgs);
    // WHERE 句では content_text 比較が残っている必要がある (検索可能性は維持)。
    // The WHERE branch still uses `content_text` (search reach preserved).
    expect(serialised).toContain("pc.content_text ILIKE");
    // SELECT 句には `pc.content_text` リストアップが残らない。
    // The SELECT list no longer references `pc.content_text`.
    expect(serialised).not.toContain("pc.content_text,");
    expect(serialised).not.toMatch(/SELECT[\s\S]*pc\.content_text\b[\s\S]*FROM/);
  });
});
