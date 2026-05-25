/**
 * Ingest planner graph (#952) — research subgraph wiring + routing tests.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  prepareIngest,
  planIngest,
  planQueries,
  webSearch,
  wikiSearch,
  fetchArticles,
  evaluateSufficiency,
  refineQueries,
  compileBatch,
} = vi.hoisted(() => ({
  prepareIngest: vi.fn(),
  planIngest: vi.fn(),
  planQueries: vi.fn(),
  webSearch: vi.fn(),
  wikiSearch: vi.fn(),
  fetchArticles: vi.fn(),
  evaluateSufficiency: vi.fn(),
  refineQueries: vi.fn(),
  compileBatch: vi.fn(),
}));

vi.mock("../../../../agents/graphs/ingest/nodes/index.js", async () => {
  const real = await vi.importActual<
    typeof import("../../../../agents/graphs/ingest/nodes/index.js")
  >("../../../../agents/graphs/ingest/nodes/index.js");
  return { ...real, prepareIngest, planIngest };
});

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
  INGEST_PLANNER_GRAPH_ID,
  registerIngestPlannerGraph,
} from "../../../../agents/graphs/ingest/index.js";
import type { GraphContext } from "../../../../agents/core/types/graphContext.js";
import type { Database } from "../../../../types/index.js";
import { MemorySaver } from "@langchain/langgraph";

function fakeContext(threadId: string): GraphContext {
  return {
    threadId,
    sessionId: threadId,
    userId: "user-1",
    pageId: "",
    graphId: INGEST_PLANNER_GRAPH_ID,
    backend: "zedi_managed",
    tier: "free",
    db: {} as Database,
    feature: "ingest_graph:test",
    userEmail: null,
  };
}

const articleInput = {
  title: "Test Article",
  url: "https://example.com/a",
  excerpt: "Body text about testing.",
};

const candidatesInput = [{ id: "page-1", title: "Existing", excerpt: "Old content" }];

function defaultMocks() {
  prepareIngest.mockImplementation(async () => ({
    article: articleInput,
    candidates: candidatesInput,
    phase: "ingest:prepare",
  }));

  planQueries.mockImplementation(async () => ({
    queries: [{ id: "q1", query: "topic", channels: ["web"] }],
    maxIterations: 3,
    iteration: 0,
    phase: "research:plan",
  }));
  webSearch.mockImplementation(async () => ({
    pendingSources: [{ id: "src:1", kind: "web", title: "Hit", url: "https://hit/" }],
  }));
  wikiSearch.mockImplementation(async () => ({ pendingSources: [] }));
  fetchArticles.mockImplementation(async () => ({ pendingSources: [] }));
  evaluateSufficiency.mockImplementation(async (state: { iteration: number }) => ({
    lastEvaluation: { score: 0.9, rationale: "ok", missingAspects: [] },
    iteration: state.iteration + 1,
    phase: "research:evaluated",
  }));
  compileBatch.mockImplementation(
    async (state: {
      iteration: number;
      queries: unknown[];
      pendingSources: unknown[];
      lastEvaluation: unknown;
    }) => ({
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
    }),
  );

  planIngest.mockImplementation(async () => ({
    ingestPlan: {
      action: "merge",
      reason: "Same topic",
      targetPageId: "page-1",
    },
    phase: "ingest:planned",
  }));
}

describe("ingestPlannerGraph — research subgraph connection", () => {
  beforeEach(() => {
    __resetRegistryForTests();
    registerIngestPlannerGraph();
    prepareIngest.mockReset();
    planIngest.mockReset();
    planQueries.mockReset();
    webSearch.mockReset();
    wikiSearch.mockReset();
    fetchArticles.mockReset();
    evaluateSufficiency.mockReset();
    refineQueries.mockReset();
    compileBatch.mockReset();
    defaultMocks();
  });

  afterEach(() => {
    __resetRegistryForTests();
  });

  it("runs prepare_ingest then research nodes before halting at human_review_research", async () => {
    const runner = new GraphRunner();
    const result = await runner.invoke(
      {
        graphId: INGEST_PLANNER_GRAPH_ID,
        context: fakeContext("thread-ingest-1"),
        checkpointer: new MemorySaver(),
        recursionLimit: 60,
      },
      {
        kind: "input",
        value: { article: articleInput, candidates: candidatesInput },
      },
    );

    expect(result.status).toBe("interrupted");
    expect(prepareIngest).toHaveBeenCalledTimes(1);
    expect(planQueries).toHaveBeenCalledTimes(1);
    expect(compileBatch).toHaveBeenCalledTimes(1);
    expect(planIngest).not.toHaveBeenCalled();
  });

  it("reaches plan_ingest after research HITL resume", async () => {
    const checkpointer = new MemorySaver();
    const runner = new GraphRunner();
    const ctx = fakeContext("thread-ingest-2");

    await runner.invoke(
      {
        graphId: INGEST_PLANNER_GRAPH_ID,
        context: ctx,
        checkpointer,
        recursionLimit: 60,
      },
      { kind: "input", value: { article: articleInput, candidates: candidatesInput } },
    );

    const resumed = await runner.resume(
      {
        graphId: INGEST_PLANNER_GRAPH_ID,
        context: ctx,
        checkpointer,
        recursionLimit: 60,
      },
      { approvedSourceIds: ["src:1"] },
    );

    expect(resumed.status).toBe("completed");
    expect(planIngest).toHaveBeenCalledTimes(1);
    const output = resumed.output as { ingestPlan?: { action?: string } };
    expect(output.ingestPlan?.action).toBe("merge");
  });
});
