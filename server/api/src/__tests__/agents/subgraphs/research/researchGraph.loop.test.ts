/**
 * issue #949 受け入れ条件 #1:
 * 「subgraph が maxIterations まで自律ループする Vitest がある」。
 *
 * Tests that the compiled `wiki-compose-research` graph loops exactly
 * `maxIterations` times when `evaluate_sufficiency` keeps returning a low
 * score, and exits at `compile_batch` with `exitReason: "max_iterations"`.
 *
 * Strategy: mock the nodes barrel (`./nodes/index.js`) so each LLM-bound node
 * is a deterministic `vi.fn()`. We invoke the real `registerResearchLoopGraph`
 * factory through `GraphRunner` so edges + reducers + checkpointer integration
 * are exercised end-to-end, but the network-touching bits are replaced.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `vi.mock` is hoisted to the top of the module, so the captured `vi.fn()`
// instances must be hoisted alongside it via `vi.hoisted()`. Otherwise the
// factory closes over `undefined` variables.
// vi.mock のホイストに合わせて、参照する vi.fn() も vi.hoisted で揚げる。
const {
  planQueries,
  webSearch,
  wikiSearch,
  fetchArticles,
  evaluateSufficiency,
  refineQueries,
  compileBatch,
  humanReviewResearch,
} = vi.hoisted(() => ({
  planQueries: vi.fn(),
  webSearch: vi.fn(),
  wikiSearch: vi.fn(),
  fetchArticles: vi.fn(),
  evaluateSufficiency: vi.fn(),
  refineQueries: vi.fn(),
  compileBatch: vi.fn(),
  humanReviewResearch: vi.fn(),
}));

vi.mock("../../../../agents/subgraphs/research/nodes/index.js", async () => {
  // shouldRefine is the *real* pure function so the conditional edge actually
  // routes by the values we feed in via the mocked evaluate_sufficiency.
  // shouldRefine だけは本物を呼び、条件分岐の挙動を実際に確かめる。
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
    humanReviewResearch,
  };
});

import { GraphRunner } from "../../../../agents/runner/graphRunner.js";
import {
  __resetRegistryForTests,
  registerGraph,
} from "../../../../agents/registry/graphRegistry.js";
import {
  RESEARCH_GRAPH_ID,
  registerResearchLoopGraph,
} from "../../../../agents/subgraphs/research/index.js";
import type { GraphContext } from "../../../../agents/core/types/graphContext.js";
import type { Database } from "../../../../types/index.js";

function fakeContext(graphId: string): GraphContext {
  return {
    threadId: "thread-loop",
    sessionId: "thread-loop",
    userId: "user-1",
    pageId: "page-1",
    graphId,
    backend: "zedi_managed",
    tier: "free",
    db: {} as Database,
    feature: "wiki_compose:research",
    userEmail: null,
    contentLocale: "ja",
  };
}

describe("researchLoopSubgraph — autonomous loop", () => {
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
    humanReviewResearch.mockReset();
  });
  afterEach(() => {
    __resetRegistryForTests();
  });

  it("loops exactly `maxIterations` times when evaluation never reaches threshold", async () => {
    const maxIterations = 3;

    planQueries.mockImplementation(async (_state, _config) => ({
      queries: [{ id: "q-init", query: "init", channels: ["web"] }],
      maxIterations,
      iteration: 0,
      lastEvaluation: null,
      exitReason: null,
      phase: "research:plan",
    }));
    webSearch.mockImplementation(async (_state, _config) => ({
      pendingSources: [{ id: "src:a", kind: "web", title: "A", url: "https://a/" }],
    }));
    wikiSearch.mockImplementation(async (_state, _config) => ({ pendingSources: [] }));
    fetchArticles.mockImplementation(async (_state, _config) => ({ pendingSources: [] }));

    // evaluate_sufficiency post-increments iteration; we mirror that here.
    let evaluatedTimes = 0;
    evaluateSufficiency.mockImplementation(async (state, _config) => {
      evaluatedTimes += 1;
      return {
        lastEvaluation: { score: 0.1, sufficient: false, rationale: "weak", missingAspects: ["x"] },
        iteration: state.iteration + 1,
        phase: "research:evaluated",
      };
    });

    refineQueries.mockImplementation(async (state, _config) => ({
      queries: [
        { id: `q-${state.iteration}`, query: `refined-${state.iteration}`, channels: ["web"] },
      ],
      phase: "research:refine",
    }));

    compileBatch.mockImplementation(async (state, _config) => ({
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
      exitReason: "max_iterations",
      phase: "research:compile",
    }));

    // human_review_research interrupts; we shortcut here by returning a normal
    // update so the loop test focuses on iteration accounting, not HITL.
    // HITL は別テストで検証する。ループ計測のため interrupt を回避。
    humanReviewResearch.mockImplementation(async (_state, _config) => ({
      approvedResearch: [],
      rejectedResearch: [],
      phase: "completed",
    }));

    const runner = new GraphRunner();
    const result = await runner.invoke(
      {
        graphId: RESEARCH_GRAPH_ID,
        context: fakeContext(RESEARCH_GRAPH_ID),
        checkpointer: false,
        recursionLimit: 60,
      },
      { kind: "input", value: { messages: [{ role: "user", content: "brief" }] } },
    );

    expect(result.status).toBe("completed");
    // evaluate runs N times where N === maxIterations (initial run + each refine).
    // evaluate は maxIterations 回走る（初回 + refine ごと）。
    expect(evaluatedTimes).toBe(maxIterations);
    expect(refineQueries).toHaveBeenCalledTimes(maxIterations - 1);
    expect(compileBatch).toHaveBeenCalledTimes(1);
    expect(humanReviewResearch).toHaveBeenCalledTimes(1);
  });

  it("exits early when evaluation crosses the 0.75 threshold", async () => {
    planQueries.mockImplementation(async (_s, _c) => ({
      queries: [{ id: "q1", query: "init", channels: ["web"] }],
      maxIterations: 5,
      iteration: 0,
      lastEvaluation: null,
      exitReason: null,
      phase: "research:plan",
    }));
    webSearch.mockImplementation(async () => ({ pendingSources: [] }));
    wikiSearch.mockImplementation(async () => ({ pendingSources: [] }));
    fetchArticles.mockImplementation(async () => ({ pendingSources: [] }));
    evaluateSufficiency.mockImplementation(async (state, _c) => ({
      lastEvaluation: { score: 0.9, sufficient: true, rationale: "great", missingAspects: [] },
      iteration: state.iteration + 1,
      phase: "research:evaluated",
    }));
    refineQueries.mockImplementation(async () => ({ queries: [], phase: "research:refine" }));
    compileBatch.mockImplementation(async (state, _c) => ({
      batches: [
        {
          id: "batch-early",
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
    humanReviewResearch.mockImplementation(async () => ({
      approvedResearch: [],
      rejectedResearch: [],
      phase: "completed",
    }));

    const runner = new GraphRunner();
    const result = await runner.invoke(
      {
        graphId: RESEARCH_GRAPH_ID,
        context: fakeContext(RESEARCH_GRAPH_ID),
        checkpointer: false,
        recursionLimit: 60,
      },
      { kind: "input", value: { messages: [{ role: "user", content: "brief" }] } },
    );

    expect(result.status).toBe("completed");
    // Single iteration: evaluate once, refine never, compile once.
    expect(evaluateSufficiency).toHaveBeenCalledTimes(1);
    expect(refineQueries).not.toHaveBeenCalled();
    expect(compileBatch).toHaveBeenCalledTimes(1);
  });
});

// Lint guard so a stray top-level registerGraph call cannot pollute the registry.
void registerGraph;
