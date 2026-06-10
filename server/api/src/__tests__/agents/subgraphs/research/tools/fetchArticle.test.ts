/**
 * `fetchArticleTool` unit tests. Covers:
 * - SSRF rejection: `isClipUrlAllowedAfterDns` returns false → `{ ok:false, error:"url_blocked" }`.
 * - Happy path: `extractArticleFromUrl` returns an article → success envelope.
 * - Extractor throw → error envelope (no rethrow).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { isClipUrlAllowedAfterDns, extractArticleFromUrl } = vi.hoisted(() => ({
  isClipUrlAllowedAfterDns: vi.fn(),
  extractArticleFromUrl: vi.fn(),
}));

vi.mock("../../../../../lib/clipUrlPolicy.js", () => ({
  isClipUrlAllowedAfterDns: (...args: unknown[]) =>
    isClipUrlAllowedAfterDns(
      ...(args as Parameters<
        typeof import("../../../../../lib/clipUrlPolicy.js").isClipUrlAllowedAfterDns
      >),
    ),
}));

vi.mock("../../../../../services/articleExtractor.js", async () => {
  const actual = await vi.importActual<typeof import("../../../../../services/articleExtractor.js")>(
    "../../../../../services/articleExtractor.js",
  );
  return {
    ...actual,
    extractArticleFromUrl: (...args: unknown[]) =>
      extractArticleFromUrl(
        ...(args as Parameters<
          typeof import("../../../../../services/articleExtractor.js").extractArticleFromUrl
        >),
      ),
  };
});

import { fetchArticleTool } from "../../../../../agents/core/tools/fetchArticle.js";

beforeEach(() => {
  isClipUrlAllowedAfterDns.mockReset();
  extractArticleFromUrl.mockReset();
});
afterEach(() => {
  isClipUrlAllowedAfterDns.mockReset();
  extractArticleFromUrl.mockReset();
});

describe("fetchArticleTool", () => {
  it("rejects blocked URLs without calling the extractor", async () => {
    isClipUrlAllowedAfterDns.mockResolvedValueOnce(false);
    const raw = await fetchArticleTool.invoke({ url: "http://internal/" });
    expect(extractArticleFromUrl).not.toHaveBeenCalled();
    const parsed = JSON.parse(raw as string) as { ok: boolean; error?: string };
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toBe("url_blocked");
  });

  it("returns an article envelope on success", async () => {
    isClipUrlAllowedAfterDns.mockResolvedValueOnce(true);
    extractArticleFromUrl.mockResolvedValueOnce({
      finalUrl: "https://final/",
      title: "T",
      thumbnailUrl: null,
      tiptapJson: { type: "doc" },
      contentText: "body",
      contentHash: "abc",
    });
    const raw = await fetchArticleTool.invoke({ url: "https://x/", previewLength: 1000 });
    const parsed = JSON.parse(raw as string) as {
      ok: boolean;
      finalUrl: string;
      title: string;
      excerpt: string;
      contentHash: string;
    };
    expect(parsed.ok).toBe(true);
    expect(parsed.finalUrl).toBe("https://final/");
    expect(parsed.title).toBe("T");
    expect(parsed.excerpt).toBe("body");
    expect(parsed.contentHash).toBe("abc");
    expect(extractArticleFromUrl).toHaveBeenCalledWith(
      expect.objectContaining({ url: "https://x/", previewLength: 1000 }),
    );
  });

  it("wraps extractor errors in a non-throwing envelope", async () => {
    isClipUrlAllowedAfterDns.mockResolvedValueOnce(true);
    extractArticleFromUrl.mockRejectedValueOnce(new Error("network fail"));
    const raw = await fetchArticleTool.invoke({ url: "https://x/" });
    const parsed = JSON.parse(raw as string) as { ok: boolean; error?: string };
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toBe("network fail");
  });
});
