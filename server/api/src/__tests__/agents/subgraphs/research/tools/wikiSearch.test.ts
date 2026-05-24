/**
 * `wikiSearchTool` unit tests. Covers:
 * - Missing graph context → JSON envelope `{ ok:false, error:"missing_graph_context" }`.
 * - Happy path: forwards `userId` / `userEmail` to `searchUserWikiPages` and
 *   maps hits to the on-wire `Source` envelope with stable `wiki:<pageId>` ids.
 * - Service error → JSON envelope `{ ok:false, error }`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { searchUserWikiPages } = vi.hoisted(() => ({ searchUserWikiPages: vi.fn() }));
vi.mock("../../../../../services/wikiSearchService.js", () => ({
  searchUserWikiPages: (...args: unknown[]) =>
    searchUserWikiPages(
      ...(args as Parameters<
        typeof import("../../../../../services/wikiSearchService.js").searchUserWikiPages
      >),
    ),
}));

import { wikiSearchTool } from "../../../../../agents/core/tools/wikiSearch.js";
import { GRAPH_CONTEXT_CONFIG_KEY } from "../../../../../agents/core/types/graphContext.js";
import type { GraphContext } from "../../../../../agents/core/types/graphContext.js";
import type { Database } from "../../../../../types/index.js";

function ctxConfig(overrides: Partial<GraphContext> = {}): { configurable: Record<string, unknown> } {
  return {
    configurable: {
      [GRAPH_CONTEXT_CONFIG_KEY]: {
        threadId: "t",
        sessionId: "t",
        userId: "u-1",
        pageId: "p-1",
        graphId: "wiki-compose-research",
        backend: "zedi_managed",
        tier: "free",
        db: {} as Database,
        feature: "wiki_compose:research",
        userEmail: "alice@example.com",
        ...overrides,
      } satisfies GraphContext,
    },
  };
}

beforeEach(() => {
  searchUserWikiPages.mockReset();
});
afterEach(() => {
  searchUserWikiPages.mockReset();
});

describe("wikiSearchTool", () => {
  it("reports missing_graph_context when called without configurable", async () => {
    const raw = await wikiSearchTool.invoke({ query: "ripgrep" });
    expect(typeof raw).toBe("string");
    const parsed = JSON.parse(raw as string) as { ok: boolean; error?: string };
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toBe("missing_graph_context");
  });

  it("forwards userId / userEmail and maps service hits to wiki sources", async () => {
    searchUserWikiPages.mockResolvedValueOnce([
      {
        pageId: "page-1",
        noteId: "note-1",
        title: "Alpha",
        contentPreview: "preview",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
    const raw = await wikiSearchTool.invoke(
      { query: "alpha", limit: 7 },
      ctxConfig({ userId: "u-7", userEmail: "u7@x.com" }),
    );
    expect(searchUserWikiPages).toHaveBeenCalledWith(
      expect.anything(),
      "u-7",
      "u7@x.com",
      "alpha",
      "shared",
      7,
    );
    const parsed = JSON.parse(raw as string) as {
      ok: boolean;
      results: Array<{ id: string; kind: string; pageId: string; noteId: string; title: string }>;
    };
    expect(parsed.ok).toBe(true);
    expect(parsed.results).toEqual([
      { id: "wiki:page-1", kind: "wiki", title: "Alpha", pageId: "page-1", noteId: "note-1", snippet: "preview" },
    ]);
  });

  it("returns an error envelope when the service throws", async () => {
    searchUserWikiPages.mockRejectedValueOnce(new Error("db down"));
    const raw = await wikiSearchTool.invoke({ query: "x" }, ctxConfig());
    const parsed = JSON.parse(raw as string) as { ok: boolean; error?: string; results: unknown[] };
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toBe("db down");
    expect(parsed.results).toEqual([]);
  });
});
