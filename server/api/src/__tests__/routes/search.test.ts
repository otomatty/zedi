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
 * Issue #864: ハイライト検索 (`pdf_highlights`) も同エンドポイントから返す。
 * 所有検証 (`owner_id = userId`) と `kind="pdf_local"` の二重防御を確認する。
 *
 * Issue #864: this endpoint now also surfaces `pdf_highlights` rows. The tests
 * below assert the owner filter and the `kind="pdf_local"` defense-in-depth
 * check, and that the discriminator (`kind`) is set on every row.
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

/**
 * デフォルトのモック DB 結果。1 番目がページ検索、2 番目が pdf_highlights 検索。
 * いずれも空配列を返すデフォルト。
 *
 * Default mock results — first call answers the page query, second answers the
 * pdf_highlights query. Both default to empty rows.
 */
function emptyDbResults() {
  return [{ rows: [] }, { rows: [] }];
}

describe("GET /api/search", () => {
  beforeEach(() => {
    // テスト間で env がリークしないようキルスイッチを毎回クリア。
    // Reset the kill switch between tests so env state does not leak.
    delete process.env.PDF_HIGHLIGHT_SEARCH_DISABLED;
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

  it("scope=own runs highlight search even when default note is missing", async () => {
    vi.mocked(getDefaultNoteOrNull).mockResolvedValueOnce(null);
    // ページ検索は走らない（default note 無し）が、ハイライト検索は走る。
    // The page query is skipped (no default note), but the highlight query still runs.
    const { app, chains } = createSearchApp([{ rows: [] }]);

    const res = await app.request("/api/search?q=hello&scope=own", {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { results: unknown[] };
    expect(body.results).toEqual([]);
    const executeChains = chains.filter((chain) => chain.startMethod === "execute");
    expect(executeChains).toHaveLength(1);
    const serialised = JSON.stringify(executeChains[0]?.startArgs);
    expect(serialised).toContain("pdf_highlights");
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

  // ── Issue #864: PDF ハイライト統合 ─────────────────────────────────────────
  // PDF highlight integration tests (Issue #864).

  it("scope=own includes pdf_highlights rows filtered by owner_id (no leak of other users')", async () => {
    const { app, chains } = createSearchApp([
      { rows: [] }, // ページ検索 / page query
      {
        rows: [
          {
            highlight_id: "h-1",
            source_id: "s-1",
            owner_id: TEST_USER_ID,
            pdf_page: 5,
            text: "highlighted passage about hello",
            derived_page_id: null,
            updated_at: new Date("2026-05-01T00:00:00Z").toISOString(),
            source_display_name: "paper.pdf",
            source_title: null,
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
    expect(body.results[0]).toMatchObject({
      kind: "pdf_highlight",
      highlight_id: "h-1",
      source_id: "s-1",
      pdf_page: 5,
      derived_page_id: null,
      source_display_name: "paper.pdf",
    });

    // 所有検証 (owner_id = userId) と `kind="pdf_local"` の両方が SQL に存在する。
    // Both the owner filter and the `kind="pdf_local"` defensive filter live in the SQL.
    const executeChains = chains.filter((chain) => chain.startMethod === "execute");
    expect(executeChains.length).toBe(2);
    const highlightChain = executeChains[1];
    const serialised = JSON.stringify(highlightChain?.startArgs);
    expect(serialised).toContain("h.owner_id");
    expect(serialised).toContain(TEST_USER_ID);
    expect(serialised).toContain("pdf_local");
  });

  it("scope=shared still scopes pdf_highlights to the caller's own rows only", async () => {
    const { app, chains } = createSearchApp([
      { rows: [] },
      {
        rows: [
          {
            highlight_id: "h-2",
            source_id: "s-2",
            owner_id: TEST_USER_ID,
            pdf_page: 1,
            text: "shared lookup result text",
            derived_page_id: "p-derived-1",
            updated_at: new Date("2026-05-02T00:00:00Z").toISOString(),
            source_display_name: "notes.pdf",
            source_title: "Notes",
          },
        ],
      },
    ]);

    const res = await app.request("/api/search?q=shared&scope=shared", {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { results: Array<Record<string, unknown>> };
    expect(body.results).toHaveLength(1);
    expect(body.results[0]).toMatchObject({
      kind: "pdf_highlight",
      highlight_id: "h-2",
      derived_page_id: "p-derived-1",
    });

    const executeChains = chains.filter((chain) => chain.startMethod === "execute");
    expect(executeChains).toHaveLength(2);
    const highlightChain = executeChains[1];
    const serialised = JSON.stringify(highlightChain?.startArgs);
    // 他ユーザーのハイライトを掴まないよう owner_id 比較が必ず入る。
    // The owner filter is always present regardless of scope.
    expect(serialised).toContain("h.owner_id");
    expect(serialised).toContain(TEST_USER_ID);
  });

  it("pdf_highlight branch JOINs sources and restricts to kind='pdf_local'", async () => {
    const { app, chains } = createSearchApp(emptyDbResults());

    const res = await app.request("/api/search?q=hello&scope=own", {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const executeChains = chains.filter((chain) => chain.startMethod === "execute");
    expect(executeChains).toHaveLength(2);
    const highlightChain = executeChains[1];
    const serialised = JSON.stringify(highlightChain?.startArgs);
    expect(serialised).toContain("pdf_highlights");
    expect(serialised).toContain("INNER JOIN sources");
    expect(serialised).toContain("pdf_local");
  });

  it("PDF_HIGHLIGHT_SEARCH_DISABLED=1 skips the highlight query entirely", async () => {
    process.env.PDF_HIGHLIGHT_SEARCH_DISABLED = "1";
    const { app, chains } = createSearchApp([{ rows: [] }]);

    const res = await app.request("/api/search?q=hello&scope=own", {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { results: unknown[] };
    expect(body.results).toEqual([]);
    const executeChains = chains.filter((chain) => chain.startMethod === "execute");
    // ページ検索のみ実行され、ハイライト検索は走らない。
    // Only the page query runs; the highlight query is short-circuited.
    expect(executeChains).toHaveLength(1);
    const serialised = JSON.stringify(executeChains[0]?.startArgs);
    expect(serialised).not.toContain("pdf_highlights");
  });

  it("merges page rows (kind='page') and highlight rows (kind='pdf_highlight') in one response", async () => {
    const pageId = "33333333-3333-3333-3333-333333333333";
    const { app } = createSearchApp([
      {
        rows: [
          {
            id: pageId,
            title: "Page with hello",
            content_preview: "hello there",
            updated_at: new Date("2026-04-01T00:00:00Z").toISOString(),
            note_id: "default-note-search-mock",
          },
        ],
      },
      {
        rows: [
          {
            highlight_id: "h-3",
            source_id: "s-3",
            owner_id: TEST_USER_ID,
            pdf_page: 7,
            text: "hello in PDF",
            derived_page_id: null,
            updated_at: new Date("2026-04-02T00:00:00Z").toISOString(),
            source_display_name: "doc.pdf",
            source_title: null,
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
    expect(body.results).toHaveLength(2);
    expect(body.results[0]).toMatchObject({ kind: "page", id: pageId });
    expect(body.results[1]).toMatchObject({ kind: "pdf_highlight", highlight_id: "h-3" });
  });
});
