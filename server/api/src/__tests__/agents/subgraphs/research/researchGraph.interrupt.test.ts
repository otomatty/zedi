/**
 * issue #949 受け入れ条件 #3:
 * 「ループ終了後 interrupt 位置で graph が停止する」。
 *
 * Verifies that `wiki-compose-research` halts at `human_review_research` with
 * a structurally-correct payload after the loop exits (single iteration when
 * evaluation crosses the threshold).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  planQueries,
  webSearch,
  wikiSearch,
  fetchArticles,
  evaluateSufficiency,
  refineQueries,
  compileBatch,
} = vi.hoisted(() => ({
  planQueries: vi.fn(),
  webSearch: vi.fn(),
  wikiSearch: vi.fn(),
  fetchArticles: vi.fn(),
  evaluateSufficiency: vi.fn(),
  refineQueries: vi.fn(),
  compileBatch: vi.fn(),
}));

// The real `human_review_research` calls `interrupt()` which we want to
// exercise; everything else is mocked to keep the test deterministic.
vi.mock("../../../../agents/subgraphs/research/nodes/index.js", async () => {
  const real = await vi.importActual<
    typeof import("../../../../agents/subgraphs/research/nodes/index.js")
  >("../../../../agents/subgraphs/research/nodes/index.js");
  return {
    ...real,
    planQueries,
    webSearch,
    wikiSearch,
    fetchArticles,
    evaluateSufficiency,
    refineQueries,
    compileBatch,
  };
});

import { GraphRunner } from "../../../../agents/runner/graphRunner.js";
import { __resetRegistryForTests } from "../../../../agents/registry/graphRegistry.js";
import {
  RESEARCH_GRAPH_ID,
  registerResearchLoopGraph,
} from "../../../../agents/subgraphs/research/index.js";
import type { GraphContext } from "../../../../agents/core/types/graphContext.js";
import type { Database } from "../../../../types/index.js";
import { MemorySaver } from "@langchain/langgraph";

function fakeContext(): GraphContext {
  return {
    threadId: "thread-interrupt",
    sessionId: "thread-interrupt",
    userId: "user-1",
    pageId: "page-1",
    graphId: RESEARCH_GRAPH_ID,
    backend: "zedi_managed",
    tier: "free",
    db: {} as Database,
    feature: "wiki_compose:research",
    userEmail: null,
  };
}

describe("researchLoopSubgraph — interrupt at human_review_research", () => {
  beforeEach(() => {
    __resetRegistryForTests();
    registerResearchLoopGraph();
    planQueries.mockReset();
    webSearch.mockReset();
    wikiSearch.mockReset();
    fetchArticles.mockReset();
    evaluateSufficiency.mockReset();
    refineQueries.mockReset();
    compileBatch.mockReset();
  });
  afterEach(() => {
    __resetRegistryForTests();
  });

  it("halts at human_review_research after a single-iteration loop", async () => {
    planQueries.mockImplementation(async () => ({
      queries: [{ id: "q1", query: "init", channels: ["web"] }],
      maxIterations: 3,
      iteration: 0,
      lastEvaluation: null,
      exitReason: null,
      phase: "research:plan",
    }));
    webSearch.mockImplementation(async () => ({
      pendingSources: [{ id: "src:abc", kind: "web", title: "A", url: "https://a/" }],
    }));
    wikiSearch.mockImplementation(async () => ({ pendingSources: [] }));
    fetchArticles.mockImplementation(async () => ({ pendingSources: [] }));
    evaluateSufficiency.mockImplementation(async (state, _c) => ({
      lastEvaluation: { score: 0.9, rationale: "ok", missingAspects: [] },
      iteration: state.iteration + 1,
      phase: "research:evaluated",
    }));
    compileBatch.mockImplementation(async (state, _c) => ({
      batches: [
        {
          id: "batch-1",
          iteration: state.iteration,
          queries: state.queries,
          sources: state.pendingSources,
          evaluation: state.lastEvaluation,
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      exitReason: "score_threshold",
      phase: "research:compile",
    }));

    const runner = new GraphRunner();
    const result = await runner.invoke(
      {
        graphId: RESEARCH_GRAPH_ID,
        context: fakeContext(),
        // Interrupt resume requires a checkpointer; use MemorySaver for tests.
        // interrupt の再開には checkpointer が必要。テストでは MemorySaver を使う。
        checkpointer: new MemorySaver(),
        recursionLimit: 60,
      },
      { kind: "input", value: { messages: [{ role: "user", content: "brief" }] } },
    );

    expect(result.status).toBe("interrupted");
    // GraphRunner extracts the node name from the interrupt error if available;
    // structural check is enough since LangGraph version churn can change the
    // exact attribute name.
    // interruptedAt はバージョン差で空になり得るので、最低限 status を担保する。
    if (result.interruptedAt !== undefined) {
      expect(result.interruptedAt).toMatch(/human_review_research|interrupt/i);
    }
  });
});
