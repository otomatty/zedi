/**
 * Tools (web_search / wiki_search / fetch_article / image_search) のスキーマと
 * `bindTools` 互換性を確認するテスト。`wiki_search` / `web_search` /
 * `fetch_article` は #949 で本実装に置き換わったため、sentinel 応答テストは
 * 削除し、graph context 欠落時のエラー shape（JSON envelope `{ ok:false }`）を
 * 確認する単体テストに差し替えた。詳細な挙動は
 * `__tests__/agents/subgraphs/research/tools/*.test.ts` 側で検証する。
 *
 * Pin the public surface of the shared tool set so subgraph PRs cannot silently
 * rename or restructure a tool. Stub `image_search` still returns a sentinel;
 * other tools return JSON envelopes (parsed back by their caller nodes).
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

describe("tool bodies — minimal envelopes", () => {
  it("wiki_search returns a JSON envelope and reports missing context", async () => {
    const raw = (await wikiSearchTool.invoke({ query: "ripgrep" })) as unknown;
    expect(typeof raw).toBe("string");
    const parsed = JSON.parse(raw as string) as { ok: boolean; error?: string };
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toBe("missing_graph_context");
  });
  it("web_search returns a JSON envelope and reports missing context", async () => {
    const raw = (await webSearchTool.invoke({ query: "ripgrep" })) as unknown;
    expect(typeof raw).toBe("string");
    const parsed = JSON.parse(raw as string) as { ok: boolean; error?: string };
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toBe("missing_graph_context");
  });
  it("image_search still returns the not-implemented sentinel (#949 scope)", async () => {
    const out = (await imageSearchTool.invoke({ query: "cat" })) as unknown;
    expect(out).toMatch(/IMAGE_SEARCH_NOT_IMPLEMENTED/);
  });
});
