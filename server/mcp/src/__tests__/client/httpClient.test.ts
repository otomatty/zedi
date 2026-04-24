/**
 * HttpZediClient のユニットテスト
 *
 * - URL / method / body / Authorization ヘッダの検証
 * - 4xx / 5xx → ZediApiError 変換
 * - ネットワークエラー → ZediApiError(status=0)
 *
 * Tests for HttpZediClient: request shaping, error normalization.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";
import { HttpZediClient } from "../../client/httpClient.js";
import { ZediApiError } from "../../client/errors.js";

const BASE = "https://api.zedi.test";
const TOKEN = "test-jwt";

/**
 * テスト用ヘルパ: モック関数の n 番目の呼び出し引数を返す。未呼び出しなら例外。
 * Test helper: returns the n-th call's arguments or throws if not called.
 */
function callArgs(mock: Mock, index = 0): unknown[] {
  const call = mock.mock.calls[index];
  if (!call) throw new Error(`mock not called at index ${index}`);
  return call as unknown[];
}

function makeJsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function makeTextResponse(status: number, text: string): Response {
  return new Response(text, { status, headers: { "Content-Type": "text/plain" } });
}

describe("HttpZediClient request shaping", () => {
  let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;
  let client: HttpZediClient;

  beforeEach(() => {
    fetchMock = vi.fn<typeof fetch>();
    client = new HttpZediClient({ baseUrl: BASE, token: TOKEN, fetch: fetchMock });
  });

  it("getCurrentUser sends GET to /api/users/me with Bearer token", async () => {
    fetchMock.mockResolvedValueOnce(
      makeJsonResponse(200, { id: "u1", email: "a@b.c", name: "Alice", image: null }),
    );
    const user = await client.getCurrentUser();
    expect(user.id).toBe("u1");
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = callArgs(fetchMock as unknown as Mock);
    expect(url).toBe(`${BASE}/api/users/me`);
    expect((init as RequestInit).method).toBe("GET");
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get("Authorization")).toBe(`Bearer ${TOKEN}`);
  });

  it("listPages GETs /api/pages with limit/offset/scope and unwraps pages array", async () => {
    fetchMock.mockResolvedValueOnce(
      makeJsonResponse(200, {
        pages: [
          {
            id: "p1",
            title: "Hello",
            content_preview: null,
            updated_at: "2026-01-01T00:00:00Z",
            note_id: null,
          },
        ],
      }),
    );
    const list = await client.listPages({ limit: 10, offset: 5, scope: "shared" });
    expect(list).toHaveLength(1);
    expect(list[0]?.id).toBe("p1");
    const url = callArgs(fetchMock as unknown as Mock)[0] as string;
    expect(url).toContain(`${BASE}/api/pages?`);
    expect(url).toContain("limit=10");
    expect(url).toContain("offset=5");
    expect(url).toContain("scope=shared");
  });

  it("listPages defaults to own scope and limit=20/offset=0", async () => {
    fetchMock.mockResolvedValueOnce(makeJsonResponse(200, { pages: [] }));
    await client.listPages();
    const url = callArgs(fetchMock as unknown as Mock)[0] as string;
    expect(url).toContain("limit=20");
    expect(url).toContain("offset=0");
    expect(url).toContain("scope=own");
  });

  it("createPage sends POST with JSON body to /api/pages", async () => {
    const expected = {
      id: "p1",
      owner_id: "u1",
      title: "Hello",
      content_preview: null,
      thumbnail_url: null,
      source_url: null,
      source_page_id: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      is_deleted: false,
    };
    fetchMock.mockResolvedValueOnce(makeJsonResponse(201, expected));
    const result = await client.createPage({ title: "Hello" });
    expect(result.id).toBe("p1");
    const [url, init] = callArgs(fetchMock as unknown as Mock);
    expect(url).toBe(`${BASE}/api/pages`);
    expect((init as RequestInit).method).toBe("POST");
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get("Content-Type")).toBe("application/json");
    expect((init as RequestInit).body).toBe(JSON.stringify({ title: "Hello" }));
  });

  it("updatePageContent sends PUT to /api/pages/:id/content", async () => {
    fetchMock.mockResolvedValueOnce(makeJsonResponse(200, { version: 7 }));
    const result = await client.updatePageContent("p1", {
      ydoc_state: "BASE64STATE",
      expected_version: 6,
      content_text: "hi",
    });
    expect(result.version).toBe(7);
    const [url, init] = callArgs(fetchMock as unknown as Mock);
    expect(url).toBe(`${BASE}/api/pages/p1/content`);
    expect((init as RequestInit).method).toBe("PUT");
  });

  it("deletePage sends DELETE to /api/pages/:id", async () => {
    fetchMock.mockResolvedValueOnce(makeJsonResponse(200, { id: "p1", deleted: true }));
    const result = await client.deletePage("p1");
    expect(result.deleted).toBe(true);
    const [url, init] = callArgs(fetchMock as unknown as Mock);
    expect(url).toBe(`${BASE}/api/pages/p1`);
    expect((init as RequestInit).method).toBe("DELETE");
  });

  it("listNotes sends GET to /api/notes", async () => {
    fetchMock.mockResolvedValueOnce(makeJsonResponse(200, []));
    const list = await client.listNotes();
    expect(Array.isArray(list)).toBe(true);
    expect(callArgs(fetchMock as unknown as Mock)[0]).toBe(`${BASE}/api/notes`);
  });

  it("createNote POSTs to /api/notes", async () => {
    fetchMock.mockResolvedValueOnce(
      makeJsonResponse(201, {
        id: "n1",
        owner_id: "u1",
        title: "T",
        visibility: "private",
        edit_permission: "owner_only",
        is_official: false,
        view_count: 0,
        created_at: "x",
        updated_at: "y",
      }),
    );
    const n = await client.createNote({ title: "T" });
    expect(n.id).toBe("n1");
    expect(callArgs(fetchMock as unknown as Mock)[0]).toBe(`${BASE}/api/notes`);
    expect((callArgs(fetchMock as unknown as Mock)[1] as RequestInit).method).toBe("POST");
  });

  it("updateNote PUTs to /api/notes/:id", async () => {
    fetchMock.mockResolvedValueOnce(
      makeJsonResponse(200, {
        id: "n1",
        owner_id: "u1",
        title: "T2",
        visibility: "private",
        edit_permission: "owner_only",
        is_official: false,
        view_count: 0,
        created_at: "x",
        updated_at: "y",
      }),
    );
    await client.updateNote("n1", { title: "T2" });
    const [url, init] = callArgs(fetchMock as unknown as Mock);
    expect(url).toBe(`${BASE}/api/notes/n1`);
    expect((init as RequestInit).method).toBe("PUT");
  });

  it("deleteNote DELETEs /api/notes/:id", async () => {
    fetchMock.mockResolvedValueOnce(makeJsonResponse(200, { deleted: true }));
    await client.deleteNote("n1");
    const [url, init] = callArgs(fetchMock as unknown as Mock);
    expect(url).toBe(`${BASE}/api/notes/n1`);
    expect((init as RequestInit).method).toBe("DELETE");
  });

  it("addPageToNote POSTs to /api/notes/:noteId/pages", async () => {
    fetchMock.mockResolvedValueOnce(makeJsonResponse(200, { ok: true }));
    await client.addPageToNote("n1", { page_id: "p1" });
    expect(callArgs(fetchMock as unknown as Mock)[0]).toBe(`${BASE}/api/notes/n1/pages`);
  });

  it("removePageFromNote DELETEs /api/notes/:noteId/pages/:pageId", async () => {
    fetchMock.mockResolvedValueOnce(makeJsonResponse(200, { ok: true }));
    await client.removePageFromNote("n1", "p1");
    expect(callArgs(fetchMock as unknown as Mock)[0]).toBe(`${BASE}/api/notes/n1/pages/p1`);
    expect((callArgs(fetchMock as unknown as Mock)[1] as RequestInit).method).toBe("DELETE");
  });

  it("reorderNotePages PUTs to /api/notes/:noteId/pages", async () => {
    fetchMock.mockResolvedValueOnce(makeJsonResponse(200, { ok: true }));
    await client.reorderNotePages("n1", ["p1", "p2"]);
    expect(callArgs(fetchMock as unknown as Mock)[0]).toBe(`${BASE}/api/notes/n1/pages`);
    expect((callArgs(fetchMock as unknown as Mock)[1] as RequestInit).method).toBe("PUT");
  });

  it("listNoteMembers GETs /api/notes/:noteId/members", async () => {
    fetchMock.mockResolvedValueOnce(makeJsonResponse(200, []));
    await client.listNoteMembers("n1");
    expect(callArgs(fetchMock as unknown as Mock)[0]).toBe(`${BASE}/api/notes/n1/members`);
  });

  it("addNoteMember POSTs /api/notes/:noteId/members", async () => {
    fetchMock.mockResolvedValueOnce(makeJsonResponse(200, { ok: true }));
    await client.addNoteMember("n1", { email: "x@y.z", role: "viewer" });
    expect(callArgs(fetchMock as unknown as Mock)[0]).toBe(`${BASE}/api/notes/n1/members`);
    expect((callArgs(fetchMock as unknown as Mock)[1] as RequestInit).method).toBe("POST");
  });

  it("updateNoteMember PUTs /api/notes/:noteId/members/:email", async () => {
    fetchMock.mockResolvedValueOnce(makeJsonResponse(200, { ok: true }));
    await client.updateNoteMember("n1", "x@y.z", "editor");
    expect(callArgs(fetchMock as unknown as Mock)[0]).toBe(
      `${BASE}/api/notes/n1/members/${encodeURIComponent("x@y.z")}`,
    );
    expect((callArgs(fetchMock as unknown as Mock)[1] as RequestInit).method).toBe("PUT");
  });

  it("removeNoteMember DELETEs /api/notes/:noteId/members/:email", async () => {
    fetchMock.mockResolvedValueOnce(makeJsonResponse(200, { ok: true }));
    await client.removeNoteMember("n1", "x@y.z");
    expect(callArgs(fetchMock as unknown as Mock)[0]).toBe(
      `${BASE}/api/notes/n1/members/${encodeURIComponent("x@y.z")}`,
    );
    expect((callArgs(fetchMock as unknown as Mock)[1] as RequestInit).method).toBe("DELETE");
  });

  it("search GETs /api/search with q, scope, limit", async () => {
    fetchMock.mockResolvedValueOnce(makeJsonResponse(200, { results: [] }));
    await client.search({ query: "hello world", scope: "shared", limit: 50 });
    const url = callArgs(fetchMock as unknown as Mock)[0] as string;
    expect(url).toContain(`${BASE}/api/search?`);
    expect(url).toContain("q=hello+world");
    expect(url).toContain("scope=shared");
    expect(url).toContain("limit=50");
  });

  it("search GETs /api/notes/:noteId/search when noteId is provided (scope is ignored)", async () => {
    // noteId 指定時は note-scoped エンドポイントに切り替え、`scope` は無視される。
    // When noteId is set, we hit /api/notes/:noteId/search and ignore `scope`.
    fetchMock.mockResolvedValueOnce(makeJsonResponse(200, { results: [] }));
    await client.search({
      query: "hello",
      noteId: "note 1",
      scope: "shared",
      limit: 25,
    });
    const url = callArgs(fetchMock as unknown as Mock)[0] as string;
    expect(url).toContain(`${BASE}/api/notes/${encodeURIComponent("note 1")}/search?`);
    expect(url).toContain("q=hello");
    expect(url).toContain("limit=25");
    expect(url).not.toContain("scope=");
  });

  it("search unwraps the results array and preserves note_id", async () => {
    fetchMock.mockResolvedValueOnce(
      makeJsonResponse(200, {
        results: [
          {
            id: "p1",
            title: "match",
            content_preview: null,
            updated_at: "2026-01-01T00:00:00Z",
            note_id: "n1",
          },
        ],
      }),
    );
    const rows = await client.search({ query: "m", noteId: "n1" });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.note_id).toBe("n1");
  });

  it("clipUrl POSTs /api/mcp/clip with the URL", async () => {
    fetchMock.mockResolvedValueOnce(makeJsonResponse(200, { page_id: "p9", title: "X" }));
    const r = await client.clipUrl("https://example.com/a");
    expect(r.page_id).toBe("p9");
    expect(callArgs(fetchMock as unknown as Mock)[0]).toBe(`${BASE}/api/mcp/clip`);
    expect((callArgs(fetchMock as unknown as Mock)[1] as RequestInit).body).toBe(
      JSON.stringify({ url: "https://example.com/a" }),
    );
  });
});

describe("HttpZediClient error normalization", () => {
  let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;
  let client: HttpZediClient;

  beforeEach(() => {
    fetchMock = vi.fn<typeof fetch>();
    client = new HttpZediClient({ baseUrl: BASE, token: TOKEN, fetch: fetchMock });
  });

  it("throws ZediApiError with JSON message for 4xx", async () => {
    fetchMock.mockResolvedValueOnce(makeJsonResponse(404, { message: "Page not found" }));
    await expect(client.getPageContent("missing")).rejects.toMatchObject({
      name: "ZediApiError",
      status: 404,
      message: "Page not found",
    });
  });

  it("throws ZediApiError with text body for non-JSON 5xx", async () => {
    fetchMock.mockResolvedValueOnce(makeTextResponse(500, "boom"));
    await expect(client.getCurrentUser()).rejects.toMatchObject({
      name: "ZediApiError",
      status: 500,
    });
  });

  it("tags 429 responses with isRateLimit and extracts Retry-After header", async () => {
    // 429 はミドルウェア由来。Retry-After ヘッダを秒数として拾い isRateLimit を立てる。
    // 429 comes from the rateLimit middleware; we pick up the header as seconds.
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "RATE_LIMIT_EXCEEDED", retry_after: 42 }), {
        status: 429,
        headers: { "Content-Type": "application/json", "Retry-After": "42" },
      }),
    );
    let error: unknown;
    try {
      await client.clipUrl("https://example.com/a");
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(ZediApiError);
    const apiError = error as ZediApiError;
    expect(apiError.status).toBe(429);
    expect(apiError.isRateLimit).toBe(true);
    expect(apiError.retryAfterSec).toBe(42);
  });

  it("falls back to body.retry_after when Retry-After header is absent", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "RATE_LIMIT_EXCEEDED", retry_after: 7 }), {
        status: 429,
        headers: { "Content-Type": "application/json" },
      }),
    );
    let error: unknown;
    try {
      await client.clipUrl("https://example.com/a");
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(ZediApiError);
    expect((error as ZediApiError).isRateLimit).toBe(true);
    expect((error as ZediApiError).retryAfterSec).toBe(7);
  });

  it("throws ZediApiError(status=0) for fetch network failure", async () => {
    fetchMock.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    let error: unknown;
    try {
      await client.getCurrentUser();
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(ZediApiError);
    expect((error as ZediApiError).status).toBe(0);
    expect((error as ZediApiError).message).toMatch(/ECONNREFUSED|network/i);
  });

  it("normalizes baseUrl trailing slash", async () => {
    const localFetch = vi.fn<typeof fetch>();
    const c = new HttpZediClient({
      baseUrl: `${BASE}/`,
      token: TOKEN,
      fetch: localFetch,
    });
    localFetch.mockResolvedValueOnce(
      makeJsonResponse(200, { id: "u1", email: null, name: null, image: null }),
    );
    await c.getCurrentUser();
    expect(callArgs(localFetch as unknown as Mock)[0]).toBe(`${BASE}/api/users/me`);
  });

  it("normalizes baseUrl with multiple trailing slashes", async () => {
    // 連続する末尾スラッシュも正しく除去されること（ReDoS 回避のためループ実装）。
    // Multiple trailing slashes are stripped (manual loop, ReDoS-safe).
    const localFetch = vi.fn<typeof fetch>();
    const c = new HttpZediClient({
      baseUrl: `${BASE}/////`,
      token: TOKEN,
      fetch: localFetch,
    });
    localFetch.mockResolvedValueOnce(
      makeJsonResponse(200, { id: "u1", email: null, name: null, image: null }),
    );
    await c.getCurrentUser();
    expect(callArgs(localFetch as unknown as Mock)[0]).toBe(`${BASE}/api/users/me`);
  });
});
