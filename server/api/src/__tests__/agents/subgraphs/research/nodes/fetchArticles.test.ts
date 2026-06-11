/**
 * `fetchArticles` unit tests (#1033).
 * - Upgrades `web` rows to `kind:"fetched"` in place (same id).
 * - Partial fetch failures leave other candidates untouched.
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
  const actual = await vi.importActual<
    typeof import("../../../../../services/articleExtractor.js")
  >("../../../../../services/articleExtractor.js");
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

import { fetchArticles } from "../../../../../agents/subgraphs/research/nodes/fetchArticles.js";
import type { ResearchLoopStateType } from "../../../../../agents/subgraphs/research/state.js";
import type { Source } from "../../../../../agents/subgraphs/research/types.js";

function state(overrides: Partial<ResearchLoopStateType>): ResearchLoopStateType {
  return {
    messages: [],
    phase: "research:fetch",
    pageId: "p-1",
    userId: "u-1",
    iteration: 1,
    maxIterations: 3,
    queries: [],
    pendingSources: [],
    lastEvaluation: null,
    exitReason: null,
    batches: [],
    approvedResearch: [],
    rejectedResearch: [],
    additionalRequest: null,
    ...overrides,
  };
}

beforeEach(() => {
  isClipUrlAllowedAfterDns.mockReset();
  extractArticleFromUrl.mockReset();
  isClipUrlAllowedAfterDns.mockResolvedValue(true);
});
afterEach(() => {
  isClipUrlAllowedAfterDns.mockReset();
  extractArticleFromUrl.mockReset();
});

describe("fetchArticles", () => {
  it("returns empty pendingSources when there are no web candidates", async () => {
    const update = await fetchArticles(
      state({
        pendingSources: [{ id: "wiki:1", kind: "wiki", title: "W" }],
      }),
      { configurable: {} } as never,
    );
    expect(update.pendingSources).toEqual([]);
  });

  it("upgrades successful fetches in place and skips failures", async () => {
    extractArticleFromUrl
      .mockResolvedValueOnce({
        finalUrl: "https://final/a",
        title: "Article A",
        thumbnailUrl: null,
        tiptapJson: { type: "doc" },
        contentText: "excerpt A",
        contentHash: "hash-a",
      })
      .mockRejectedValueOnce(new Error("network fail"));

    const update = await fetchArticles(
      state({
        pendingSources: [
          { id: "src:aaa", kind: "web", title: "A", url: "https://a/" },
          { id: "src:bbb", kind: "web", title: "B", url: "https://b/" },
        ],
      }),
      { configurable: {} } as never,
    );

    const upgraded = (update.pendingSources ?? []) as Source[];
    expect(upgraded).toHaveLength(1);
    expect(upgraded[0]).toEqual(
      expect.objectContaining({
        id: "src:aaa",
        kind: "fetched",
        title: "Article A",
        url: "https://a/",
        finalUrl: "https://final/a",
        excerpt: "excerpt A",
        contentHash: "hash-a",
      }),
    );
  });

  it("fetches at most five web candidates per iteration", async () => {
    extractArticleFromUrl.mockResolvedValue({
      finalUrl: "https://final/",
      title: "T",
      thumbnailUrl: null,
      tiptapJson: { type: "doc" },
      contentText: "body",
      contentHash: "h",
    });

    const pendingSources = Array.from({ length: 7 }, (_, i) => ({
      id: `src:${i}`,
      kind: "web" as const,
      title: `T${i}`,
      url: `https://x/${i}`,
    }));

    await fetchArticles(state({ pendingSources }), { configurable: {} } as never);

    expect(extractArticleFromUrl).toHaveBeenCalledTimes(5);
  });
});
