/**
 * issue #949 受け入れ条件 #4:
 * 「resume で approvedResearch が state に反映される」。
 *
 * Drives the graph to interrupt at `human_review_research`, then resumes with
 * a structured `{ approvedSourceIds, rejectedSourceIds }` payload and asserts
 * that the final state's `approvedResearch` and `rejectedResearch` arrays
 * reflect the choice.
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
import { getRegisteredGraph } from "../../../../agents/registry/graphRegistry.js";
import type { GraphContext } from "../../../../agents/core/types/graphContext.js";
import type { Database } from "../../../../types/index.js";
import { Command, MemorySaver } from "@langchain/langgraph";

function fakeContext(): GraphContext {
  return {
    threadId: "thread-resume",
    sessionId: "thread-resume",
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

describe("researchLoopSubgraph — resume projects approvedResearch", () => {
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

  it("populates approvedResearch / rejectedResearch from the resume payload", async () => {
    const pending = [
      { id: "web:a", kind: "web" as const, title: "A", url: "https://a/" },
      { id: "web:b", kind: "web" as const, title: "B", url: "https://b/" },
      { id: "wiki:p", kind: "wiki" as const, title: "P", pageId: "p", noteId: "n" },
    ];

    planQueries.mockImplementation(async () => ({
      queries: [{ id: "q1", query: "init", channels: ["web"] }],
      maxIterations: 3,
      iteration: 0,
      lastEvaluation: null,
      exitReason: null,
      phase: "research:plan",
    }));
    webSearch.mockImplementation(async () => ({ pendingSources: pending.slice(0, 2) }));
    wikiSearch.mockImplementation(async () => ({ pendingSources: pending.slice(2) }));
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

    // GraphRunner.resume goes through `invoke` internally; we drive the same
    // sequence here so we can read the final compiled state after resume.
    // GraphRunner.resume を経由しつつ、最終 state を読むために自前で
    // compiled graph を組み立てる（registry + checkpointer 経由は同じ）。
    const registered = getRegisteredGraph(RESEARCH_GRAPH_ID);
    if (!registered) throw new Error("graph not registered");
    const checkpointer = new MemorySaver();
    const compiled = registered.factory({ checkpointer }) as {
      invoke: (input: unknown, options: unknown) => Promise<unknown>;
      getState?: (options: unknown) => Promise<unknown>;
    };

    const config = {
      configurable: {
        thread_id: "thread-resume",
        zediGraphContext: fakeContext(),
      },
      recursionLimit: 60,
    };

    // 1st invoke runs to the interrupt. LangGraph 1.x surfaces interrupts as
    // a `__interrupt__: Interrupt[]` array on the returned state instead of
    // throwing, so we check for that shape.
    // LangGraph 1.x では interrupt は throw されず、結果 state の
    // `__interrupt__` 配列に乗る。throw 経路ではなく field を見る。
    const firstResult = (await compiled.invoke(
      { messages: [{ role: "user", content: "brief" }] },
      config,
    )) as { __interrupt__?: Array<{ value: unknown }> };
    expect(Array.isArray(firstResult.__interrupt__)).toBe(true);
    expect(firstResult.__interrupt__?.length).toBeGreaterThan(0);

    // 2nd invoke resumes with the approval payload.
    const finalState = (await compiled.invoke(
      new Command({
        resume: {
          approvedSourceIds: ["web:a", "wiki:p"],
          rejectedSourceIds: ["web:b"],
        },
      }),
      config,
    )) as {
      approvedResearch: Array<{ id: string }>;
      rejectedResearch: Array<{ id: string }>;
      phase: string;
    };

    expect(finalState.approvedResearch.map((s) => s.id).sort()).toEqual(["web:a", "wiki:p"].sort());
    expect(finalState.rejectedResearch.map((s) => s.id)).toEqual(["web:b"]);
    expect(finalState.phase).toBe("completed");
  });

  it("rejects an ill-formed resume payload", async () => {
    planQueries.mockImplementation(async () => ({
      queries: [{ id: "q1", query: "init", channels: ["web"] }],
      maxIterations: 3,
      iteration: 0,
      lastEvaluation: null,
      exitReason: null,
      phase: "research:plan",
    }));
    webSearch.mockImplementation(async () => ({ pendingSources: [] }));
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
          id: "batch-bad",
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
    const checkpointer = new MemorySaver();
    const ctx = fakeContext();
    // Use a fresh thread id so interrupt/resume state doesn't collide with
    // the previous test in the same MemorySaver instance.
    // テスト間で thread_id を分けて checkpointer 衝突を避ける。
    const isolated = { ...ctx, threadId: "thread-resume-bad", sessionId: "thread-resume-bad" };

    // First call: should interrupt.
    const first = await runner.invoke(
      {
        graphId: RESEARCH_GRAPH_ID,
        context: isolated,
        checkpointer,
        recursionLimit: 60,
      },
      { kind: "input", value: { messages: [{ role: "user", content: "brief" }] } },
    );
    expect(first.status).toBe("interrupted");

    // Resume with a payload that fails `researchResumeSchema` validation.
    const bad = await runner.resume(
      { graphId: RESEARCH_GRAPH_ID, context: isolated, checkpointer, recursionLimit: 60 },
      { approvedSourceIds: [42] as unknown as string[] },
    );
    expect(bad.status).toBe("failed");
    expect(bad.error).toBeDefined();
  });
});
