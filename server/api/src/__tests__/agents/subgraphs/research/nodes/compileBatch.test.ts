/**
 * `compileBatch` unit tests. Pure projection node; no LLM. We verify:
 * - `exitReason` = "score_threshold" when evaluation is sufficient.
 * - `exitReason` = "safety_cap" for Wiki Compose iteration cap hits.
 * - `exitReason` = "max_iterations" for ingest iteration cap hits.
 * - Batch fields are populated from state.
 */
import { describe, expect, it, vi } from "vitest";

const { dispatchResearchBatch } = vi.hoisted(() => ({
  dispatchResearchBatch: vi.fn(async () => undefined),
}));
vi.mock("../../../../../agents/subgraphs/research/nodes/shared/dispatchSseCustom.js", () => ({
  dispatchResearchBatch,
  dispatchResearchEvaluation: vi.fn(),
  dispatchResearchIteration: vi.fn(),
}));

import {
  compileBatch,
  resolveResearchExitReason,
} from "../../../../../agents/subgraphs/research/nodes/compileBatch.js";
import { GRAPH_CONTEXT_CONFIG_KEY } from "../../../../../agents/core/types/graphContext.js";
import type { GraphContext } from "../../../../../agents/core/types/graphContext.js";
import type { ResearchLoopStateType } from "../../../../../agents/subgraphs/research/state.js";
import type { ResearchBatch } from "../../../../../agents/subgraphs/research/types.js";
import type { Database } from "../../../../../types/index.js";

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
      { id: "src:a", kind: "web", title: "A", url: "https://a/" },
      { id: "src:b", kind: "web", title: "B", url: "https://b/" },
    ],
    lastEvaluation: null,
    exitReason: null,
    batches: [],
    approvedResearch: [],
    rejectedResearch: [],
    additionalRequest: null,
    ...overrides,
  };
}

function configForGraph(graphId: string) {
  const ctx: GraphContext = {
    threadId: "t",
    sessionId: "t",
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
  return { configurable: { [GRAPH_CONTEXT_CONFIG_KEY]: ctx } };
}

describe("resolveResearchExitReason", () => {
  it("returns score_threshold when sufficient is true", () => {
    expect(
      resolveResearchExitReason(
        state({
          lastEvaluation: { score: 0.2, sufficient: true, rationale: "ok", missingAspects: [] },
        }),
        "wiki-compose",
      ),
    ).toBe("score_threshold");
  });

  it("returns safety_cap for Wiki Compose iteration cap hits", () => {
    expect(
      resolveResearchExitReason(
        state({
          lastEvaluation: {
            score: 0.2,
            sufficient: false,
            rationale: "weak",
            missingAspects: ["x"],
          },
        }),
        "wiki-compose",
      ),
    ).toBe("safety_cap");
  });

  it("returns max_iterations for ingest iteration cap hits", () => {
    expect(
      resolveResearchExitReason(
        state({
          lastEvaluation: {
            score: 0.2,
            sufficient: false,
            rationale: "weak",
            missingAspects: ["x"],
          },
        }),
        "ingest-planner",
      ),
    ).toBe("max_iterations");
  });
});

describe("compileBatch", () => {
  it("uses score_threshold when last evaluation is sufficient", async () => {
    const update = await compileBatch(
      state({
        lastEvaluation: { score: 0.85, sufficient: true, rationale: "ok", missingAspects: [] },
      }),
      configForGraph("wiki-compose") as never,
    );
    expect(update.exitReason).toBe("score_threshold");
    const batches = update.batches as ResearchBatch[] | undefined;
    expect(batches?.length).toBe(1);
    expect(batches?.[0]?.sources.length).toBe(2);
    expect(batches?.[0]?.iteration).toBe(2);
  });

  it("uses safety_cap for Wiki Compose when evaluation is insufficient", async () => {
    const update = await compileBatch(
      state({
        lastEvaluation: { score: 0.5, sufficient: false, rationale: "weak", missingAspects: ["x"] },
      }),
      configForGraph("wiki-compose-research") as never,
    );
    expect(update.exitReason).toBe("safety_cap");
  });

  it("uses max_iterations for ingest when evaluation is insufficient", async () => {
    const update = await compileBatch(
      state({
        lastEvaluation: { score: 0.5, sufficient: false, rationale: "weak", missingAspects: ["x"] },
      }),
      configForGraph("ingest-planner") as never,
    );
    expect(update.exitReason).toBe("max_iterations");
  });

  it("handles null evaluation gracefully", async () => {
    const update = await compileBatch(
      state({ lastEvaluation: null }),
      configForGraph("wiki-compose") as never,
    );
    expect(update.exitReason).toBe("safety_cap");
    const batches = update.batches as ResearchBatch[] | undefined;
    expect(batches?.[0]?.evaluation).toBeNull();
  });
});
