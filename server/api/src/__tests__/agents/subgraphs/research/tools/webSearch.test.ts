/**
 * `webSearchTool` unit tests (#1033).
 * Mocks only LLM (`createZediChatModel`) and DB boundaries — not internal helpers.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WIKI_COMPOSE_MODEL_ID } from "../../../../../agents/core/llm/wikiComposeModelId.js";
import { createMockDb } from "../../../../createMockDb.js";

const { createZediChatModel } = vi.hoisted(() => ({ createZediChatModel: vi.fn() }));

vi.mock("../../../../../agents/core/llm/modelFactory.js", async () => {
  const actual = await vi.importActual<
    typeof import("../../../../../agents/core/llm/modelFactory.js")
  >("../../../../../agents/core/llm/modelFactory.js");
  return {
    ...actual,
    createZediChatModel: (...args: unknown[]) =>
      createZediChatModel(...(args as Parameters<typeof actual.createZediChatModel>)),
  };
});

import { webSearchTool } from "../../../../../agents/core/tools/webSearch.js";
import { GRAPH_CONTEXT_CONFIG_KEY } from "../../../../../agents/core/types/graphContext.js";
import type { GraphContext } from "../../../../../agents/core/types/graphContext.js";
import type { Database } from "../../../../../types/index.js";

function ctxConfig(db: Database): { configurable: Record<string, unknown> } {
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
        db,
        feature: "wiki_compose:research",
        userEmail: null,
        contentLocale: "ja",
      } satisfies GraphContext,
    },
  };
}

function fakeStructuredModel(results: { title: string; url: string; snippet?: string }[]) {
  return {
    withStructuredOutput: vi.fn(() => ({
      invoke: vi.fn(async () => ({ results })),
    })),
  };
}

beforeEach(() => {
  createZediChatModel.mockReset();
});
afterEach(() => {
  createZediChatModel.mockReset();
});

describe("webSearchTool", () => {
  it("reports missing_graph_context when called without configurable", async () => {
    const raw = await webSearchTool.invoke({ query: "ripgrep" });
    const parsed = JSON.parse(raw as string) as { ok: boolean; error?: string };
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toBe("missing_graph_context");
  });

  it("returns the documented fallback when no managed web-search model is configured", async () => {
    const { db } = createMockDb([[], []]);
    const raw = await webSearchTool.invoke(
      { query: "ripgrep" },
      ctxConfig(db as unknown as Database),
    );
    const parsed = JSON.parse(raw as string) as {
      ok: boolean;
      results: unknown[];
      note?: string;
    };
    expect(parsed.ok).toBe(true);
    expect(parsed.results).toEqual([]);
    expect(parsed.note).toBe("web_search_unavailable");
  });

  it("returns an error envelope when model resolution DB throws", async () => {
    const db = {
      select: vi.fn(() => {
        throw new Error("db unreachable");
      }),
    };
    const raw = await webSearchTool.invoke({ query: "x" }, ctxConfig(db as unknown as Database));
    const parsed = JSON.parse(raw as string) as { ok: boolean; error?: string };
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toMatch(/web_search_model_resolution_failed:db unreachable/);
  });

  it("returns structured web hits with stable src ids when LLM succeeds", async () => {
    const { db } = createMockDb([[{ id: WIKI_COMPOSE_MODEL_ID }], [{ provider: "openai" }]]);
    createZediChatModel.mockResolvedValue(
      fakeStructuredModel([
        {
          title: "Ripgrep docs",
          url: "https://example.com/rg",
          snippet: "Fast search",
        },
      ]),
    );

    const raw = await webSearchTool.invoke(
      { query: "ripgrep", limit: 3 },
      ctxConfig(db as unknown as Database),
    );
    const parsed = JSON.parse(raw as string) as {
      ok: boolean;
      results: Array<{ id: string; kind: string; title: string; url: string; snippet?: string }>;
    };

    expect(parsed.ok).toBe(true);
    expect(parsed.results).toHaveLength(1);
    expect(parsed.results[0]?.kind).toBe("web");
    expect(parsed.results[0]?.title).toBe("Ripgrep docs");
    expect(parsed.results[0]?.url).toBe("https://example.com/rg");
    expect(parsed.results[0]?.id).toMatch(/^src:[a-f0-9]{64}$/);
  });

  it("wraps LLM failures in a non-throwing error envelope", async () => {
    const { db } = createMockDb([[{ id: WIKI_COMPOSE_MODEL_ID }], [{ provider: "google" }]]);
    createZediChatModel.mockResolvedValue({
      withStructuredOutput: vi.fn(() => ({
        invoke: vi.fn(async () => {
          throw new Error("structured output failed");
        }),
      })),
    });

    const raw = await webSearchTool.invoke({ query: "x" }, ctxConfig(db as unknown as Database));
    const parsed = JSON.parse(raw as string) as { ok: boolean; error?: string; results: unknown[] };
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toBe("structured output failed");
    expect(parsed.results).toEqual([]);
  });
});
