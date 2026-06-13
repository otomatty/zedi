/**
 * `composeSessionProjection` のユニットテスト (#950)。
 * Unit tests for `composeSessionProjection`.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const { mockResolveCheckpointerForRun, mockGetRegisteredGraph } = vi.hoisted(() => ({
  mockResolveCheckpointerForRun: vi.fn(),
  mockGetRegisteredGraph: vi.fn(),
}));

vi.mock("../../agents/core/checkpoint/index.js", () => ({
  resolveCheckpointerForRun: (...args: unknown[]) => mockResolveCheckpointerForRun(...args),
}));

vi.mock("../../agents/registry/graphRegistry.js", () => ({
  getRegisteredGraph: (...args: unknown[]) => mockGetRegisteredGraph(...args),
}));

import {
  loadComposeSessionProjection,
  projectComposeStateValues,
} from "../../routes/composeSessionProjection.js";

beforeEach(() => {
  mockResolveCheckpointerForRun.mockReset();
  mockGetRegisteredGraph.mockReset();
});

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

  it("projects a conflict_resolution interrupt (#953)", () => {
    const projection = projectComposeStateValues({
      approvedResearch: [{ id: "src:a", kind: "web", title: "A" }],
      __interrupt__: [
        {
          value: {
            kind: "conflict_resolution",
            conflicts: {
              approved: [{ id: "src:a", title: "A" }],
              rejected: [
                { id: "src:b", title: "B" },
                { id: "src:c", title: "C" },
              ],
              rationale: "Mixed approval",
            },
          },
        },
      ],
    });
    expect(projection.phase).toBe("conflict");
    expect(projection.researchConflictSummary).toMatchObject({ rationale: "Mixed approval" });
    expect(projection.approvedSources).toHaveLength(1);
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
    expect(projection.phase).toBe("completed");
  });

  it("projects human_review_outline interrupt", () => {
    const projection = projectComposeStateValues({
      __interrupt__: [
        {
          value: {
            kind: "human_review_outline",
            outline: [{ sectionId: "s1", heading: "Intro" }],
            approvedSources: [{ id: "src:1" }],
          },
        },
      ],
    });
    expect(projection.phase).toBe("structure");
    expect(projection.outlineProposal).toHaveLength(1);
    expect(projection.approvedSources).toHaveLength(1);
  });

  it("falls back to approvedOutline sections when outlineProposal is absent", () => {
    const projection = projectComposeStateValues({
      approvedOutline: { sections: [{ sectionId: "s2", heading: "Body" }] },
    });
    expect(projection.outlineProposal).toHaveLength(1);
  });

  it("uses row phase fallback when no interrupt phase is derived", () => {
    const projection = projectComposeStateValues({
      phase: "draft:writing",
      draftedSections: [{ sectionId: "d1" }],
    });
    expect(projection.phase).toBe("draft");
  });

  it("maps batches to latestBatch", () => {
    const projection = projectComposeStateValues({
      batches: [{ id: "b1" }, { id: "b2" }],
    });
    expect(projection.latestBatch).toMatchObject({ id: "b2" });
  });
});

describe("loadComposeSessionProjection", () => {
  const baseInput = {
    sessionId: "sess-1",
    pageId: "page-1",
    graphId: "graph-1",
    status: "interrupted" as const,
    phase: "brief:await_user",
    context: {
      threadId: "sess-1",
      sessionId: "sess-1",
      userId: "user-1",
      userEmail: null,
      pageId: "page-1",
      graphId: "graph-1",
      backend: "zedi_managed" as const,
      tier: "free" as const,
      db: {} as never,
      feature: "compose_projection_test",
      contentLocale: "ja" as const,
    },
  };

  it("returns null for pending sessions", async () => {
    const result = await loadComposeSessionProjection({
      ...baseInput,
      status: "pending",
    });
    expect(result).toBeNull();
  });

  it("returns null when checkpointing is disabled", async () => {
    mockResolveCheckpointerForRun.mockResolvedValue(false);
    const result = await loadComposeSessionProjection(baseInput);
    expect(result).toBeNull();
  });

  it("returns null when graph is not registered", async () => {
    mockResolveCheckpointerForRun.mockResolvedValue({});
    mockGetRegisteredGraph.mockReturnValue(undefined);
    const result = await loadComposeSessionProjection(baseInput);
    expect(result).toBeNull();
  });

  it("loads projection from checkpoint state", async () => {
    mockResolveCheckpointerForRun.mockResolvedValue({});
    mockGetRegisteredGraph.mockReturnValue({
      factory: () => ({
        getState: async () => ({
          values: {
            phase: "brief:await_user",
            __interrupt__: [
              {
                value: {
                  kind: "human_review_brief",
                  questions: [{ id: "q1", question: "Q?" }],
                },
              },
            ],
          },
        }),
      }),
    });
    const result = await loadComposeSessionProjection(baseInput);
    expect(result?.phase).toBe("brief");
    expect(result?.briefQuestions).toHaveLength(1);
  });

  it("returns null when getState throws", async () => {
    mockResolveCheckpointerForRun.mockResolvedValue({});
    mockGetRegisteredGraph.mockReturnValue({
      factory: () => ({
        getState: async () => {
          throw new Error("checkpoint missing");
        },
      }),
    });
    const result = await loadComposeSessionProjection(baseInput);
    expect(result).toBeNull();
  });
});
