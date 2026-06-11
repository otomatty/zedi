/**
 * `draftSections` unit tests (#1033, #976).
 * - Per-section LLM streaming with state projection.
 * - One section failure must not abort the whole Draft.
 * - User-visible body must not leak raw provider error messages.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createZediChatModel } = vi.hoisted(() => ({ createZediChatModel: vi.fn() }));

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

vi.mock("../../../../../agents/graphs/wikiCompose/nodes/shared/dispatch.js", () => ({
  dispatchComposePhase: vi.fn(async () => undefined),
  dispatchComposeSection: vi.fn(async () => undefined),
}));

import { draftSections } from "../../../../../agents/graphs/wikiCompose/nodes/draftSections.js";
import { GRAPH_CONTEXT_CONFIG_KEY } from "../../../../../agents/core/types/graphContext.js";
import type { GraphContext } from "../../../../../agents/core/types/graphContext.js";
import type { Database } from "../../../../../types/index.js";
import type { WikiComposeStateType } from "../../../../../agents/graphs/wikiCompose/state.js";
import type { DraftedSection } from "../../../../../agents/graphs/wikiCompose/types.js";

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
    phase: "draft",
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
    pageSnapshot: { pageId: "p-1", title: "My Page", body: "", hasContent: false },
    ...overrides,
  };
}

function streamFromChunks(chunks: unknown[]) {
  return (async function* () {
    for (const chunk of chunks) yield chunk;
  })();
}

function fakeModelWithStreams(streams: unknown[][]) {
  const stream = vi.fn();
  for (const chunks of streams) {
    stream.mockResolvedValueOnce(streamFromChunks(chunks));
  }
  return { stream };
}

beforeEach(() => {
  createZediChatModel.mockReset();
});
afterEach(() => {
  createZediChatModel.mockReset();
  vi.restoreAllMocks();
});

describe("draftSections", () => {
  const config = { configurable: { [GRAPH_CONTEXT_CONFIG_KEY]: fakeContext() } };

  it("returns empty draftedSections when approved outline has no sections", async () => {
    const update = await draftSections(
      state({ approvedOutline: { sections: [] } }),
      config as never,
    );
    expect(update.draftedSections).toEqual([]);
    expect(update.phase).toBe("draft:completed");
    expect(createZediChatModel).not.toHaveBeenCalled();
  });

  it("streams each section and collects cited source ids from [#N] markers", async () => {
    createZediChatModel.mockResolvedValue(
      fakeModelWithStreams([
        [{ content: "Intro body [#1]" }, { content: [{ type: "text", text: " more" }] }],
        [{ content: "Details without citations" }],
      ]),
    );

    const update = await draftSections(
      state({
        approvedOutline: {
          sections: [
            { id: "sec-1", heading: "Intro", depth: 1, intent: "overview", sourceIds: ["src:a"] },
            { id: "sec-2", heading: "Details", depth: 1, intent: "deep dive" },
          ],
        },
        approvedResearch: [
          { id: "src:a", kind: "web", title: "A", url: "https://a/" },
          { id: "src:b", kind: "web", title: "B", url: "https://b/" },
        ],
        brief: { answers: [], summary: "scope", appendToExisting: false },
      }),
      config as never,
    );

    expect(update.phase).toBe("draft:completed");
    const sections = (update.draftedSections ?? []) as DraftedSection[];
    expect(sections).toHaveLength(2);
    expect(sections[0]?.body).toBe("Intro body [#1] more");
    expect(sections[0]?.citedSourceIds).toEqual(["src:a"]);
    expect(sections[1]?.body).toBe("Details without citations");
    expect(sections[1]?.citedSourceIds).toEqual([]);
  });

  it("continues drafting when one section stream fails and omits raw error details", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const stream = vi.fn();
    stream.mockRejectedValueOnce(new Error("provider authentication failed: credential-refused"));
    stream.mockResolvedValueOnce(streamFromChunks([{ content: "Recovered section" }]));
    createZediChatModel.mockResolvedValue({ stream });

    const update = await draftSections(
      state({
        approvedOutline: {
          sections: [
            { id: "sec-1", heading: "Fail", depth: 1, intent: "x" },
            { id: "sec-2", heading: "Ok", depth: 1, intent: "y" },
          ],
        },
      }),
      config as never,
    );

    const sections = (update.draftedSections ?? []) as DraftedSection[];
    expect(sections).toHaveLength(2);
    expect(sections[0]?.body).toBe("*(Section draft failed. Please retry drafting this section.)*");
    expect(sections[0]?.body).not.toMatch(/credential-refused/);
    expect(sections[0]?.body).not.toMatch(/provider authentication failed/);
    expect(sections[1]?.body).toBe("Recovered section");
    expect(consoleSpy).toHaveBeenCalled();
  });

  it("preserves partial streamed content when the stream throws mid-section", async () => {
    createZediChatModel.mockResolvedValue({
      stream: vi.fn(async () => ({
        async *[Symbol.asyncIterator]() {
          yield { content: "Partial " };
          throw new Error("stream interrupted");
        },
      })),
    });

    const update = await draftSections(
      state({
        approvedOutline: {
          sections: [{ id: "sec-1", heading: "One", depth: 1, intent: "only" }],
        },
      }),
      config as never,
    );

    const sections = (update.draftedSections ?? []) as DraftedSection[];
    expect(sections[0]?.body).toBe(
      "Partial\n\n*(Section draft failed. Please retry drafting this section.)*",
    );
  });
});
