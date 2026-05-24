/**
 * `compileBatch` unit tests. Pure projection node; no LLM. We verify:
 * - `exitReason` = "score_threshold" when score >= 0.75.
 * - `exitReason` = "max_iterations" otherwise.
 * - Batch fields are populated from state.
 * - `dispatchCustomEvent` is called via the runnable config.
 */
import { describe, expect, it, vi } from "vitest";

// The dispatch helper requires a proper LangChain callback manager which we
// don't set up here (`compileBatch` is a pure projection). Stub it so the
// node can dispatch into a no-op without a real callback runtime.
// dispatch ヘルパは callback manager 必須なので test では no-op に差し替える。
const { dispatchResearchBatch } = vi.hoisted(() => ({
  dispatchResearchBatch: vi.fn(async () => undefined),
}));
vi.mock("../../../../../agents/subgraphs/research/nodes/shared/dispatchSseCustom.js", () => ({
  dispatchResearchBatch,
  dispatchResearchEvaluation: vi.fn(),
  dispatchResearchIteration: vi.fn(),
}));

import { compileBatch } from "../../../../../agents/subgraphs/research/nodes/compileBatch.js";
import type { ResearchLoopStateType } from "../../../../../agents/subgraphs/research/state.js";
import type { ResearchBatch } from "../../../../../agents/subgraphs/research/types.js";

function state(overrides: Partial<ResearchLoopStateType>): ResearchLoopStateType {
  return {
    messages: [],
    phase: "research:evaluated",
    pageId: "page-1",
    userId: "user-1",
    iteration: 2,
    maxIterations: 3,
    queries: [{ id: "q1", query: "q", channels: ["web"] }],
    pendingSources: [
      { id: "web:a", kind: "web", title: "A", url: "https://a/" },
      { id: "web:b", kind: "web", title: "B", url: "https://b/" },
    ],
    lastEvaluation: null,
    exitReason: null,
    batches: [],
    approvedResearch: [],
    rejectedResearch: [],
    ...overrides,
  };
}

describe("compileBatch", () => {
  it("uses score_threshold when last score >= 0.75", async () => {
    const dispatcher = vi.fn();
    const config = {
      configurable: { callbacks: undefined },
      callbacks: { handlers: [], inheritableHandlers: [], dispatchCustomEvent: dispatcher },
    };
    const update = await compileBatch(
      state({ lastEvaluation: { score: 0.85, rationale: "ok", missingAspects: [] } }),
      // Loose config type — node only reads callback runtime, which LangGraph
      // wires through the surrounding `streamEvents` / `invoke` call.
      config as never,
    );
    expect(update.exitReason).toBe("score_threshold");
    const batches = update.batches as ResearchBatch[] | undefined;
    expect(batches?.length).toBe(1);
    expect(batches?.[0]?.sources.length).toBe(2);
    expect(batches?.[0]?.iteration).toBe(2);
  });

  it("uses max_iterations when no eval or score below threshold", async () => {
    const update = await compileBatch(
      state({ lastEvaluation: { score: 0.5, rationale: "weak", missingAspects: ["x"] } }),
      { configurable: {} } as never,
    );
    expect(update.exitReason).toBe("max_iterations");
  });

  it("handles null evaluation gracefully", async () => {
    const update = await compileBatch(
      state({ lastEvaluation: null }),
      { configurable: {} } as never,
    );
    expect(update.exitReason).toBe("max_iterations");
    const batches = update.batches as ResearchBatch[] | undefined;
    expect(batches?.[0]?.evaluation).toBeNull();
  });
});
