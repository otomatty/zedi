/**
 * `briefDialogue` unit tests (#1033).
 * - Loads page snapshot once and projects briefQuestions into state.
 * - LLM failure degrades to empty questions with `briefDegraded=true`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createZediChatModel, loadPageSnapshot } = vi.hoisted(() => ({
  createZediChatModel: vi.fn(),
  loadPageSnapshot: vi.fn(),
}));

vi.mock("../../../../../agents/core/llm/wikiComposeModelId.js", () => ({
  resolveWikiComposeModelId: vi.fn(async () => "google:gemini-3.5-flash"),
}));

vi.mock("../../../../../agents/core/llm/modelFactory.js", async () => {
  const actual = await vi.importActual<
    typeof import("../../../../../agents/core/llm/modelFactory.js")
  >("../../../../../agents/core/llm/modelFactory.js");
  return {
    ...actual,
    createZediChatModel: (...args: unknown[]) =>
      createZediChatModel(...(args as Parameters<typeof actual.createZediChatModel>)),
  };
});

vi.mock("../../../../../agents/graphs/wikiCompose/nodes/shared/loadPageSnapshot.js", () => ({
  loadPageSnapshot: (...args: unknown[]) =>
    loadPageSnapshot(
      ...(args as Parameters<
        typeof import("../../../../../agents/graphs/wikiCompose/nodes/shared/loadPageSnapshot.js").loadPageSnapshot
      >),
    ),
}));

vi.mock("../../../../../agents/graphs/wikiCompose/nodes/shared/dispatch.js", () => ({
  dispatchComposePhase: vi.fn(async () => undefined),
}));

import { briefDialogue } from "../../../../../agents/graphs/wikiCompose/nodes/briefDialogue.js";
import { GRAPH_CONTEXT_CONFIG_KEY } from "../../../../../agents/core/types/graphContext.js";
import type { GraphContext } from "../../../../../agents/core/types/graphContext.js";
import type { Database } from "../../../../../types/index.js";
import type { WikiComposeStateType } from "../../../../../agents/graphs/wikiCompose/state.js";
import type {
  BriefQuestion,
  PageSnapshot,
} from "../../../../../agents/graphs/wikiCompose/types.js";

function fakeContext(): GraphContext {
  return {
    threadId: "t",
    sessionId: "t",
    userId: "u-1",
    pageId: "p-1",
    graphId: "wiki-compose",
    backend: "zedi_managed",
    tier: "free",
    db: {} as Database,
    feature: "wiki_compose:test",
    userEmail: null,
    contentLocale: "ja",
  };
}

function state(overrides: Partial<WikiComposeStateType>): WikiComposeStateType {
  return {
    messages: [],
    phase: "brief",
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
    briefQuestions: [],
    briefDegraded: false,
    brief: null,
    outlineProposal: [],
    approvedOutline: null,
    draftedSections: [],
    completion: null,
    chatSeed: null,
    pageSnapshot: null,
    ...overrides,
  };
}

function fakeStructuredModel(returnValue: unknown) {
  return {
    withStructuredOutput: vi.fn(() => ({
      invoke: vi.fn(async () => returnValue),
    })),
  };
}

beforeEach(() => {
  createZediChatModel.mockReset();
  loadPageSnapshot.mockReset();
  loadPageSnapshot.mockResolvedValue({
    pageId: "p-1",
    title: "Loaded Title",
    body: "Existing body",
    hasContent: true,
  });
});
afterEach(() => {
  createZediChatModel.mockReset();
  loadPageSnapshot.mockReset();
});

describe("briefDialogue", () => {
  const config = { configurable: { [GRAPH_CONTEXT_CONFIG_KEY]: fakeContext() } };

  it("loads page snapshot when absent and projects structured brief questions", async () => {
    createZediChatModel.mockResolvedValue(
      fakeStructuredModel({
        questions: [
          {
            question: "What audience?",
            rationale: "Scope matters",
            options: [{ label: "Developers", hint: "Technical readers" }],
            required: true,
          },
        ],
      }),
    );

    const update = await briefDialogue(state({ pageSnapshot: null }), config as never);

    expect(loadPageSnapshot).toHaveBeenCalledTimes(1);
    expect((update.pageSnapshot as PageSnapshot).title).toBe("Loaded Title");
    const questions = (update.briefQuestions ?? []) as BriefQuestion[];
    expect(questions).toHaveLength(1);
    expect(questions[0]?.question).toBe("What audience?");
    expect(questions[0]?.options).toHaveLength(1);
    expect(questions[0]?.required).toBe(true);
    expect(update.briefDegraded).toBe(false);
    expect(update.phase).toBe("brief:await_user");
  });

  it("reuses pageSnapshot from state without hitting the DB", async () => {
    createZediChatModel.mockResolvedValue(fakeStructuredModel({ questions: [] }));
    const snapshot = {
      pageId: "p-1",
      title: "Cached",
      body: "",
      hasContent: false,
    };

    const update = await briefDialogue(state({ pageSnapshot: snapshot }), config as never);

    expect(loadPageSnapshot).not.toHaveBeenCalled();
    expect(update.pageSnapshot).toEqual(snapshot);
  });

  it("sets briefDegraded when the LLM call fails", async () => {
    createZediChatModel.mockResolvedValue({
      withStructuredOutput: vi.fn(() => ({
        invoke: vi.fn(async () => {
          throw new Error("provider timeout");
        }),
      })),
    });

    const update = await briefDialogue(state({ pageSnapshot: null }), config as never);

    expect(update.briefQuestions).toEqual([]);
    expect(update.briefDegraded).toBe(true);
    expect(update.phase).toBe("brief:await_user");
  });
});
