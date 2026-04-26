/**
 * imageSearch.ts のテスト（Google Custom Search API ラッパー）。
 * Tests for the Google Custom Search image wrapper.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { searchImages } from "../../services/imageSearch.js";

const fetchSpy = vi.spyOn(globalThis, "fetch");

beforeEach(() => {
  fetchSpy.mockReset();
});

afterEach(() => {
  fetchSpy.mockReset();
});

function okJson(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("searchImages", () => {
  it("returns empty array when query is empty", async () => {
    const result = await searchImages("", "k", "cx", 1, 10);
    expect(result).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns empty array when apiKey or engineId is missing", async () => {
    expect(await searchImages("q", "", "cx", 1, 10)).toEqual([]);
    expect(await searchImages("q", "k", "", 1, 10)).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns empty array when start > 100 (Google API hard cap)", async () => {
    // page=11, num=10 → start = 101.
    const result = await searchImages("q", "k", "cx", 11, 10);
    expect(result).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("clamps `num` into [1, 10]", async () => {
    // Response は body を一度しか read できないので、毎回新しいインスタンスを返す。
    // Response body is single-use; return a fresh instance per call.
    fetchSpy.mockImplementation(async () => okJson({ items: [] }));

    await searchImages("q", "k", "cx", 1, 999);
    const url1 = String(fetchSpy.mock.calls[0]?.[0]);
    expect(new URL(url1).searchParams.get("num")).toBe("10");

    await searchImages("q", "k", "cx", 1, 0);
    const url2 = String(fetchSpy.mock.calls[1]?.[0]);
    expect(new URL(url2).searchParams.get("num")).toBe("1");
  });

  it("computes `start` from page and num (1-based)", async () => {
    fetchSpy.mockImplementation(async () => okJson({ items: [] }));

    await searchImages("q", "k", "cx", 3, 5); // (3-1)*5 + 1 = 11
    const url = String(fetchSpy.mock.calls[0]?.[0]);
    expect(new URL(url).searchParams.get("start")).toBe("11");
  });

  it("maps API items to ImageSearchItem and skips entries without link/image", async () => {
    fetchSpy.mockResolvedValue(
      okJson({
        items: [
          {
            title: "Cat",
            link: "https://cdn/cat.jpg",
            displayLink: "cdn",
            image: {
              thumbnailLink: "https://cdn/cat-thumb.jpg",
              contextLink: "https://cdn/cat.html",
            },
          },
          // Skipped: missing link.
          { title: "no link", image: { thumbnailLink: "x" } },
          // Skipped: missing image.
          { title: "no img", link: "https://cdn/x.jpg" },
        ],
      }),
    );

    const result = await searchImages("q", "k", "cx", 1, 10);
    expect(result).toEqual([
      {
        id: "https://cdn/cat.jpg",
        previewUrl: "https://cdn/cat-thumb.jpg",
        imageUrl: "https://cdn/cat.jpg",
        alt: "Cat",
        sourceName: "cdn",
        sourceUrl: "https://cdn/cat.html",
      },
    ]);
  });

  it("falls back to query for `alt` when title is missing", async () => {
    fetchSpy.mockResolvedValue(
      okJson({
        items: [
          {
            link: "https://cdn/x.jpg",
            image: { thumbnailLink: "https://cdn/x-thumb.jpg", contextLink: "https://cdn/x.html" },
          },
        ],
      }),
    );

    const result = await searchImages("kitten", "k", "cx", 1, 10);
    expect(result[0]?.alt).toBe("kitten");
  });

  it("falls back to URL hostname for sourceName when displayLink is missing", async () => {
    fetchSpy.mockResolvedValue(
      okJson({
        items: [
          {
            title: "T",
            link: "https://example.com/x.jpg",
            image: { thumbnailLink: "https://example.com/x-t.jpg", contextLink: "" },
          },
        ],
      }),
    );

    const result = await searchImages("q", "k", "cx", 1, 10);
    expect(result[0]?.sourceName).toBe("example.com");
  });

  it("throws when the API responds with non-200", async () => {
    fetchSpy.mockResolvedValue(new Response("forbidden", { status: 403 }));
    await expect(searchImages("q", "k", "cx", 1, 10)).rejects.toThrow(/403/);
  });

  it("returns empty array when API returns no items field", async () => {
    fetchSpy.mockResolvedValue(okJson({}));
    expect(await searchImages("q", "k", "cx", 1, 10)).toEqual([]);
  });
});
