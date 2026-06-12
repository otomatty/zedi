import { describe, expect, it } from "vitest";
import { formatResearchForIngest } from "../../../../agents/graphs/ingest/nodes/formatResearchForIngest.js";
import type { IngestPlannerStateType } from "../../../../agents/graphs/ingest/state.js";

function baseState(): IngestPlannerStateType {
  return {
    messages: [],
    phase: "ingest:prepare",
    pageId: "",
    userId: "u1",
    article: { title: "T", url: "https://a/", excerpt: "body" },
    candidates: [],
    userSchema: null,
    ingestPlan: null,
    iteration: 1,
    maxIterations: 3,
    queries: [],
    pendingSources: [],
    lastEvaluation: null,
    exitReason: null,
    batches: [
      {
        id: "b1",
        iteration: 1,
        queries: [],
        sources: [],
        evaluation: { score: 0.9, sufficient: true, rationale: "ok", missingAspects: [] },
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ],
    approvedResearch: [
      {
        id: "src:1",
        kind: "fetched",
        title: "Research hit",
        url: "https://hit/",
        excerpt: "Details from web",
      },
    ],
    rejectedResearch: [],
    additionalRequest: null,
  };
}

describe("formatResearchForIngest", () => {
  it("includes approved sources and evaluation in the prompt block", () => {
    const block = formatResearchForIngest(baseState());
    expect(block).toContain("APPROVED RESEARCH SOURCES");
    expect(block).toContain("src:1");
    expect(block).toContain("Research hit");
    expect(block).toContain("RESEARCH EVALUATION");
    expect(block).toContain("score: 0.9");
  });

  it("returns empty string when no research output exists", () => {
    const state = baseState();
    state.approvedResearch = [];
    state.batches = [];
    expect(formatResearchForIngest(state)).toBe("");
  });
});
