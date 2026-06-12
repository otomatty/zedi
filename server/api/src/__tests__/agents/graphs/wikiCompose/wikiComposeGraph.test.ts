/**
 * Wiki Compose orchestrator graph (#950, #953) — wiring + interrupt tests.
 *
 * 受け入れ条件 #1 / #6 / 技術 #1:
 * - `wikiComposeGraph` が P1 subgraph を組み込んでいる (channels 共有で表現)
 * - Brief → research → outline → draft の happy path が動く
 * - 各 interrupt 位置で halt し、resume で次フェーズに進む
 *
 * Mocks every LLM-backed node so the test pins the graph wiring rather than
 * model quality. MemorySaver is used as a checkpointer so interrupts can
 * resume on the same thread id.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  briefDialogue,
  structureDialogue,
  draftSections,
  planQueries,
  webSearch,
  wikiSearch,
  fetchArticles,
  evaluateSufficiency,
  refineQueries,
  compileBatch,
} = vi.hoisted(() => ({
  briefDialogue: vi.fn(),
  structureDialogue: vi.fn(),
  draftSections: vi.fn(),
  planQueries: vi.fn(),
  webSearch: vi.fn(),
  wikiSearch: vi.fn(),
  fetchArticles: vi.fn(),
  evaluateSufficiency: vi.fn(),
  refineQueries: vi.fn(),
  compileBatch: vi.fn(),
}));

// Real nodes preserved: humanReviewBrief, humanReviewOutline, completed,
// humanReviewResearch (interrupts must be exercised, not mocked away).
// Real interrupt/projection nodes are kept; only LLM-backed nodes are mocked.
vi.mock("../../../../agents/graphs/wikiCompose/nodes/index.js", async () => {
  const real = await vi.importActual<
    typeof import("../../../../agents/graphs/wikiCompose/nodes/index.js")
  >("../../../../agents/graphs/wikiCompose/nodes/index.js");
  return {
    ...real,
    briefDialogue,
    structureDialogue,
    draftSections,
  };
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
  WIKI_COMPOSE_GRAPH_ID,
  registerWikiComposeGraph,
} from "../../../../agents/graphs/wikiCompose/index.js";
import type { GraphContext } from "../../../../agents/core/types/graphContext.js";
import type { Database } from "../../../../types/index.js";
import { MemorySaver } from "@langchain/langgraph";

function fakeContext(threadId: string): GraphContext {
  return {
    threadId,
    sessionId: threadId,
    userId: "user-1",
    pageId: "page-1",
    graphId: WIKI_COMPOSE_GRAPH_ID,
    backend: "zedi_managed",
    tier: "free",
    db: {} as Database,
    feature: "wiki_compose:test",
    userEmail: null,
    contentLocale: "ja",
  };
}

function defaultMocks() {
  briefDialogue.mockImplementation(async () => ({
    briefQuestions: [
      {
        id: "q-1",
        question: "What scope?",
        options: [
          { id: "opt-a", label: "broad" },
          { id: "opt-b", label: "narrow" },
        ],
        required: false,
      },
    ],
    pageSnapshot: { pageId: "page-1", title: "Hello", body: "", hasContent: false },
    phase: "brief:await_user",
  }));

  planQueries.mockImplementation(async () => ({
    queries: [{ id: "q1", query: "topic", channels: ["web"] }],
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
  evaluateSufficiency.mockImplementation(async (state: { iteration: number }) => ({
    lastEvaluation: { score: 0.9, sufficient: true, rationale: "ok", missingAspects: [] },
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

  structureDialogue.mockImplementation(async () => ({
    outlineProposal: [
      { id: "sec-1", heading: "Overview", depth: 1, intent: "intro" },
      { id: "sec-2", heading: "Details", depth: 1, intent: "deep dive" },
    ],
    phase: "structure:await_user",
  }));

  draftSections.mockImplementation(async () => ({
    draftedSections: [
      {
        sectionId: "sec-1",
        heading: "Overview",
        body: "Body 1 [#1]",
        citedSourceIds: ["src:abc"],
        completedAt: "2026-01-01T00:00:01.000Z",
      },
      {
        sectionId: "sec-2",
        heading: "Details",
        body: "Body 2",
        citedSourceIds: [],
        completedAt: "2026-01-01T00:00:02.000Z",
      },
    ],
    phase: "draft:completed",
  }));
}

describe("wikiComposeGraph — orchestrator wiring", () => {
  beforeEach(() => {
    __resetRegistryForTests();
    registerWikiComposeGraph();
    briefDialogue.mockReset();
    structureDialogue.mockReset();
    draftSections.mockReset();
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

  it("halts at the Brief interrupt on first run", async () => {
    const runner = new GraphRunner();
    const result = await runner.invoke(
      {
        graphId: WIKI_COMPOSE_GRAPH_ID,
        context: fakeContext("thread-brief"),
        checkpointer: new MemorySaver(),
        recursionLimit: 120,
      },
      { kind: "input", value: { messages: [{ role: "user", content: "title: Hello" }] } },
    );

    expect(result.status).toBe("interrupted");
    expect(briefDialogue).toHaveBeenCalledTimes(1);
    // Should not have advanced past Brief before user resumes.
    // Brief 確定前に research が走らないことを担保する。
    expect(planQueries).not.toHaveBeenCalled();
  });

  it("advances to the research interrupt after Brief resume", async () => {
    const checkpointer = new MemorySaver();
    const runner = new GraphRunner();
    const ctx = fakeContext("thread-research");

    await runner.invoke(
      { graphId: WIKI_COMPOSE_GRAPH_ID, context: ctx, checkpointer, recursionLimit: 120 },
      { kind: "input", value: { messages: [{ role: "user", content: "title: Hello" }] } },
    );

    const resumed = await runner.resume(
      { graphId: WIKI_COMPOSE_GRAPH_ID, context: ctx, checkpointer, recursionLimit: 120 },
      { answers: [], appendToExisting: false },
    );

    expect(resumed.status).toBe("interrupted");
    expect(planQueries).toHaveBeenCalledTimes(1);
    expect(compileBatch).toHaveBeenCalledTimes(1);
    // Structure has not started yet — outline must wait for research approval.
    // research 承認前に structure_dialogue が呼ばれないことを担保。
    expect(structureDialogue).not.toHaveBeenCalled();
  });

  it("reaches Draft after research and outline resumes", async () => {
    const checkpointer = new MemorySaver();
    const runner = new GraphRunner();
    const ctx = fakeContext("thread-draft");

    // 1. Initial run halts at human_review_brief.
    await runner.invoke(
      { graphId: WIKI_COMPOSE_GRAPH_ID, context: ctx, checkpointer, recursionLimit: 120 },
      { kind: "input", value: { messages: [{ role: "user", content: "title: Hello" }] } },
    );
    // 2. Brief resume → halts at human_review_research.
    await runner.resume(
      { graphId: WIKI_COMPOSE_GRAPH_ID, context: ctx, checkpointer, recursionLimit: 120 },
      { answers: [], appendToExisting: false },
    );
    // 3. Research resume → halts at human_review_outline.
    const outlineHalt = await runner.resume(
      { graphId: WIKI_COMPOSE_GRAPH_ID, context: ctx, checkpointer, recursionLimit: 120 },
      { approvedSourceIds: ["src:abc"] },
    );
    expect(outlineHalt.status).toBe("interrupted");
    expect(structureDialogue).toHaveBeenCalledTimes(1);
    expect(draftSections).not.toHaveBeenCalled();

    // 4. Outline resume → runs Draft → completed.
    const finalRun = await runner.resume(
      { graphId: WIKI_COMPOSE_GRAPH_ID, context: ctx, checkpointer, recursionLimit: 120 },
      {
        sections: [
          { id: "sec-1", heading: "Overview", depth: 1, intent: "intro" },
          { id: "sec-2", heading: "Details", depth: 1, intent: "deep dive" },
        ],
      },
    );
    expect(finalRun.status).toBe("completed");
    expect(draftSections).toHaveBeenCalledTimes(1);

    const finalState = finalRun.output as {
      completion?: { markdown?: string; sections?: unknown[] };
    };
    expect(finalState.completion).toBeTruthy();
    expect(finalState.completion?.sections).toHaveLength(2);
    expect(finalState.completion?.markdown).toMatch(/Overview/);
    expect(finalState.completion?.markdown).toMatch(/Details/);
  });

  it("skips research when Brief emits zero questions (P5)", async () => {
    briefDialogue.mockImplementation(async () => ({
      briefQuestions: [],
      pageSnapshot: { pageId: "page-1", title: "Self-evident Title", body: "", hasContent: false },
      phase: "brief:await_user",
    }));

    const checkpointer = new MemorySaver();
    const runner = new GraphRunner();
    const ctx = fakeContext("thread-skip-research");

    await runner.invoke(
      { graphId: WIKI_COMPOSE_GRAPH_ID, context: ctx, checkpointer, recursionLimit: 120 },
      { kind: "input", value: { messages: [{ role: "user", content: "title: Obvious" }] } },
    );

    const afterBrief = await runner.resume(
      { graphId: WIKI_COMPOSE_GRAPH_ID, context: ctx, checkpointer, recursionLimit: 120 },
      { answers: [], appendToExisting: false },
    );

    expect(afterBrief.status).toBe("interrupted");
    expect(planQueries).not.toHaveBeenCalled();
    expect(compileBatch).not.toHaveBeenCalled();
    expect(structureDialogue).toHaveBeenCalledTimes(1);
  });

  it("halts at conflict_resolution when many sources are rejected (P5)", async () => {
    webSearch.mockImplementation(async () => ({
      pendingSources: [
        { id: "src:a", kind: "web", title: "A", url: "https://a/" },
        { id: "src:b", kind: "web", title: "B", url: "https://b/" },
        { id: "src:c", kind: "web", title: "C", url: "https://c/" },
      ],
    }));

    const checkpointer = new MemorySaver();
    const runner = new GraphRunner();
    const ctx = fakeContext("thread-conflict");

    await runner.invoke(
      { graphId: WIKI_COMPOSE_GRAPH_ID, context: ctx, checkpointer, recursionLimit: 120 },
      { kind: "input", value: { messages: [{ role: "user", content: "title: Hello" }] } },
    );
    await runner.resume(
      { graphId: WIKI_COMPOSE_GRAPH_ID, context: ctx, checkpointer, recursionLimit: 120 },
      { answers: [], appendToExisting: false },
    );

    const conflictHalt = await runner.resume(
      { graphId: WIKI_COMPOSE_GRAPH_ID, context: ctx, checkpointer, recursionLimit: 120 },
      {
        approvedSourceIds: ["src:a"],
        rejectedSourceIds: ["src:b", "src:c"],
      },
    );

    expect(conflictHalt.status).toBe("interrupted");
    const interruptState = conflictHalt.output as {
      __interrupt__?: Array<{ value: { kind?: string } }>;
    };
    expect(interruptState.__interrupt__?.[0]?.value?.kind).toBe("conflict_resolution");
    expect(structureDialogue).not.toHaveBeenCalled();

    const afterConflict = await runner.resume(
      { graphId: WIKI_COMPOSE_GRAPH_ID, context: ctx, checkpointer, recursionLimit: 120 },
      { acknowledged: true },
    );
    expect(afterConflict.status).toBe("interrupted");
    expect(structureDialogue).toHaveBeenCalledTimes(1);
  });
});
