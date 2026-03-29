/**
 * clipServerFetch（SSRF 安全な fetch）の単体テスト
 * Unit tests for clipServerFetch (SSRF-safe fetch).
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { lookup } from "node:dns/promises";
import { ClipFetchBlockedError, fetchClipHtmlWithRedirects } from "./clipServerFetch.js";

vi.mock("node:dns/promises", () => ({
  lookup: vi.fn(),
}));

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("fetchClipHtmlWithRedirects", () => {
  beforeEach(() => {
    vi.mocked(lookup).mockReset();
    vi.mocked(lookup).mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
    ] as unknown as Awaited<ReturnType<typeof lookup>>);
  });

  it("throws ClipFetchBlockedError when redirect targets private IP", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    fetchMock.mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: { Location: "http://127.0.0.1/secret" },
      }),
    );

    const controller = new AbortController();
    await expect(
      fetchClipHtmlWithRedirects("https://example.com/page", controller),
    ).rejects.toThrow(ClipFetchBlockedError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns html and finalUrl when response is 200", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    fetchMock.mockResolvedValueOnce(
      new Response("<html>ok</html>", {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      }),
    );

    const controller = new AbortController();
    const result = await fetchClipHtmlWithRedirects("https://example.com/", controller);
    expect(result.html).toBe("<html>ok</html>");
    expect(result.contentType).toBe("text/html; charset=utf-8");
    expect(result.finalUrl).toBeDefined();
  });

  it("throws when response is not ok", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 500 }));

    const controller = new AbortController();
    await expect(fetchClipHtmlWithRedirects("https://example.com/", controller)).rejects.toThrow(
      /Fetch failed: 500/,
    );
  });
});
