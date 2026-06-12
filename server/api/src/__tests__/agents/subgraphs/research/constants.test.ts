/**
 * Research loop iteration cap resolution tests.
 */
import { describe, expect, it } from "vitest";
import {
  INGEST_RESEARCH_GRAPH_ID,
  RESEARCH_SAFETY_MAX_ITERATIONS,
  clampIngestMaxIterations,
  resolveResearchMaxIterations,
} from "../../../../agents/subgraphs/research/constants.js";
import { WIKI_COMPOSE_GRAPH_ID } from "../../../../agents/graphs/wikiCompose/index.js";

describe("clampIngestMaxIterations", () => {
  it("clamps ingest caps to 1..5 with default 3", () => {
    expect(clampIngestMaxIterations(undefined)).toBe(3);
    expect(clampIngestMaxIterations(99)).toBe(5);
    expect(clampIngestMaxIterations(4)).toBe(4);
  });
});

describe("resolveResearchMaxIterations", () => {
  it("honours ingest graph caps from state", () => {
    expect(resolveResearchMaxIterations(INGEST_RESEARCH_GRAPH_ID, 4)).toBe(4);
    expect(resolveResearchMaxIterations(INGEST_RESEARCH_GRAPH_ID, 99)).toBe(5);
  });

  it("uses the safety cap for Wiki Compose graphs regardless of legacy state", () => {
    expect(resolveResearchMaxIterations(WIKI_COMPOSE_GRAPH_ID, undefined)).toBe(
      RESEARCH_SAFETY_MAX_ITERATIONS,
    );
    expect(resolveResearchMaxIterations(WIKI_COMPOSE_GRAPH_ID, 3)).toBe(
      RESEARCH_SAFETY_MAX_ITERATIONS,
    );
    expect(resolveResearchMaxIterations("wiki-compose-research", 3)).toBe(
      RESEARCH_SAFETY_MAX_ITERATIONS,
    );
  });
});
