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

  it("caps the merged result list at `limit` so page+highlight never exceed the hard bound (PR #873 review: codex)", async () => {
    // 各クエリが LIMIT を持つので、極端な場合 page+highlight = 2*limit になる。
    // 結合後に再度クリップしてレスポンス契約 `limit` をハード上限として維持する。
    //
    // Each query carries `LIMIT`, so naïve concat could return 2*limit rows.
    // The merge clip enforces `limit` as a hard cap on the API response.
    const pageRows = Array.from({ length: 20 }, (_, i) => ({
      id: `p-${i}`,
      title: `Page ${i}`,
      content_preview: null,
      updated_at: new Date(2026, 3, 1, 0, i).toISOString(),
      note_id: "default-note-search-mock",
    }));
    const highlightRows = Array.from({ length: 20 }, (_, i) => ({
      highlight_id: `h-${i}`,
      source_id: `s-${i}`,
      owner_id: TEST_USER_ID,
      pdf_page: i + 1,
      text: "hit",
      derived_page_id: null,
      updated_at: new Date(2026, 3, 2, 0, i).toISOString(),
      source_display_name: "doc.pdf",
      source_title: null,
    }));
    const { app } = createSearchApp([{ rows: pageRows }, { rows: highlightRows }]);

    const res = await app.request("/api/search?q=hit&scope=own&limit=20", {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { results: Array<Record<string, unknown>> };
    expect(body.results.length).toBeLessThanOrEqual(20);
  });

  it("reserves slots for pdf_highlights so pages never starve them out (PR #873 review: CodeRabbit)", async () => {
    // ページが limit を埋め切る場合でも、ハイライトに最低限の枠
    // (ceil(limit / 4) = 5 件) が確保される。
    //
    // Even when pages would fill `limit` on their own, the merge reserves
    // a minimum slot count (`ceil(limit / 4)` = 5) for highlights so the
    // feature stays visible (PR #873 review: CodeRabbit).
    const pageRows = Array.from({ length: 20 }, (_, i) => ({
      id: `p-${i}`,
      title: `Page ${i}`,
      content_preview: null,
      updated_at: new Date(2026, 3, 1, 0, i).toISOString(),
      note_id: "default-note-search-mock",
    }));
    const highlightRows = Array.from({ length: 20 }, (_, i) => ({
      highlight_id: `h-${i}`,
      source_id: `s-${i}`,
      owner_id: TEST_USER_ID,
      pdf_page: i + 1,
      text: "hit",
      derived_page_id: null,
      updated_at: new Date(2026, 3, 2, 0, i).toISOString(),
      source_display_name: "doc.pdf",
      source_title: null,
    }));
    const { app } = createSearchApp([{ rows: pageRows }, { rows: highlightRows }]);

    const res = await app.request("/api/search?q=hit&scope=own&limit=20", {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { results: Array<Record<string, unknown>> };
    const highlights = body.results.filter((r) => r.kind === "pdf_highlight");
    const pages = body.results.filter((r) => r.kind === "page");
    expect(highlights.length).toBe(5);
    expect(pages.length).toBe(15);
    expect(body.results.length).toBe(20);
  });

  it("spills the highlight reserve back to pages when there are no highlights", async () => {
    // ハイライトが 0 件のケースではページが limit までフルに載る。
    // When there are no highlights, pages get the full `limit` budget.
    const pageRows = Array.from({ length: 20 }, (_, i) => ({
      id: `p-${i}`,
      title: `Page ${i}`,
      content_preview: null,
      updated_at: new Date(2026, 3, 1, 0, i).toISOString(),
      note_id: "default-note-search-mock",
    }));
    const { app } = createSearchApp([{ rows: pageRows }, { rows: [] }]);

    const res = await app.request("/api/search?q=hit&scope=own&limit=20", {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { results: Array<Record<string, unknown>> };
    expect(body.results.length).toBe(20);
    expect(body.results.every((r) => r.kind === "page")).toBe(true);
  });

  it("fills the merge with highlights when there are no pages", async () => {
    // ページが 0 件のケースではハイライトが limit までフルに載る。
    // When there are no pages, highlights take the full `limit` budget.
    const highlightRows = Array.from({ length: 20 }, (_, i) => ({
      highlight_id: `h-${i}`,
      source_id: `s-${i}`,
      owner_id: TEST_USER_ID,
      pdf_page: i + 1,
      text: "hit",
      derived_page_id: null,
      updated_at: new Date(2026, 3, 2, 0, i).toISOString(),
      source_display_name: "doc.pdf",
      source_title: null,
    }));
    const { app } = createSearchApp([{ rows: [] }, { rows: highlightRows }]);

    const res = await app.request("/api/search?q=hit&scope=own&limit=20", {
      method: "GET",
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { results: Array<Record<string, unknown>> };
    expect(body.results.length).toBe(20);
    expect(body.results.every((r) => r.kind === "pdf_highlight")).toBe(true);
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
