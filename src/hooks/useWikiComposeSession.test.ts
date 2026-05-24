/**
 * `useWikiComposeSession` ユニットテスト (#950)。
 *
 * SSE 経由のイベント反映と、resume API 呼び出し時の state machine 進行を
 * 検証する。実 fetch を叩かないよう `composeService` をモック差し替えする。
 *
 * Pins the state-machine reductions: each compose SSE event must produce the
 * correct slice of state, and submit/* mutators must call the right
 * `composeService` function with the right payload.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  createSession: vi.fn(),
  getSession: vi.fn(),
  runSession: vi.fn(),
  resumeSession: vi.fn(),
  cancelSession: vi.fn(),
}));

vi.mock("@/lib/wikiCompose/composeService", () => ({
  createSession: mocks.createSession,
  getSession: mocks.getSession,
  runSession: mocks.runSession,
  resumeSession: mocks.resumeSession,
  cancelSession: mocks.cancelSession,
}));

import { useWikiComposeSession } from "./useWikiComposeSession";
import type { ComposeSseEvent } from "@/lib/wikiCompose/types";

const SESSION = {
  id: "sess-1",
  pageId: "page-1",
  userId: "user-1",
  graphId: "wiki-compose",
  backend: "zedi_managed",
  phase: "init",
  status: "pending" as const,
  metadata: null,
  lastError: null,
  closedAt: null,
  createdAt: "2026-05-24T00:00:00Z",
  updatedAt: "2026-05-24T00:00:00Z",
};

/**
 * Helper that drives the hook's `onEvent` by configuring `runSession` to
 * push a sequence of pre-made events.
 */
function arrangeRun(events: ComposeSseEvent[]): void {
  mocks.runSession.mockImplementation(async ({ onEvent }) => {
    for (const e of events) await onEvent(e);
  });
}

describe("useWikiComposeSession", () => {
  beforeEach(() => {
    mocks.createSession.mockReset();
    mocks.getSession.mockReset();
    mocks.runSession.mockReset();
    mocks.resumeSession.mockReset();
    mocks.cancelSession.mockReset();
    mocks.createSession.mockResolvedValue(SESSION);
  });

  it("reduces a Brief interrupt into briefQuestions + pageSnapshot", async () => {
    arrangeRun([
      { type: "started", sessionId: SESSION.id, graphId: SESSION.graphId },
      { type: "compose_phase", phase: "brief", status: "entered" },
      {
        type: "interrupt",
        payload: {
          kind: "human_review_brief",
          questions: [
            {
              id: "q1",
              question: "Scope?",
              required: false,
              options: [{ id: "o1", label: "broad" }],
            },
          ],
          pageSnapshot: { pageId: "page-1", title: "T", body: "", hasContent: false },
        },
      },
      { type: "done", status: "interrupted" },
    ]);

    const { result } = renderHook(() =>
      useWikiComposeSession({ pageId: "page-1", sessionId: null }),
    );

    await waitFor(() => expect(result.current.briefQuestions.length).toBeGreaterThan(0));
    expect(result.current.phase).toBe("brief");
    const firstQuestion = result.current.briefQuestions[0];
    expect(firstQuestion?.question).toBe("Scope?");
    expect(result.current.pageSnapshot?.title).toBe("T");
    expect(result.current.status).toBe("interrupted");
  });

  it("appends tokens to the active streaming section buffer", async () => {
    arrangeRun([
      { type: "started", sessionId: SESSION.id, graphId: SESSION.graphId },
      {
        type: "compose_section",
        sectionId: "sec-1",
        heading: "Overview",
        status: "started",
        index: 1,
        total: 2,
      },
      { type: "token", node: "draft_sections", content: "Hello " },
      { type: "token", node: "draft_sections", content: "world." },
      {
        type: "compose_section",
        sectionId: "sec-1",
        heading: "Overview",
        status: "completed",
        index: 1,
        total: 2,
      },
      { type: "done", status: "completed" },
    ]);

    const { result } = renderHook(() =>
      useWikiComposeSession({ pageId: "page-1", sessionId: null }),
    );

    await waitFor(() => expect(result.current.status).toBe("completed"));
    expect(result.current.sectionBuffers["sec-1"]).toBe("Hello world.");
    expect(result.current.streamingSectionId).toBeNull();
  });

  it("submitOutline hydrates completion from PATCH resume output without POST /run", async () => {
    arrangeRun([
      { type: "started", sessionId: SESSION.id, graphId: SESSION.graphId },
      { type: "done", status: "interrupted" },
    ]);
    mocks.resumeSession.mockResolvedValue({
      status: "completed",
      output: {
        completion: {
          markdown: "## Overview\n\nBody one\n\n## Details\n\nBody two\n",
          sections: [
            {
              sectionId: "sec-1",
              heading: "Overview",
              body: "Body one",
              citedSourceIds: [],
              completedAt: "2026-05-24T00:00:00Z",
            },
            {
              sectionId: "sec-2",
              heading: "Details",
              body: "Body two",
              citedSourceIds: [],
              completedAt: "2026-05-24T00:00:01Z",
            },
          ],
          citedSources: [],
          completedAt: "2026-05-24T00:00:02Z",
        },
        approvedOutline: {
          sections: [
            { id: "sec-1", heading: "Overview", depth: 1, intent: "intro" },
            { id: "sec-2", heading: "Details", depth: 1, intent: "deep" },
          ],
        },
      },
    });

    const { result } = renderHook(() =>
      useWikiComposeSession({ pageId: "page-1", sessionId: null }),
    );
    await waitFor(() => expect(result.current.session).not.toBeNull());

    await act(async () => {
      await result.current.submitOutline({
        sections: [
          { id: "sec-1", heading: "Overview", depth: 1, intent: "intro" },
          { id: "sec-2", heading: "Details", depth: 1, intent: "deep" },
        ],
      });
    });

    expect(mocks.runSession).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(result.current.status).toBe("completed"));
    expect(result.current.completedMarkdown).toContain("Body one");
    expect(result.current.draftedSections["sec-1"]?.body).toBe("Body one");
    expect(result.current.phase).toBe("completed");
  });

  it("submitBrief applies research interrupt from PATCH output without POST /run", async () => {
    arrangeRun([
      { type: "started", sessionId: SESSION.id, graphId: SESSION.graphId },
      { type: "done", status: "interrupted" },
    ]);
    mocks.resumeSession.mockResolvedValue({
      status: "interrupted",
      output: {
        __interrupt__: [
          {
            value: {
              kind: "human_review_research",
              batch: {
                id: "batch-1",
                iteration: 0,
                sources: [],
                createdAt: "2026-05-24T00:00:00Z",
              },
              pendingSources: [
                {
                  id: "src-1",
                  kind: "web",
                  title: "Example",
                  url: "https://example.com",
                },
              ],
            },
          },
        ],
      },
    });

    const { result } = renderHook(() =>
      useWikiComposeSession({ pageId: "page-1", sessionId: null }),
    );
    await waitFor(() => expect(result.current.session).not.toBeNull());

    await act(async () => {
      await result.current.submitBrief({ answers: [], appendToExisting: false });
    });

    expect(mocks.runSession).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(result.current.pendingSources).toHaveLength(1));
    expect(result.current.pendingSources[0]?.id).toBe("src-1");
    expect(result.current.phase).toBe("research");
  });

  it("submitBrief calls resumeSession with the answer payload and re-streams", async () => {
    // Initial run: halt at Brief.
    arrangeRun([
      { type: "started", sessionId: SESSION.id, graphId: SESSION.graphId },
      { type: "done", status: "interrupted" },
    ]);
    mocks.resumeSession.mockResolvedValue({ status: "interrupted", output: null });

    const { result } = renderHook(() =>
      useWikiComposeSession({ pageId: "page-1", sessionId: null }),
    );
    await waitFor(() => expect(result.current.session).not.toBeNull());

    await act(async () => {
      await result.current.submitBrief({ answers: [], appendToExisting: false });
    });

    expect(mocks.resumeSession).toHaveBeenCalledWith(
      expect.objectContaining({
        pageId: "page-1",
        sessionId: "sess-1",
        resume: { answers: [], appendToExisting: false },
      }),
    );
  });

  it("retries a failed session with chatSeed from row metadata when initialInput is absent", async () => {
    mocks.getSession.mockResolvedValue({
      ...SESSION,
      status: "failed",
      metadata: {
        composeSeed: {
          outline: "- topic",
          conversationText: "User: seed me",
        },
      },
    });
    arrangeRun([{ type: "done", status: "failed" }]);

    renderHook(() => useWikiComposeSession({ pageId: "page-1", sessionId: "sess-1" }));

    await waitFor(() => expect(mocks.runSession).toHaveBeenCalled());
    expect(mocks.createSession).not.toHaveBeenCalled();
    expect(mocks.runSession).toHaveBeenCalledWith(
      expect.objectContaining({
        body: {
          chatSeed: {
            outline: "- topic",
            conversationText: "User: seed me",
          },
        },
      }),
    );
  });
});
