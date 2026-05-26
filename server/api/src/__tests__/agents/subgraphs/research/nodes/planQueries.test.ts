/**
 * `planQueries` unit tests. Focus on the additional-research detection branch
 * (codex review #956 P1): the node MUST read from `state.additionalRequest`
 * (not `state.messages[0]`) so the documented `body.input.kind` translation
 * by the route layer survives.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

// Stub dispatch helpers so the node can run without a real callback manager.
vi.mock("../../../../../agents/subgraphs/research/nodes/shared/dispatchSseCustom.js", () => ({
  dispatchResearchIteration: vi.fn(async () => undefined),
  dispatchResearchEvaluation: vi.fn(async () => undefined),
  dispatchResearchBatch: vi.fn(async () => undefined),
}));

import { planQueries } from "../../../../../agents/subgraphs/research/nodes/planQueries.js";
import { GRAPH_CONTEXT_CONFIG_KEY } from "../../../../../agents/core/types/graphContext.js";
import type { GraphContext } from "../../../../../agents/core/types/graphContext.js";
import type { Database } from "../../../../../types/index.js";
import type { ResearchLoopStateType } from "../../../../../agents/subgraphs/research/state.js";

function fakeContext(): GraphContext {
  return {
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
  };
}

function state(overrides: Partial<ResearchLoopStateType>): ResearchLoopStateType {
  return {
    messages: [],
    phase: "init",
    pageId: "p-1",
    userId: "u-1",
    iteration: 0,
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

function fakeModel(structuredReturn: () => Promise<unknown>) {
  const runnable = { invoke: vi.fn(async () => structuredReturn()) };
  return { withStructuredOutput: vi.fn(() => runnable) };
}

beforeEach(() => {
  createZediChatModel.mockReset();
  createZediChatModel.mockResolvedValue(
    fakeModel(async () => ({
      queries: [{ query: "q1", channels: ["web"] }],
    })),
  );
});
afterEach(() => {
  createZediChatModel.mockReset();
});

describe("planQueries — additional research detection", () => {
  const config = { configurable: { [GRAPH_CONTEXT_CONFIG_KEY]: fakeContext() } };

  it("clamps maxIterations to 1..5 (default 3)", async () => {
    const update = await planQueries(state({ maxIterations: 99 }), config as never);
    expect(update.maxIterations).toBe(5);
  });

  it("consumes state.additionalRequest and seeds carried-over sources", async () => {
    const update = await planQueries(
      state({
        additionalRequest: {
          instruction: "go deeper on benchmarks",
          carryOverApprovedIds: ["src:abc", "wiki:p-7"],
        },
      }),
      config as never,
    );
    // additionalRequest is cleared after first read so a defensive re-plan
    // does not loop on the same instruction.
    expect(update.additionalRequest).toBeNull();
    // pendingSources seeded from carryOverApprovedIds (id-prefix → kind).
    expect(update.pendingSources).toEqual([
      expect.objectContaining({ id: "src:abc", kind: "fetched" }),
      expect.objectContaining({ id: "wiki:p-7", kind: "wiki" }),
    ]);
  });

  it("does NOT reset pendingSources when there is no additionalRequest", async () => {
    const update = await planQueries(state({ additionalRequest: null }), config as never);
    // Standard initial run leaves pendingSources untouched.
    expect(update.pendingSources).toBeUndefined();
  });
});
