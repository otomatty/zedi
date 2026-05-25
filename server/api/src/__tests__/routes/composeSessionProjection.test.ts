/**
 * `composeSessionProjection` のユニットテスト (#950)。
 * Unit tests for `composeSessionProjection`.
 */
import { describe, expect, it } from "vitest";
import { projectComposeStateValues } from "../../routes/composeSessionProjection.js";

describe("projectComposeStateValues", () => {
  it("projects a Brief interrupt from __interrupt__", () => {
    const projection = projectComposeStateValues({
      __interrupt__: [
        {
          value: {
            kind: "human_review_brief",
            questions: [{ id: "q1", question: "Scope?", required: false, options: [] }],
            pageSnapshot: { pageId: "p1", title: "T", body: "", hasContent: false },
          },
        },
      ],
    });
    expect(projection.phase).toBe("brief");
    expect(projection.briefQuestions).toHaveLength(1);
    expect(projection.pageSnapshot).toMatchObject({ title: "T" });
  });

  it("keeps interrupt-derived phase when row phase is also present", () => {
    const projection = projectComposeStateValues({
      phase: "brief:await_user",
      __interrupt__: [
        {
          value: {
            kind: "human_review_research",
            batch: null,
            pendingSources: [],
          },
        },
      ],
    });
    expect(projection.phase).toBe("research");
  });

  it("projects completion markdown from checkpoint values", () => {
    const projection = projectComposeStateValues({
      phase: "completed",
      completion: {
        markdown: "## A\n\nBody",
        sections: [
          {
            sectionId: "sec-1",
            heading: "A",
            body: "Body",
            citedSourceIds: [],
            completedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      },
    });
    expect(projection.completedMarkdown).toBe("## A\n\nBody");
    expect(projection.draftedSections).toHaveLength(1);
  });
});
