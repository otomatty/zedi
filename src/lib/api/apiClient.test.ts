import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock import.meta.env before importing the module
vi.stubEnv("VITE_ZEDI_API_BASE_URL", "https://api.test.example.com");

import { createApiClient, ApiError } from "./apiClient";

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

  // ── Authentication ──────────────────────────────────────────────────

  describe("authentication", () => {
    it("throws ApiError(401) when token is null", async () => {
      const client = createApiClient({ getToken: () => Promise.resolve(null) });

      await expect(client.getSyncPages()).rejects.toThrow(ApiError);
      await expect(client.getSyncPages()).rejects.toMatchObject({ status: 401 });
    });

    it("includes Authorization header with Bearer token", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify({ results: [] })),
        headers: new Headers(),
      });
      vi.stubGlobal("fetch", mockFetch);

      const client = createApiClient({ getToken, baseUrl: "https://api.test.example.com" });
      await client.searchSharedNotes("test");

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      const headers = init.headers as Record<string, string>;
      expect(headers.Authorization).toBe(`Bearer ${mockToken}`);
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
  });

  // ── 503 Auto-retry (Aurora resuming) ─────────────────────────────────

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

    it("gives up after MAX_DB_RESUMING_RETRIES (4) attempts", async () => {
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

      const client = createApiClient({ getToken, baseUrl: "https://api.test.example.com" });
      // Catch rejection immediately to prevent unhandled rejection errors
      const resultPromise = client.searchSharedNotes("test").catch((e: unknown) => e);

      for (let i = 0; i < 10; i++) {
        await vi.advanceTimersByTimeAsync(1500);
      }

      const err = await resultPromise;
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).status).toBe(503);
      expect(fetchMock).toHaveBeenCalledTimes(5);
      vi.useRealTimers();
    });

    it("dispatches zedi:db-resuming event on 503", async () => {
      vi.useFakeTimers();
      const eventListener = vi.fn();
      window.addEventListener("zedi:db-resuming", eventListener);

      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 503,
          text: () => Promise.resolve(JSON.stringify({})),
          headers: new Headers({ "Retry-After": "1" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify({})),
          headers: new Headers(),
        });
      vi.stubGlobal("fetch", fetchMock);

      const client = createApiClient({ getToken, baseUrl: "https://api.test.example.com" });
      const promise = client.searchSharedNotes("test");
      await vi.advanceTimersByTimeAsync(1500);
      await promise;

      expect(eventListener).toHaveBeenCalled();
      window.removeEventListener("zedi:db-resuming", eventListener);
      vi.useRealTimers();
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
  });
});
