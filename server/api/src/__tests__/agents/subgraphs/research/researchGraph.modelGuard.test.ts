/**
 * issue #949 受け入れ条件 #6:
 * 「全 LLM 呼び出しが `ZediChatModel` 経由」。
 *
 * Mocks the `createZediChatModel` factory and asserts that every LLM-bound
 * node (`plan_queries`, `evaluate_sufficiency`, `refine_queries`) calls the
 * factory at least once during a real (non-mocked-node) loop. The tools are
 * still mocked at the barrel level so we don't make network calls.
 *
 * Note: this does NOT test for the *absence* of other LLM clients — that's a
 * code-review concern. The factory call count check catches the most common
 * regression (a node reaching for a provider client directly).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createZediChatModel } = vi.hoisted(() => ({ createZediChatModel: vi.fn() }));

vi.mock("../../../../agents/core/llm/wikiComposeModelId.js", () => ({
  WIKI_COMPOSE_MODEL_ID: "google:gemini-3.5-flash",
  resolveWikiComposeModelId: vi.fn(async () => "google:gemini-3.5-flash"),
}));

vi.mock("../../../../agents/core/llm/modelFactory.js", async () => {
  const actual = await vi.importActual<
    typeof import("../../../../agents/core/llm/modelFactory.js")
  >("../../../../agents/core/llm/modelFactory.js");
  return {
    ...actual,
    createZediChatModel: (...args: unknown[]) =>
      createZediChatModel(...(args as Parameters<typeof actual.createZediChatModel>)),
  };
});

// Mock the tools so they don't try to hit anything real. We test their bodies
// individually elsewhere.
// tools は別テストで検証するので、本テストでは empty 応答で済ます。
vi.mock("../../../../agents/core/tools/webSearch.js", async () => {
  const { tool } = await import("@langchain/core/tools");
  const { z } = await import("zod");
  return {
    WEB_SEARCH_TOOL_NAME: "web_search",
    webSearchInputSchema: z.object({ query: z.string(), limit: z.number().optional() }),
    webSearchTool: tool(async () => JSON.stringify({ ok: true, results: [] }), {
      name: "web_search",
      description: "stub",
      schema: z.object({ query: z.string(), limit: z.number().optional() }),
    }),
  };
});
vi.mock("../../../../agents/core/tools/wikiSearch.js", async () => {
  const { tool } = await import("@langchain/core/tools");
  const { z } = await import("zod");
  return {
    WIKI_SEARCH_TOOL_NAME: "wiki_search",
    wikiSearchInputSchema: z.object({ query: z.string(), limit: z.number().optional() }),
    wikiSearchTool: tool(async () => JSON.stringify({ ok: true, results: [] }), {
      name: "wiki_search",
      description: "stub",
      schema: z.object({ query: z.string(), limit: z.number().optional() }),
    }),
  };
});
vi.mock("../../../../agents/core/tools/fetchArticle.js", async () => {
  const { tool } = await import("@langchain/core/tools");
  const { z } = await import("zod");
  return {
    FETCH_ARTICLE_TOOL_NAME: "fetch_article",
    fetchArticleInputSchema: z.object({ url: z.string(), previewLength: z.number().optional() }),
    fetchArticleTool: tool(async () => JSON.stringify({ ok: false, url: "", error: "stub" }), {
      name: "fetch_article",
      description: "stub",
      schema: z.object({ url: z.string(), previewLength: z.number().optional() }),
    }),
  };
});

import { GraphRunner } from "../../../../agents/runner/graphRunner.js";
import { __resetRegistryForTests } from "../../../../agents/registry/graphRegistry.js";
import {
  RESEARCH_GRAPH_ID,
  registerResearchLoopGraph,
} from "../../../../agents/subgraphs/research/index.js";
import { MemorySaver } from "@langchain/langgraph";
import type { GraphContext } from "../../../../agents/core/types/graphContext.js";
import type { Database } from "../../../../types/index.js";

function fakeContext(): GraphContext {
  return {
    threadId: "thread-guard",
    sessionId: "thread-guard",
    userId: "user-1",
    pageId: "page-1",
    graphId: RESEARCH_GRAPH_ID,
    backend: "zedi_managed",
    tier: "free",
    db: {} as Database,
    feature: "wiki_compose:research",
    userEmail: null,
    contentLocale: "ja",
  };
}

/** Build a fake ZediChatModel-shaped object with a `withStructuredOutput` chain. */
function fakeModel(structuredReturn: () => Promise<unknown>) {
  const runnable = {
    invoke: vi.fn(async (_messages: unknown) => structuredReturn()),
  };
  return {
    withStructuredOutput: vi.fn((_schema: unknown, _opts?: unknown) => runnable),
  };
}

describe("researchLoopSubgraph — all LLM calls go through ZediChatModel", () => {
  beforeEach(() => {
    __resetRegistryForTests();
    registerResearchLoopGraph();
    createZediChatModel.mockReset();
  });
  afterEach(() => {
    __resetRegistryForTests();
  });

  it("invokes createZediChatModel for plan, evaluate, and refine", async () => {
    // Plan returns 2 queries (1 web, 1 wiki) so web_search + wiki_search both fire.
    // Evaluate returns score 0.1 forcing one refine, then evaluate returns 0.9.
    let evaluateCall = 0;
    createZediChatModel.mockImplementation(async (input: { feature: string }) => {
      if (input.feature.endsWith(":plan")) {
        return fakeModel(async () => ({
          queries: [
            { query: "q-web", channels: ["web"] },
            { query: "q-wiki", channels: ["wiki"] },
          ],
        }));
      }
      if (input.feature.endsWith(":evaluate")) {
        evaluateCall += 1;
        const score = evaluateCall >= 2 ? 0.9 : 0.1;
        return fakeModel(async () => ({
          score,
          rationale: "auto",
          missingAspects: score < 0.75 ? ["x"] : [],
        }));
      }
      if (input.feature.endsWith(":refine")) {
        return fakeModel(async () => ({
          queries: [{ query: "q-refined", channels: ["web"] }],
        }));
      }
      throw new Error(`unexpected feature ${input.feature}`);
    });

    const runner = new GraphRunner();
    await runner.invoke(
      {
        graphId: RESEARCH_GRAPH_ID,
        context: fakeContext(),
        checkpointer: new MemorySaver(),
        recursionLimit: 60,
      },
      { kind: "input", value: { messages: [{ role: "user", content: "brief" }] } },
    );

    const features = createZediChatModel.mock.calls.map(
      (call) => (call[0] as { feature: string }).feature,
    );
    expect(features).toContain("wiki_compose:research:plan");
    expect(features).toContain("wiki_compose:research:evaluate");
    expect(features).toContain("wiki_compose:research:refine");
    // No raw aiProviders / OpenAI / Anthropic clients should be imported by the
    // research-loop nodes; only `createZediChatModel` is mocked. If a node ever
    // imports a provider SDK directly, this test will still pass — code review
    // is the second line of defence.
  });
});
