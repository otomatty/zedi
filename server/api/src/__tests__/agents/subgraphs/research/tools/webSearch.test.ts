/**
 * `webSearchTool` unit tests. Covers:
 * - Missing graph context → JSON envelope `{ ok:false, error:"missing_graph_context" }`.
 * - No OpenAI/Google model configured → `{ ok:true, results:[], note:"web_search_unavailable" }`
 *   (the Anthropic-fallback path documented in the tool's JSDoc).
 *
 * We don't fully exercise the LLM path here — `researchGraph.modelGuard.test.ts`
 * already verifies that the tool routes through `createZediChatModel`, and the
 * structured-output shape is covered indirectly by the loop test. Adding a
 * full network mock would be brittle for marginal value.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { resolveWebSearchModelId } = vi.hoisted(() => ({ resolveWebSearchModelId: vi.fn() }));

vi.mock("../../../../../agents/core/tools/resolveWebSearchModel.js", () => ({
  resolveWebSearchModelId: (...args: unknown[]) =>
    resolveWebSearchModelId(
      ...(args as Parameters<
        typeof import("../../../../../agents/core/tools/resolveWebSearchModel.js").resolveWebSearchModelId
      >),
    ),
}));

import { webSearchTool } from "../../../../../agents/core/tools/webSearch.js";
import { GRAPH_CONTEXT_CONFIG_KEY } from "../../../../../agents/core/types/graphContext.js";
import type { GraphContext } from "../../../../../agents/core/types/graphContext.js";
import type { Database } from "../../../../../types/index.js";

function ctxConfig(): { configurable: Record<string, unknown> } {
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
        userEmail: null,
        contentLocale: "ja",
      } satisfies GraphContext,
    },
  };
}

beforeEach(() => {
  resolveWebSearchModelId.mockReset();
});
afterEach(() => {
  resolveWebSearchModelId.mockReset();
});

describe("webSearchTool", () => {
  it("reports missing_graph_context when called without configurable", async () => {
    const raw = await webSearchTool.invoke({ query: "ripgrep" });
    const parsed = JSON.parse(raw as string) as { ok: boolean; error?: string };
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toBe("missing_graph_context");
  });

  it("returns the documented fallback when no managed web-search model is configured", async () => {
    resolveWebSearchModelId.mockResolvedValueOnce(null);
    const raw = await webSearchTool.invoke({ query: "ripgrep" }, ctxConfig());
    const parsed = JSON.parse(raw as string) as {
      ok: boolean;
      results: unknown[];
      note?: string;
    };
    expect(parsed.ok).toBe(true);
    expect(parsed.results).toEqual([]);
    expect(parsed.note).toBe("web_search_unavailable");
  });

  it("returns an error envelope when model resolution itself throws", async () => {
    resolveWebSearchModelId.mockRejectedValueOnce(new Error("db unreachable"));
    const raw = await webSearchTool.invoke({ query: "x" }, ctxConfig());
    const parsed = JSON.parse(raw as string) as { ok: boolean; error?: string };
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toMatch(/web_search_model_resolution_failed:db unreachable/);
  });
});
