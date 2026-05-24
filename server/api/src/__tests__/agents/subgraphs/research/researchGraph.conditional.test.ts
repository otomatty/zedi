/**
 * `shouldRefine` 純粋関数の table-driven テスト。issue #949 受け入れ条件 #2:
 * 「conditional edge (refine vs compile) の単体テストがある」。
 *
 * Table-driven tests for `shouldRefine` — the conditional edge predicate after
 * `evaluate_sufficiency`. We avoid spinning up a `StateGraph` here because the
 * predicate is pure; the wiring is exercised by the loop / interrupt tests.
 */
import { describe, expect, it } from "vitest";
import { shouldRefine } from "../../../../agents/subgraphs/research/researchGraph.js";
import type { ResearchLoopStateType } from "../../../../agents/subgraphs/research/state.js";

function state(overrides: Partial<ResearchLoopStateType>): ResearchLoopStateType {
  return {
    messages: [],
    phase: "research:evaluated",
    pageId: "page-1",
    userId: "user-1",
    iteration: 1,
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

describe("shouldRefine", () => {
  it("compiles when score >= 0.75 even if iterations remain", () => {
    expect(
      shouldRefine(
        state({
          iteration: 1,
          maxIterations: 5,
          lastEvaluation: { score: 0.75, rationale: "ok", missingAspects: [] },
        }),
      ),
    ).toBe("compile");
  });

  it("compiles when score is high above the threshold", () => {
    expect(
      shouldRefine(
        state({
          iteration: 1,
          maxIterations: 5,
          lastEvaluation: { score: 0.95, rationale: "great", missingAspects: [] },
        }),
      ),
    ).toBe("compile");
  });

  it("refines when score is below threshold and iterations remain", () => {
    expect(
      shouldRefine(
        state({
          iteration: 1,
          maxIterations: 3,
          lastEvaluation: { score: 0.5, rationale: "weak", missingAspects: ["x"] },
        }),
      ),
    ).toBe("refine");
  });

  it("compiles at the hard iteration cap even if score is low", () => {
    expect(
      shouldRefine(
        state({
          iteration: 3,
          maxIterations: 3,
          lastEvaluation: { score: 0.4, rationale: "weak", missingAspects: ["x", "y"] },
        }),
      ),
    ).toBe("compile");
  });

  it("compiles past the cap (defence against off-by-one)", () => {
    expect(shouldRefine(state({ iteration: 4, maxIterations: 3 }))).toBe("compile");
  });

  it("refines when there's no evaluation yet and iterations remain", () => {
    // Defensive: if evaluate_sufficiency hasn't run, treat as "not enough yet".
    // evaluation 未走の保険 — まだ充足してないとみなす。
    expect(shouldRefine(state({ iteration: 0, maxIterations: 3, lastEvaluation: null }))).toBe(
      "refine",
    );
  });
});
