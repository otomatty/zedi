import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import type { ChatMessage, Conversation, MessageMap } from "@/types/aiChat";
import { useAIChatPanelContentLifecycle } from "./useAIChatPanelContentLifecycle";

type LifecycleParams = Parameters<typeof useAIChatPanelContentLifecycle>[0];

function createMocks() {
  return {
    setActiveConversation: vi.fn(),
    clearMessages: vi.fn(),
    loadConversation: vi.fn(),
    updateConversation: vi.fn(),
  };
}

function makeConversation(id: string, map: MessageMap = {}): Conversation {
  return {
    id,
    title: "test",
    messageMap: map,
    rootMessageId: null,
    activeLeafId: null,
    createdAt: 0,
    updatedAt: 0,
  };
}

describe("useAIChatPanelContentLifecycle", () => {
  let mocks: ReturnType<typeof createMocks>;

  beforeEach(() => {
    mocks = createMocks();
  });

  it("clears messages when activeConversationId is null", () => {
    renderHook(() =>
      useAIChatPanelContentLifecycle({
        pageContext: null,
        activeConversationId: null,
        activeConversation: undefined,
        messages: [],
        messageMap: {},
        rootMessageId: null,
        activeLeafId: null,
        ...mocks,
      }),
    );

    expect(mocks.clearMessages).toHaveBeenCalled();
  });

  it("loads conversation when activeConversationId changes and conversation exists", () => {
    const conv = makeConversation("c1");
    renderHook(() =>
      useAIChatPanelContentLifecycle({
        pageContext: null,
        activeConversationId: "c1",
        activeConversation: conv,
        messages: [],
        messageMap: {},
        rootMessageId: null,
        activeLeafId: null,
        ...mocks,
      }),
    );

    expect(mocks.loadConversation).toHaveBeenCalledWith(conv);
  });

  it("clears when conversation not found", () => {
    renderHook(() =>
      useAIChatPanelContentLifecycle({
        pageContext: null,
        activeConversationId: "missing",
        activeConversation: undefined,
        messages: [],
        messageMap: {},
        rootMessageId: null,
        activeLeafId: null,
        ...mocks,
      }),
    );

    expect(mocks.clearMessages).toHaveBeenCalled();
  });

  it("persists tree when messages exist", () => {
    const msg: ChatMessage = { id: "m1", role: "user", content: "hi", timestamp: 1 };
    const map: MessageMap = { m1: { ...msg, parentId: null } };

    renderHook(() =>
      useAIChatPanelContentLifecycle({
        pageContext: null,
        activeConversationId: "c1",
        activeConversation: makeConversation("c1", map),
        messages: [msg],
        messageMap: map,
        rootMessageId: "m1",
        activeLeafId: "m1",
        ...mocks,
      }),
    );

    expect(mocks.updateConversation).toHaveBeenCalledWith("c1", {
      messageMap: map,
      rootMessageId: "m1",
      activeLeafId: "m1",
    });
  });

  it("does not persist when no messages", () => {
    renderHook(() =>
      useAIChatPanelContentLifecycle({
        pageContext: null,
        activeConversationId: "c1",
        activeConversation: makeConversation("c1"),
        messages: [],
        messageMap: {},
        rootMessageId: null,
        activeLeafId: null,
        ...mocks,
      }),
    );

    expect(mocks.updateConversation).not.toHaveBeenCalled();
  });

  it("resets conversation when page context changes", () => {
    const params: LifecycleParams = {
      pageContext: { type: "note", pageId: "p1", pageTitle: "Page 1", pageContent: "" },
      activeConversationId: "c1",
      activeConversation: makeConversation("c1"),
      messages: [],
      messageMap: {},
      rootMessageId: null,
      activeLeafId: null,
      ...mocks,
    };

    const { rerender } = renderHook(
      ({ params }: { params: LifecycleParams }) => useAIChatPanelContentLifecycle(params),
      { initialProps: { params } },
    );

    mocks.clearMessages.mockClear();
    mocks.setActiveConversation.mockClear();

    rerender({
      params: {
        ...params,
        pageContext: { type: "note", pageId: "p2", pageTitle: "Page 2", pageContent: "" },
      },
    });

    expect(mocks.setActiveConversation).toHaveBeenCalledWith(null);
    expect(mocks.clearMessages).toHaveBeenCalled();
  });
});
