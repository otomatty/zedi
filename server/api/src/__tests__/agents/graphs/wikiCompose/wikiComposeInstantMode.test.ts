/**
 * Wiki Compose instant-mode wiring tests.
 *
 * `mode: "instant"` の経路を固定する:
 * - Brief / Outline の interrupt をスキップして、初回 `POST /run` だけで
 *   START → draft → comprehension_aids → completed まで一気通貫する。
 * - 完了 state に `completion`（理解支援 `comprehensionAids` 同梱）が載る。
 *
 * Pins the zero-friction instant path: a single run reaches `completed` with no
 * human interrupts, and the comprehension aids are attached to the completion.
 *
 * LLM-backed nodes are mocked so the test pins wiring, not model quality.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { briefDialogue, structureDialogue, draftSections, comprehensionAids } = vi.hoisted(() => ({
  briefDialogue: vi.fn(),
  structureDialogue: vi.fn(),
  draftSections: vi.fn(),
  comprehensionAids: vi.fn(),
}));

// Keep the real interrupt + projection nodes (humanReviewBrief / humanReviewOutline /
// completed); only mock the LLM-backed ones. The instant-mode guards live in the
// real interrupt nodes, so they must NOT be mocked away.
vi.mock("../../../../agents/graphs/wikiCompose/nodes/index.js", async () => {
  const real = await vi.importActual<
    typeof import("../../../../agents/graphs/wikiCompose/nodes/index.js")
  >("../../../../agents/graphs/wikiCompose/nodes/index.js");
  return {
    ...real,
    briefDialogue,
    structureDialogue,
    draftSections,
    comprehensionAids,
  };
});

import { GraphRunner } from "../../../../agents/runner/graphRunner.js";
import { __resetRegistryForTests } from "../../../../agents/registry/graphRegistry.js";
import {
  WIKI_COMPOSE_GRAPH_ID,
  registerWikiComposeGraph,
} from "../../../../agents/graphs/wikiCompose/index.js";
import type { GraphContext } from "../../../../agents/core/types/graphContext.js";
import type { Database } from "../../../../types/index.js";
import { MemorySaver } from "@langchain/langgraph";

function fakeContext(threadId: string): GraphContext {
  return {
    threadId,
    sessionId: threadId,
    userId: "user-1",
    pageId: "page-1",
    graphId: WIKI_COMPOSE_GRAPH_ID,
    backend: "zedi_managed",
    tier: "free",
    db: {} as Database,
    feature: "wiki_compose:test",
    userEmail: null,
    contentLocale: "ja",
  };
}

function defaultMocks() {
  // briefDialogue still runs (real instant guard skips question generation in
  // production, but the mock stands in for the LLM path); emit a snapshot so
  // downstream prompts have a title and 0 questions.
  briefDialogue.mockImplementation(async (state: { mode?: string }) => ({
    briefQuestions: [],
    briefDegraded: false,
    pageSnapshot: { pageId: "page-1", title: "Photosynthesis", body: "", hasContent: false },
    phase: "brief:await_user",
    // mirror the incoming mode so the real interrupt nodes see it
    mode: state.mode,
  }));
  structureDialogue.mockImplementation(async () => ({
    outlineProposal: [{ id: "sec-1", heading: "Overview", depth: 1, intent: "intro" }],
    phase: "structure:await_user",
  }));
  draftSections.mockImplementation(async () => ({
    draftedSections: [
      {
        sectionId: "sec-1",
        heading: "Overview",
        body: "Photosynthesis converts light energy into chemical energy.",
        citedSourceIds: [],
        completedAt: "2026-01-01T00:00:01.000Z",
      },
    ],
    phase: "draft:completed",
  }));
  comprehensionAids.mockImplementation(async () => ({
    comprehensionAids: {
      summary: "Plants turn sunlight into chemical energy.",
      keyTerms: [{ term: "Chlorophyll", definition: "The green pigment that absorbs light." }],
      questions: ["What does photosynthesis convert light energy into?"],
    },
  }));
}

describe("wikiComposeGraph — instant mode", () => {
  beforeEach(() => {
    __resetRegistryForTests();
    registerWikiComposeGraph();
    briefDialogue.mockReset();
    structureDialogue.mockReset();
    draftSections.mockReset();
    comprehensionAids.mockReset();
    defaultMocks();
  });
  afterEach(() => {
    __resetRegistryForTests();
  });

  it("runs end-to-end with no interrupts when mode=instant", async () => {
    const runner = new GraphRunner();
    const result = await runner.invoke(
      {
        graphId: WIKI_COMPOSE_GRAPH_ID,
        context: fakeContext("thread-instant"),
        checkpointer: new MemorySaver(),
        recursionLimit: 120,
      },
      { kind: "input", value: { mode: "instant" } },
    );

    // Single run reaches completion — no Brief / Outline gate.
    expect(result.status).toBe("completed");
    expect(briefDialogue).toHaveBeenCalledTimes(1);
    expect(structureDialogue).toHaveBeenCalledTimes(1);
    expect(draftSections).toHaveBeenCalledTimes(1);
    expect(comprehensionAids).toHaveBeenCalledTimes(1);

    const finalState = result.output as {
      completion?: {
        markdown?: string;
        sections?: unknown[];
        comprehensionAids?: { summary?: string; keyTerms?: unknown[]; questions?: unknown[] };
      };
    };
    expect(finalState.completion?.markdown).toMatch(/Overview/);
    expect(finalState.completion?.sections).toHaveLength(1);
    // Understanding Layer is attached to the completion.
    expect(finalState.completion?.comprehensionAids?.summary).toMatch(/sunlight/);
    expect(finalState.completion?.comprehensionAids?.keyTerms).toHaveLength(1);
    expect(finalState.completion?.comprehensionAids?.questions).toHaveLength(1);
  });

  it("still halts at the Brief interrupt in the default guided mode", async () => {
    briefDialogue.mockImplementation(async () => ({
      briefQuestions: [
        {
          id: "q-1",
          question: "Scope?",
          options: [{ id: "o-1", label: "broad" }],
          required: false,
        },
      ],
      briefDegraded: false,
      pageSnapshot: { pageId: "page-1", title: "Photosynthesis", body: "", hasContent: false },
      phase: "brief:await_user",
    }));
    const runner = new GraphRunner();
    const result = await runner.invoke(
      {
        graphId: WIKI_COMPOSE_GRAPH_ID,
        context: fakeContext("thread-guided"),
        checkpointer: new MemorySaver(),
        recursionLimit: 120,
      },
      { kind: "input", value: { messages: [{ role: "user", content: "title: Photosynthesis" }] } },
    );

    expect(result.status).toBe("interrupted");
    expect(draftSections).not.toHaveBeenCalled();
    expect(comprehensionAids).not.toHaveBeenCalled();
  });
});
