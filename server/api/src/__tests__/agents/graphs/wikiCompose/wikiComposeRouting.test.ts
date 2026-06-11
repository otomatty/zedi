/**
 * Wiki Compose P5 routing predicates (#953).
 * Wiki Compose P5 ルーティング述語のテスト (#953)。
 */
import { describe, expect, it } from "vitest";
import {
  routeAfterBrief,
  routeAfterResearch,
  shouldResolveResearchConflicts,
} from "../../../../agents/graphs/wikiCompose/routing.js";
import type { WikiComposeStateType } from "../../../../agents/graphs/wikiCompose/state.js";

function minimalState(overrides: Partial<WikiComposeStateType> = {}): WikiComposeStateType {
  return {
    messages: [],
    phase: "init",
    pageId: "page-1",
    userId: "user-1",
    chatSeed: null,
    pageSnapshot: null,
    briefQuestions: [],
    brief: null,
    briefDegraded: false,
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
    outlineProposal: [],
    approvedOutline: null,
    draftedSections: [],
    completion: null,
    mode: "guided",
    comprehensionAids: null,
    ...overrides,
  };
}

describe("routeAfterBrief", () => {
  it("routes to skip_research when Brief emitted zero questions", () => {
    expect(routeAfterBrief(minimalState({ briefQuestions: [] }))).toBe("skip_research");
  });

  it("routes to skip_research when chatSeed carries a pre-approved outline", () => {
    expect(
      routeAfterBrief(
        minimalState({
          briefQuestions: [{ id: "q1", question: "Scope?", options: [], required: false }],
          chatSeed: { outline: "## Intro\n- point", conversationText: "hi" },
        }),
      ),
    ).toBe("skip_research");
  });

  it("routes to research when Brief is empty due to LLM degradation flag", () => {
    expect(routeAfterBrief(minimalState({ briefQuestions: [], briefDegraded: true }))).toBe(
      "research",
    );
  });

  it("routes to research when Brief has questions and no chat outline seed", () => {
    expect(
      routeAfterBrief(
        minimalState({
          briefQuestions: [{ id: "q1", question: "Audience?", options: [], required: true }],
          chatSeed: null,
        }),
      ),
    ).toBe("research");
  });
});

describe("routeAfterResearch / shouldResolveResearchConflicts", () => {
  it("detects conflict when ≥2 rejected and ≥1 approved", () => {
    const state = minimalState({
      approvedResearch: [{ id: "a", kind: "web", title: "A" }],
      rejectedResearch: [
        { id: "b", kind: "web", title: "B" },
        { id: "c", kind: "web", title: "C" },
      ],
    });
    expect(shouldResolveResearchConflicts(state)).toBe(true);
    expect(routeAfterResearch(state)).toBe("conflict_resolution");
  });

  it("routes to structure when rejections are below threshold", () => {
    const state = minimalState({
      approvedResearch: [{ id: "a", kind: "web", title: "A" }],
      rejectedResearch: [{ id: "b", kind: "web", title: "B" }],
    });
    expect(routeAfterResearch(state)).toBe("structure");
  });
});
