import type { SetStateAction } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  dedupeReferencedPagesById,
  collectReferencedPagesFromMessages,
  buildApiPayload,
  streamAssistantCompletion,
} from "./useAIChatExecuteHelpers";
import type { ChatMessage, ReferencedPage, ChatTreeState } from "../types/aiChat";
import * as aiService from "../lib/aiService";
import { getDefaultAISettings } from "../lib/aiSettings";

vi.mock("../lib/aiService", () => ({
  callAIService: vi.fn(),
}));

describe("useAIChatExecuteHelpers", () => {
  it("dedupeReferencedPagesById keeps first occurrence", () => {
    const refs: ReferencedPage[] = [
      { id: "1", title: "A" },
      { id: "1", title: "B" },
    ];
    expect(dedupeReferencedPagesById(refs)).toEqual([{ id: "1", title: "A" }]);
  });

  it("collectReferencedPagesFromMessages flattens and dedupes", () => {
    const shared: ReferencedPage = { id: "p", title: "Page" };
    const messages: ChatMessage[] = [
      {
        id: "u1",
        role: "user",
        content: "a",
        timestamp: 1,
        referencedPages: [shared],
      },
      {
        id: "u2",
        role: "user",
        content: "b",
        timestamp: 2,
        referencedPages: [shared],
      },
    ];
    expect(collectReferencedPagesFromMessages(messages)).toEqual([shared]);
  });

  it("buildApiPayload includes user tail when provided", () => {
    const base: ChatMessage[] = [{ id: "u", role: "user", content: "hi", timestamp: 1 }];
    const tail: ChatMessage = { id: "u2", role: "user", content: "there", timestamp: 2 };
    expect(buildApiPayload(base, tail)).toEqual([
      { role: "user", content: "hi" },
      { role: "user", content: "there" },
    ]);
  });
});

describe("streamAssistantCompletion", () => {
  beforeEach(() => {
    vi.mocked(aiService.callAIService).mockReset();
  });

  it("marks running tool executions completed when the service reports an error", async () => {
    vi.mocked(aiService.callAIService).mockImplementation(async (_a, _b, callbacks) => {
      callbacks.onToolUseStart?.("Bash");
      callbacks.onError?.(new Error("boom"));
    });

    let state: ChatTreeState = {
      messageMap: {
        a1: {
          id: "a1",
          role: "assistant",
          content: "",
          timestamp: 1,
          parentId: "u1",
          isStreaming: true,
        },
      },
      rootMessageId: "a1",
      activeLeafId: "a1",
    };

    const setTree = vi.fn((updater: SetStateAction<ChatTreeState>) => {
      if (typeof updater === "function") {
        state = updater(state);
      }
    });

    await streamAssistantCompletion(
      getDefaultAISettings(),
      {
        provider: "google",
        model: "gemini",
        messages: [{ role: "user", content: "hi" }],
      },
      new AbortController().signal,
      {
        assistantMessageId: "a1",
        modelDisplayName: "m",
        streamingContentRef: { current: "" },
        setTree,
        setStreaming: vi.fn(),
        setError: vi.fn(),
      },
    );

    expect(state.messageMap.a1.toolExecutions).toEqual([{ toolName: "Bash", status: "completed" }]);
    expect(state.messageMap.a1.isStreaming).toBe(false);
    expect(state.messageMap.a1.error).toBe("boom");
  });
});
