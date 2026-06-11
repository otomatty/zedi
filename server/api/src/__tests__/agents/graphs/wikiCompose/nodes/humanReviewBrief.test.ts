/**
 * `humanReviewBrief` unit tests (#1033).
 * - Interrupt payload shape and resume projection into `state.brief`.
 * - Allowed and disallowed resume payloads (schema validation).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { interrupt } = vi.hoisted(() => ({ interrupt: vi.fn() }));

vi.mock("@langchain/langgraph", async () => {
  const actual =
    await vi.importActual<typeof import("@langchain/langgraph")>("@langchain/langgraph");
  return { ...actual, interrupt };
});

import { humanReviewBrief } from "../../../../../agents/graphs/wikiCompose/nodes/humanReviewBrief.js";
import type { WikiComposeStateType } from "../../../../../agents/graphs/wikiCompose/state.js";
import type { BriefResult } from "../../../../../agents/graphs/wikiCompose/types.js";

function state(overrides: Partial<WikiComposeStateType>): WikiComposeStateType {
  return {
    messages: [],
    phase: "brief:await_user",
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
    researchConflicts: [],
    briefQuestions: [
      {
        id: "q-1",
        question: "Target audience?",
        options: [
          { id: "opt-a", label: "Developers" },
          { id: "opt-b", label: "General" },
        ],
        required: false,
      },
    ],
    briefDegraded: false,
    brief: null,
    outlineProposal: [],
    approvedOutline: null,
    draftedSections: [],
    completion: null,
    chatSeed: null,
    pageSnapshot: { pageId: "p-1", title: "Title", body: "body", hasContent: true },
    ...overrides,
  };
}

beforeEach(() => {
  interrupt.mockReset();
});

describe("humanReviewBrief", () => {
  it("interrupts with brief questions and projects resume answers into state.brief", async () => {
    interrupt.mockReturnValueOnce({
      answers: [
        {
          questionId: "q-1",
          selectedOptionIds: ["opt-a"],
          freeText: "Also for ops teams",
        },
      ],
      appendToExisting: true,
      researchMaxIterations: 4,
    });

    const update = await humanReviewBrief(state({}), { configurable: {} } as never);
    const brief = update.brief as BriefResult;

    expect(interrupt).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "human_review_brief",
        questions: expect.arrayContaining([expect.objectContaining({ id: "q-1" })]),
      }),
    );
    expect(update.phase).toBe("brief:completed");
    expect(brief.appendToExisting).toBe(true);
    expect(brief.answers).toEqual([
      {
        questionId: "q-1",
        selectedOptionIds: ["opt-a"],
        freeText: "Also for ops teams",
      },
    ]);
    expect(brief.summary).toContain("Target audience?");
    expect(brief.summary).toContain("selected=opt-a");
    expect(update.maxIterations).toBe(4);
  });

  it("accepts an empty answers array (explicit Brief skip)", async () => {
    interrupt.mockReturnValueOnce({ answers: [] });

    const update = await humanReviewBrief(state({ briefQuestions: [] }), {
      configurable: {},
    } as never);
    const brief = update.brief as BriefResult;

    expect(brief.answers).toEqual([]);
    expect(brief.summary).toBe("(no brief provided)");
    expect(brief.appendToExisting).toBe(false);
    expect(update.maxIterations).toBeUndefined();
  });

  it("rejects researchMaxIterations outside 1..5", async () => {
    interrupt.mockReturnValueOnce({ answers: [], researchMaxIterations: 9 });

    await expect(humanReviewBrief(state({}), { configurable: {} } as never)).rejects.toThrow();
  });

  it("rejects answers missing questionId", async () => {
    interrupt.mockReturnValueOnce({ answers: [{ selectedOptionIds: ["opt-a"] }] });

    await expect(humanReviewBrief(state({}), { configurable: {} } as never)).rejects.toThrow();
  });
});
