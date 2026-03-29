import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { Location } from "react-router-dom";
import type { ChatMessage, Conversation, MessageMap } from "@/types/aiChat";
import { AI_CHAT_BASE_PATH, aiChatInitialExecutedStorageKey } from "@/constants/aiChatSidebar";
import { useAIChatDetailLifecycle } from "./useAIChatDetailLifecycle";

type LifecycleParams = Parameters<typeof useAIChatDetailLifecycle>[0];
type LifecycleMocks = Pick<
  LifecycleParams,
  | "navigate"
  | "setActiveConversation"
  | "sendMessage"
  | "loadConversation"
  | "clearMessages"
  | "updateConversation"
>;

const emptyTree = {
  messageMap: {} as MessageMap,
  rootMessageId: null as string | null,
  activeLeafId: null as string | null,
};

function makeLocation(overrides: Partial<Location> & { state?: unknown }): Location {
  return {
    pathname: "/ai/c1",
    search: "",
    hash: "",
    state: null,
    key: "default",
    ...overrides,
  } as Location;
}

function renderLifecycle(mocks: LifecycleMocks, overrides: Partial<LifecycleParams>) {
  return renderHook(() =>
    useAIChatDetailLifecycle({
      conversationId: undefined,
      conversation: undefined,
      location: makeLocation({ pathname: "/ai" }),
      ...mocks,
      messages: [],
      messageMap: emptyTree.messageMap,
      rootMessageId: emptyTree.rootMessageId,
      activeLeafId: emptyTree.activeLeafId,
      ...overrides,
    }),
  );
}

describe("useAIChatDetailLifecycle", () => {
  const mocks: LifecycleMocks = {
    navigate: vi.fn(),
    setActiveConversation: vi.fn(),
    sendMessage: vi.fn(),
    loadConversation: vi.fn(),
    clearMessages: vi.fn(),
    updateConversation: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("navigates to AI_CHAT_BASE_PATH when conversationId is undefined", () => {
    renderLifecycle(mocks, {
      conversationId: undefined,
      conversation: undefined,
      location: makeLocation({ pathname: "/ai" }),
    });

    expect(mocks.navigate).toHaveBeenCalledWith(AI_CHAT_BASE_PATH, { replace: true });
  });

  it("calls setActiveConversation on mount and clears on unmount when conversationId is set", () => {
    const conv: Conversation = {
      id: "c1",
      title: "t",
      messageMap: {},
      rootMessageId: null,
      activeLeafId: null,
      createdAt: 0,
      updatedAt: 0,
    };

    const { unmount } = renderLifecycle(mocks, {
      conversationId: "c1",
      conversation: conv,
      location: makeLocation({ pathname: "/ai/c1" }),
    });

    expect(mocks.setActiveConversation).toHaveBeenCalledWith("c1");
    unmount();
    expect(mocks.setActiveConversation).toHaveBeenCalledWith(null);
  });

  it("redirects to base when conversation is missing and no landing payload", async () => {
    renderLifecycle(mocks, {
      conversationId: "c1",
      conversation: undefined,
      location: makeLocation({ pathname: "/ai/c1", state: {} }),
    });

    await waitFor(() => {
      expect(mocks.navigate).toHaveBeenCalledWith(AI_CHAT_BASE_PATH, { replace: true });
    });
  });

  it("does not redirect when conversation missing but landing initialMessage is pending", () => {
    renderLifecycle(mocks, {
      conversationId: "c1",
      conversation: undefined,
      location: {
        pathname: "/ai/c1",
        search: "",
        hash: "",
        state: { initialMessage: "hello from landing" },
        key: "k",
      } as Location,
    });

    expect(mocks.navigate).not.toHaveBeenCalledWith(AI_CHAT_BASE_PATH, { replace: true });
  });

  it("persists tree to updateConversation when messages exist", () => {
    const msg: ChatMessage = {
      id: "m1",
      role: "user",
      content: "hi",
      timestamp: 1,
    };
    const map: MessageMap = {
      m1: { ...msg, parentId: null },
    };

    renderLifecycle(mocks, {
      conversationId: "c1",
      conversation: {
        id: "c1",
        title: "t",
        messageMap: map,
        rootMessageId: "m1",
        activeLeafId: "m1",
        createdAt: 0,
        updatedAt: 0,
      },
      location: makeLocation({ pathname: "/ai/c1" }),
      messages: [msg],
      messageMap: map,
      rootMessageId: "m1",
      activeLeafId: "m1",
    });

    expect(mocks.updateConversation).toHaveBeenCalledWith("c1", {
      messageMap: map,
      rootMessageId: "m1",
      activeLeafId: "m1",
    });
  });

  it("loads conversation when initial executed flag is set but messages are empty (remount recovery)", () => {
    const convId = "c-exec-remount";
    const conv: Conversation = {
      id: convId,
      title: "t",
      messageMap: {
        m1: {
          id: "m1",
          role: "user",
          content: "hi",
          timestamp: 1,
          parentId: null,
        },
      },
      rootMessageId: "m1",
      activeLeafId: "m1",
      createdAt: 0,
      updatedAt: 0,
    };

    try {
      sessionStorage.setItem(aiChatInitialExecutedStorageKey(convId), "1");
    } catch {
      // ignore
    }

    renderLifecycle(mocks, {
      conversationId: convId,
      conversation: conv,
      location: makeLocation({ pathname: `/ai/${convId}`, state: {} }),
      messages: [],
      messageMap: {},
      rootMessageId: null,
      activeLeafId: null,
    });

    expect(mocks.loadConversation).toHaveBeenCalledWith(conv);
  });

  it("sends initial message only once under StrictMode (double mount guard)", async () => {
    const convId = "strict-conv";
    const conv: Conversation = {
      id: convId,
      title: "",
      messageMap: {},
      rootMessageId: null,
      activeLeafId: null,
      createdAt: 0,
      updatedAt: 0,
    };

    try {
      sessionStorage.removeItem(aiChatInitialExecutedStorageKey(convId));
    } catch {
      // ignore
    }

    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.StrictMode, null, children);

    renderHook(
      () =>
        useAIChatDetailLifecycle({
          conversationId: convId,
          conversation: conv,
          location: {
            pathname: `/ai/${convId}`,
            search: "",
            hash: "",
            state: { initialMessage: "hello strict" },
            key: "strict-key",
          } as Location,
          ...mocks,
          messages: [],
          messageMap: {},
          rootMessageId: null,
          activeLeafId: null,
        }),
      { wrapper },
    );

    await waitFor(() => {
      expect(mocks.sendMessage).toHaveBeenCalledTimes(1);
    });
    expect(mocks.sendMessage).toHaveBeenCalledWith("hello strict", []);
  });

  afterEach(() => {
    try {
      sessionStorage.clear();
    } catch {
      // ignore
    }
  });
});
