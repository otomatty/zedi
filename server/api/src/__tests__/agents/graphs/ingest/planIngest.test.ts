/**
 * `plan_ingest` prompt helpers (#952).
 */
import { describe, expect, it } from "vitest";
import { appendApprovedResearchToPlannerMessages } from "../../../../agents/graphs/ingest/nodes/planIngest.js";
import { buildIngestPlannerPrompt } from "../../../../services/ingestPlanner.js";

const article = {
  title: "Test",
  url: "https://example.com/a",
  excerpt: "Body",
};

describe("appendApprovedResearchToPlannerMessages", () => {
  it("appends approved source titles and excerpts to the user message", () => {
    const base = buildIngestPlannerPrompt({ article, candidates: [] });
    const enriched = appendApprovedResearchToPlannerMessages(base, [
      {
        id: "src:1",
        kind: "fetched",
        title: "Background article",
        excerpt: "Important context for merge decision.",
      },
    ]);

    const user = enriched.at(-1);
    expect(user?.role).toBe("user");
    expect(user?.content).toContain("## APPROVED RESEARCH");
    expect(user?.content).toContain("Background article");
    expect(user?.content).toContain("Important context");
  });

  it("returns messages unchanged when no approved sources", () => {
    const base = buildIngestPlannerPrompt({ article, candidates: [] });
    expect(appendApprovedResearchToPlannerMessages(base, [])).toEqual(base);
  });
});
