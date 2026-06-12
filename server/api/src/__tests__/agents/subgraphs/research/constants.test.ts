/**
 * Research loop iteration cap resolution tests.
 */
import { describe, expect, it } from "vitest";
import {
  RESEARCH_SAFETY_MAX_ITERATIONS,
  resolveResearchMaxIterations,
} from "../../../../agents/subgraphs/research/constants.js";

describe("resolveResearchMaxIterations", () => {
  it("honours explicit ingest caps in 1..5", () => {
    expect(resolveResearchMaxIterations(3)).toBe(3);
    expect(resolveResearchMaxIterations(1)).toBe(1);
    expect(resolveResearchMaxIterations(5)).toBe(5);
  });

  it("uses the autonomous safety cap for wiki compose defaults", () => {
    expect(resolveResearchMaxIterations(undefined)).toBe(RESEARCH_SAFETY_MAX_ITERATIONS);
    expect(resolveResearchMaxIterations(10)).toBe(RESEARCH_SAFETY_MAX_ITERATIONS);
    expect(resolveResearchMaxIterations(99)).toBe(RESEARCH_SAFETY_MAX_ITERATIONS);
  });
});
