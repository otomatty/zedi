/**
 * Tools (web_search / wiki_search / fetch_article / image_search) のスキーマと
 * `bindTools` 互換性を確認するテスト。本実装は #949 以降だが、スキーマ・名前が
 * P0 段階で固まっていることをテストで担保する。
 *
 * Pin the public surface of the shared tool set so P1+ subgraph PRs cannot
 * silently rename or restructure a tool. Behaviour itself is stubbed and not
 * asserted here beyond "returns the sentinel string".
 */
import { describe, expect, it } from "vitest";
import {
  fetchArticleInputSchema,
  fetchArticleTool,
  FETCH_ARTICLE_TOOL_NAME,
  imageSearchInputSchema,
  imageSearchTool,
  IMAGE_SEARCH_TOOL_NAME,
  SHARED_TOOLS,
  webSearchInputSchema,
  webSearchTool,
  WEB_SEARCH_TOOL_NAME,
  wikiSearchInputSchema,
  wikiSearchTool,
  WIKI_SEARCH_TOOL_NAME,
} from "../../../../agents/core/tools/index.js";

describe("tool names", () => {
  it("are stable and unique across the shared set", () => {
    const names = [
      WEB_SEARCH_TOOL_NAME,
      WIKI_SEARCH_TOOL_NAME,
      FETCH_ARTICLE_TOOL_NAME,
      IMAGE_SEARCH_TOOL_NAME,
    ];
    expect(new Set(names).size).toBe(names.length);
    expect(WEB_SEARCH_TOOL_NAME).toBe("web_search");
    expect(WIKI_SEARCH_TOOL_NAME).toBe("wiki_search");
    expect(FETCH_ARTICLE_TOOL_NAME).toBe("fetch_article");
    expect(IMAGE_SEARCH_TOOL_NAME).toBe("image_search");
  });
});

describe("input schemas", () => {
  it("web_search requires a non-empty query", () => {
    expect(webSearchInputSchema.safeParse({ query: "" }).success).toBe(false);
    expect(webSearchInputSchema.safeParse({ query: "ripgrep" }).success).toBe(true);
  });
  it("web_search rejects limit > 10", () => {
    expect(webSearchInputSchema.safeParse({ query: "x", limit: 11 }).success).toBe(false);
  });
  it("wiki_search rejects limit > 20", () => {
    expect(wikiSearchInputSchema.safeParse({ query: "x", limit: 21 }).success).toBe(false);
  });
  it("fetch_article rejects non-http URLs", () => {
    expect(fetchArticleInputSchema.safeParse({ url: "ftp://x/y" }).success).toBe(false);
    expect(fetchArticleInputSchema.safeParse({ url: "https://x/y" }).success).toBe(true);
  });
  it("fetch_article clamps previewLength to 500..8000", () => {
    expect(
      fetchArticleInputSchema.safeParse({ url: "https://x", previewLength: 100 }).success,
    ).toBe(false);
    expect(
      fetchArticleInputSchema.safeParse({ url: "https://x", previewLength: 4000 }).success,
    ).toBe(true);
  });
  it("image_search rejects page > 10", () => {
    expect(imageSearchInputSchema.safeParse({ query: "x", page: 11 }).success).toBe(false);
  });
});

describe("SHARED_TOOLS", () => {
  it("contains all four shared tools in a stable order", () => {
    expect(SHARED_TOOLS.map((t) => t.name)).toEqual([
      WEB_SEARCH_TOOL_NAME,
      WIKI_SEARCH_TOOL_NAME,
      FETCH_ARTICLE_TOOL_NAME,
      IMAGE_SEARCH_TOOL_NAME,
    ]);
  });
});

describe("stub tool bodies", () => {
  it("web_search returns the not-implemented sentinel", async () => {
    const out = (await webSearchTool.invoke({ query: "ripgrep" })) as unknown;
    expect(typeof out).toBe("string");
    expect(out).toMatch(/WEB_SEARCH_NOT_IMPLEMENTED/);
  });
  it("wiki_search returns the not-implemented sentinel", async () => {
    const out = (await wikiSearchTool.invoke({ query: "ripgrep" })) as unknown;
    expect(out).toMatch(/WIKI_SEARCH_NOT_IMPLEMENTED/);
  });
  it("fetch_article returns the not-implemented sentinel", async () => {
    const out = (await fetchArticleTool.invoke({ url: "https://example.com" })) as unknown;
    expect(out).toMatch(/FETCH_ARTICLE_NOT_IMPLEMENTED/);
  });
  it("image_search returns the not-implemented sentinel", async () => {
    const out = (await imageSearchTool.invoke({ query: "cat" })) as unknown;
    expect(out).toMatch(/IMAGE_SEARCH_NOT_IMPLEMENTED/);
  });
});
