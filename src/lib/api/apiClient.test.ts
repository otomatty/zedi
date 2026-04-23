import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock import.meta.env before importing the module
vi.stubEnv("VITE_API_BASE_URL", "https://api.test.example.com");

import { createApiClient, ApiError } from "./apiClient";

/** Builds a minimal `Response`-like object for stubbing `fetch`. */
function mockResponse(init: {
  ok: boolean;
  status: number;
  statusText?: string;
  body: string;
  headers?: Headers;
}): Pick<Response, "ok" | "status" | "statusText" | "text" | "headers"> {
  return {
    ok: init.ok,
    status: init.status,
    statusText: init.statusText ?? "",
    headers: init.headers ?? new Headers(),
    text: () => Promise.resolve(init.body),
  };
}

describe("apiClient", () => {
  const mockToken = "test-jwt-token";
  const getToken = vi.fn().mockResolvedValue(mockToken);

  beforeEach(() => {
    vi.restoreAllMocks();
    getToken.mockResolvedValue(mockToken);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // ── Authentication (cookie-based) ──────────────────────────────────

  describe("authentication", () => {
    it("uses credentials: include for cookie-based auth", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify({ results: [] })),
        headers: new Headers(),
      });
      vi.stubGlobal("fetch", mockFetch);

      const client = createApiClient({ baseUrl: "https://api.test.example.com" });
      await client.searchSharedNotes("test");

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(init.credentials).toBe("include");
    });

    it("throws ApiError when server returns 401", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          status: 401,
          statusText: "Unauthorized",
          text: () => Promise.resolve(JSON.stringify({ message: "Unauthorized" })),
          headers: new Headers(),
        }),
      );

      const client = createApiClient({ baseUrl: "https://api.test.example.com" });

      await expect(client.getSyncPages()).rejects.toThrow(ApiError);
      await expect(client.getSyncPages()).rejects.toMatchObject({ status: 401 });
    });
  });

  // ── Response unwrapping ─────────────────────────────────────────────

  describe("response unwrapping", () => {
    it("unwraps envelope response { ok: true, data: ... }", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          text: () =>
            Promise.resolve(
              JSON.stringify({
                ok: true,
                data: {
                  pages: [],
                  links: [],
                  ghost_links: [],
                  server_time: "2025-01-01T00:00:00Z",
                },
              }),
            ),
          headers: new Headers(),
        }),
      );

      const client = createApiClient({ getToken, baseUrl: "https://api.test.example.com" });
      const result = await client.getSyncPages();

      expect(result.pages).toEqual([]);
      expect(result.server_time).toBe("2025-01-01T00:00:00Z");
    });

    it("accepts raw (non-envelope) response for backward compatibility", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          text: () =>
            Promise.resolve(
              JSON.stringify({
                pages: [],
                links: [],
                ghost_links: [],
                server_time: "2025-01-01T00:00:00Z",
              }),
            ),
          headers: new Headers(),
        }),
      );

      const client = createApiClient({ getToken, baseUrl: "https://api.test.example.com" });
      const result = await client.getSyncPages();

      expect(result.pages).toEqual([]);
    });
  });

  // ── Error handling ──────────────────────────────────────────────────

  describe("error handling", () => {
    it("throws ApiError with status code and message", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          status: 404,
          statusText: "Not Found",
          text: () => Promise.resolve(JSON.stringify({ error: "Page not found" })),
          headers: new Headers(),
        }),
      );

      const client = createApiClient({ getToken, baseUrl: "https://api.test.example.com" });

      try {
        await client.getPageContent("missing");
        expect.fail("Expected ApiError");
      } catch (err) {
        expect(err).toBeInstanceOf(ApiError);
        const apiErr = err as ApiError;
        expect(apiErr.status).toBe(404);
      }
    });

    it("throws NETWORK_ERROR for fetch failures", async () => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

      const client = createApiClient({ getToken, baseUrl: "https://api.test.example.com" });

      try {
        await client.getSyncPages();
        expect.fail("Expected ApiError");
      } catch (err) {
        expect(err).toBeInstanceOf(ApiError);
        const apiErr = err as ApiError;
        expect(apiErr.status).toBe(0);
        expect(apiErr.code).toBe("NETWORK_ERROR");
      }
    });

    it("throws INVALID_JSON for non-JSON responses", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          text: () => Promise.resolve("<html>Not JSON</html>"),
          headers: new Headers(),
        }),
      );

      const client = createApiClient({ getToken, baseUrl: "https://api.test.example.com" });

      try {
        await client.getSyncPages();
        expect.fail("Expected ApiError");
      } catch (err) {
        expect(err).toBeInstanceOf(ApiError);
        expect((err as ApiError).code).toBe("INVALID_JSON");
      }
    });

    it("throws INVALID_JSON with truncated snippet when body is long (security: no huge error strings)", async () => {
      const longInvalid = "x".repeat(250);
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          text: () => Promise.resolve(longInvalid),
          headers: new Headers(),
        }),
      );

      const client = createApiClient({ baseUrl: "https://api.test.example.com" });

      await expect(client.getSyncPages()).rejects.toMatchObject({
        code: "INVALID_JSON",
        message: expect.stringMatching(/^Invalid JSON response \(HTTP 200\): x{200}…$/),
      });
    });

    it("maps 5xx (non-503) to ApiError immediately without retry (resilience: no retry storm)", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        mockResponse({
          ok: false,
          status: 502,
          statusText: "Bad Gateway",
          body: JSON.stringify({ error: { message: "upstream", code: "BAD_GATEWAY" } }),
        }),
      );
      vi.stubGlobal("fetch", fetchMock);

      const client = createApiClient({ baseUrl: "https://api.test.example.com" });

      await expect(client.getSyncPages()).rejects.toMatchObject({
        status: 502,
        code: "BAD_GATEWAY",
        message: "upstream",
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("prefers envelope error.message and error.code on 4xx", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          mockResponse({
            ok: false,
            status: 403,
            body: JSON.stringify({
              ok: false,
              error: { message: "Forbidden action", code: "FORBIDDEN" },
            }),
          }),
        ),
      );

      const client = createApiClient({ baseUrl: "https://api.test.example.com" });

      await expect(client.getNotes()).rejects.toMatchObject({
        status: 403,
        code: "FORBIDDEN",
        message: "Forbidden action",
      });
    });

    it("falls back to legacy { message, code } when envelope error is absent", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          mockResponse({
            ok: false,
            status: 422,
            body: JSON.stringify({ message: "Invalid", code: "VALIDATION" }),
          }),
        ),
      );

      const client = createApiClient({ baseUrl: "https://api.test.example.com" });

      await expect(client.postSyncPages({ pages: [] })).rejects.toMatchObject({
        status: 422,
        code: "VALIDATION",
        message: "Invalid",
      });
    });

    it("uses HTTP statusText when error body has no message (boundary)", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          mockResponse({
            ok: false,
            status: 418,
            statusText: "I'm a teapot",
            body: JSON.stringify({}),
          }),
        ),
      );

      const client = createApiClient({ baseUrl: "https://api.test.example.com" });

      await expect(client.getPageContent("x")).rejects.toMatchObject({
        status: 418,
        message: "I'm a teapot",
      });
    });

    it("throws INVALID_JSON for HTML 500 body before ApiError mapping (malicious/proxy error pages)", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          mockResponse({
            ok: false,
            status: 500,
            body: "<html>error</html>",
          }),
        ),
      );

      const client = createApiClient({ baseUrl: "https://api.test.example.com" });

      await expect(client.getSyncPages()).rejects.toMatchObject({
        code: "INVALID_JSON",
      });
    });

    it("throws NETWORK_ERROR with generic message when fetch rejects a non-Error (resilience)", async () => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue("offline"));

      const client = createApiClient({ baseUrl: "https://api.test.example.com" });

      await expect(client.getSyncPages()).rejects.toMatchObject({
        status: 0,
        code: "NETWORK_ERROR",
        message: "Network error: Failed to fetch",
      });
    });
  });

  // ── 503 Auto-retry ─────────────────────────────────────────────────

  describe("503 DATABASE_RESUMING auto-retry", () => {
    it("retries on 503 with Retry-After header", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 503,
          text: () =>
            Promise.resolve(
              JSON.stringify({ error: "Database is resuming", code: "DATABASE_RESUMING" }),
            ),
          headers: new Headers({ "Retry-After": "1" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify({ results: [] })),
          headers: new Headers(),
        });
      vi.stubGlobal("fetch", fetchMock);

      const client = createApiClient({ getToken, baseUrl: "https://api.test.example.com" });
      const result = await client.searchSharedNotes("test");

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(result.results).toEqual([]);
    });

    it("retries on 503 with default delay when Retry-After is missing or invalid", async () => {
      vi.useFakeTimers();
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 503,
          statusText: "Service Unavailable",
          text: () =>
            Promise.resolve(JSON.stringify({ error: { message: "temp", code: "UNAVAILABLE" } })),
          headers: new Headers(),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify({ results: [] })),
          headers: new Headers(),
        });
      vi.stubGlobal("fetch", fetchMock);

      const client = createApiClient({ baseUrl: "https://api.test.example.com" });
      const resultPromise = client.searchSharedNotes("test");
      await vi.advanceTimersByTimeAsync(2000);
      const result = await resultPromise;

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(result.results).toEqual([]);
      vi.useRealTimers();
    });

    it("gives up after MAX_RETRIES (3) attempts", async () => {
      vi.useFakeTimers();
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        statusText: "Service Unavailable",
        text: () =>
          Promise.resolve(
            JSON.stringify({
              message: "Database is resuming",
              code: "DATABASE_RESUMING",
            }),
          ),
        headers: new Headers({ "Retry-After": "1" }),
      });
      vi.stubGlobal("fetch", fetchMock);

      const client = createApiClient({ baseUrl: "https://api.test.example.com" });
      const resultPromise = client.searchSharedNotes("test").catch((e: unknown) => e);

      for (let i = 0; i < 10; i++) {
        await vi.advanceTimersByTimeAsync(1500);
      }

      const err = await resultPromise;
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).status).toBe(503);
      expect(fetchMock).toHaveBeenCalledTimes(4);
      vi.useRealTimers();
    });
  });

  // ── requestOptionalAuth (public notes; same fetch, no 503 retry) ───

  describe("requestOptionalAuth", () => {
    it("throws NETWORK_ERROR when fetch fails (guest / optional-auth path)", async () => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

      const client = createApiClient({ baseUrl: "https://api.test.example.com" });

      await expect(client.getNote("note-1")).rejects.toMatchObject({
        code: "NETWORK_ERROR",
        status: 0,
      });
    });

    it("does not retry on 503 (only authenticated request() retries; boundary)", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        mockResponse({
          ok: false,
          status: 503,
          body: JSON.stringify({ error: { message: "overloaded", code: "UNAVAILABLE" } }),
        }),
      );
      vi.stubGlobal("fetch", fetchMock);

      const client = createApiClient({ baseUrl: "https://api.test.example.com" });

      await expect(client.getPublicNotes()).rejects.toMatchObject({ status: 503 });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  // ── URL and query construction ───────────────────────────────────────

  describe("URL and query", () => {
    it("strips trailing slash from baseUrl when building request URL", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        mockResponse({
          ok: true,
          status: 200,
          body: JSON.stringify({ pages: [], links: [], ghost_links: [], server_time: "t" }),
        }),
      );
      vi.stubGlobal("fetch", fetchMock);

      const client = createApiClient({ baseUrl: "https://api.test.example.com/" });
      await client.getSyncPages();

      const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("https://api.test.example.com/api/sync/pages");
    });

    it("passes since as query param for incremental sync", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        mockResponse({
          ok: true,
          status: 200,
          body: JSON.stringify({ pages: [], links: [], ghost_links: [], server_time: "t" }),
        }),
      );
      vi.stubGlobal("fetch", fetchMock);

      const client = createApiClient({ baseUrl: "https://api.test.example.com" });
      await client.getSyncPages("2025-01-01T00:00:00Z");

      const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toContain("since=2025-01-01T00%3A00%3A00Z");
    });

    it("sends default discover query params (sort, limit, offset)", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        mockResponse({
          ok: true,
          status: 200,
          body: JSON.stringify({ official: [], notes: [] }),
        }),
      );
      vi.stubGlobal("fetch", fetchMock);

      const client = createApiClient({ baseUrl: "https://api.test.example.com" });
      await client.getPublicNotes();

      const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
      const parsed = new URL(url);
      expect(parsed.pathname).toBe("/api/notes/discover");
      expect(parsed.searchParams.get("sort")).toBe("updated");
      expect(parsed.searchParams.get("limit")).toBe("20");
      expect(parsed.searchParams.get("offset")).toBe("0");
    });
  });

  // ── Client methods ──────────────────────────────────────────────────

  describe("client methods", () => {
    beforeEach(() => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify({})),
          headers: new Headers(),
        }),
      );
    });

    it("clipFetchHtml sends POST with url", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify({ html: "<p>Hello</p>" })),
        headers: new Headers(),
      });
      vi.stubGlobal("fetch", fetchMock);

      const client = createApiClient({ getToken, baseUrl: "https://api.test.example.com" });
      const html = await client.clipFetchHtml("https://example.com");

      expect(html).toBe("<p>Hello</p>");
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toContain("/api/clip/fetch");
      expect(init.method).toBe("POST");
    });

    it("clipYoutube sends POST with url and AI options", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              title: "YouTube Test",
              thumbnailUrl: null,
              tiptapJson: { type: "doc", content: [] },
              contentText: "summary",
              contentHash: "hash",
              sourceUrl: "https://www.youtube.com/watch?v=abc12345678",
            }),
          ),
        headers: new Headers(),
      });
      vi.stubGlobal("fetch", fetchMock);

      const client = createApiClient({ getToken, baseUrl: "https://api.test.example.com" });
      await client.clipYoutube("https://youtu.be/abc12345678", {
        provider: "openai",
        model: "openai:gpt-5-mini",
      });

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toContain("/api/clip/youtube");
      expect(init.method).toBe("POST");
      expect(init.body).toBe(
        JSON.stringify({
          url: "https://youtu.be/abc12345678",
          provider: "openai",
          model: "openai:gpt-5-mini",
        }),
      );
    });

    it("searchSharedNotes returns empty for blank query", async () => {
      const client = createApiClient({ getToken, baseUrl: "https://api.test.example.com" });
      const result = await client.searchSharedNotes("   ");

      expect(result.results).toEqual([]);
    });

    it("deletePage sends DELETE request", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify({ id: "p1", deleted: true })),
        headers: new Headers(),
      });
      vi.stubGlobal("fetch", fetchMock);

      const client = createApiClient({ getToken, baseUrl: "https://api.test.example.com" });
      const result = await client.deletePage("p1");

      expect(result.deleted).toBe(true);
      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(init.method).toBe("DELETE");
    });

    it("copyPersonalPageToNote POSTs to /api/notes/:noteId/pages/copy-from-personal/:pageId (issue #713 Phase 3)", async () => {
      // レスポンスには `page` (SyncPageItem) が必ず同梱される想定。
      // `useCopyPersonalPageToNote` は invalidate しかしないが、API 契約として
      // `page` を落とすとフロント全般（sync 契約変更を含む）に波及するため、
      // テストで明示的に返却形状を固定する。
      // Lock the response envelope shape: clients rely on `page` being present
      // (`useCopyPersonalPageToNote` uses it indirectly via cache keys tied to
      // `note_id`), so a regression that drops the field should fail here.
      const copiedPage = {
        id: "pg-new",
        owner_id: "user-1",
        note_id: "note-1",
        source_page_id: "pg-src",
        title: "Copied",
        content_preview: "preview",
        thumbnail_url: null,
        source_url: null,
        created_at: "2026-04-23T00:00:00.000Z",
        updated_at: "2026-04-23T00:00:00.000Z",
        is_deleted: false,
      };
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              ok: true,
              data: { created: true, page_id: "pg-new", sort_order: 3, page: copiedPage },
            }),
          ),
        headers: new Headers(),
      });
      vi.stubGlobal("fetch", fetchMock);

      const client = createApiClient({ baseUrl: "https://api.test.example.com" });
      const result = await client.copyPersonalPageToNote("note-1", "pg-src");

      expect(result).toMatchObject({ created: true, page_id: "pg-new", sort_order: 3 });
      // `page` 本体も検証する（envelope unwrapping でフィールドが落ちないこと）。
      // Assert the page payload round-trips through envelope unwrapping intact.
      expect(result.page).toEqual(copiedPage);
      expect(result.page.note_id).toBe("note-1");
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(
        "https://api.test.example.com/api/notes/note-1/pages/copy-from-personal/pg-src",
      );
      expect(init.method).toBe("POST");
      // `id` 引数の encodeURIComponent を検証（パスインジェクション対策）。
      // Verifies encodeURIComponent on ids (path-injection guard).
      const result2 = await client.copyPersonalPageToNote("note/weird", "pg src");
      const [url2] = fetchMock.mock.calls[1] as [string, RequestInit];
      expect(url2).toBe(
        "https://api.test.example.com/api/notes/note%2Fweird/pages/copy-from-personal/pg%20src",
      );
      expect(result2.created).toBe(true);
    });

    it("copyNotePageToPersonal POSTs to /api/notes/:noteId/pages/:pageId/copy-to-personal (issue #713 Phase 3)", async () => {
      // `useCopyNotePageToPersonal` は `result.page` を IDB へ書き戻すため、
      // API が `page` を返し切ることを契約として固定する（回帰防止）。
      // Lock the response contract: `useCopyNotePageToPersonal` writes
      // `result.page` through to IndexedDB, so dropping the field here would
      // break `/home` reflection — this test catches that regression.
      const copiedPage = {
        id: "pg-c",
        owner_id: "user-1",
        note_id: null,
        source_page_id: "pg-note-native",
        title: "Copied",
        content_preview: "preview",
        thumbnail_url: null,
        source_url: null,
        created_at: "2026-04-23T00:00:00.000Z",
        updated_at: "2026-04-23T00:00:00.000Z",
        is_deleted: false,
      };
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              ok: true,
              data: { created: true, page_id: "pg-c", page: copiedPage },
            }),
          ),
        headers: new Headers(),
      });
      vi.stubGlobal("fetch", fetchMock);

      const client = createApiClient({ baseUrl: "https://api.test.example.com" });
      const result = await client.copyNotePageToPersonal("note-a", "pg-note-native");

      expect(result).toMatchObject({ created: true, page_id: "pg-c" });
      // 個人スコープへのコピーなので `note_id` は null であること。
      // Personal-scope copy → `note_id` must be null.
      expect(result.page).toEqual(copiedPage);
      expect(result.page.note_id).toBeNull();
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(
        "https://api.test.example.com/api/notes/note-a/pages/pg-note-native/copy-to-personal",
      );
      expect(init.method).toBe("POST");

      // 予約文字（`/` / 空白）を含む ID もパスセグメントとして encodeURIComponent
      // される（copyPersonalPageToNote 側と同じパスインジェクション対策）。
      // Reserved characters (`/`, space) in IDs must be encodeURIComponent'd
      // per segment — mirrors the guard already asserted for copyPersonalPageToNote.
      const result2 = await client.copyNotePageToPersonal("note/weird", "pg src");
      const [url2] = fetchMock.mock.calls[1] as [string, RequestInit];
      expect(url2).toBe(
        "https://api.test.example.com/api/notes/note%2Fweird/pages/pg%20src/copy-to-personal",
      );
      expect(result2.created).toBe(true);
    });
  });
});
