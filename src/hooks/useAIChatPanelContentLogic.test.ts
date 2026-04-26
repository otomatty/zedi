/**
 * Tests for {@link useAIChatPanelContentLogic}.
 * {@link useAIChatPanelContentLogic} のテスト。
 *
 * Issue #743: cover the composition contract — page-title derivation feeds
 * `useAIChat`, page conversations come from the `useAIChatConversations`
 * helper, lifecycle/handler params receive the right values, and the returned
 * object exposes both transcript state and handlers.
 * Issue #743: 構成上の契約を検証する — ページタイトル抽出が `useAIChat` に渡る、
 * `useAIChatConversations` ヘルパーから page conversations が取得される、ライフサイクルと
 * ハンドラに正しい値が渡る、戻り値にトランスクリプト状態とハンドラが揃う。
 */

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

import type {
  Conversation,
  MessageMap,
  PageContext,
  ReferencedPage,
  TreeChatMessage,
} from "@/types/aiChat";

// --- Mock setup ---------------------------------------------------------

const mockUseAIChatContext = vi.fn();
const mockUsePagesSummary = vi.fn();

const mockGetConversation = vi.fn();
const mockGetConversationsForPage = vi.fn();
const mockCreateConversation = vi.fn();
const mockUpdateConversation = vi.fn();
const mockDeleteConversation = vi.fn();

const mockHandleExecuteAction = vi.fn();

type AIChatHookSpy = {
  options: unknown;
};
const aiChatHookSpy: AIChatHookSpy = { options: undefined };

const mockSendMessage = vi.fn();
const mockStopStreaming = vi.fn();
const mockClearMessages = vi.fn();
const mockLoadConversation = vi.fn();
const mockEditAndResend = vi.fn();
const mockSwitchBranch = vi.fn();
const mockNavigateToNode = vi.fn();
const mockSetBranchPoint = vi.fn();
const mockDeleteBranch = vi.fn();
const mockPrepareBranchFromUserMessage = vi.fn();

const lifecycleSpy = vi.fn();

vi.mock("@/contexts/AIChatContext", () => ({
  useAIChatContext: () => mockUseAIChatContext(),
}));

vi.mock("@/hooks/usePageQueries", () => ({
  usePagesSummary: () => mockUsePagesSummary(),
}));

vi.mock("@/hooks/useAIChatConversations", () => ({
  useAIChatConversations: () => ({
    getConversation: (id: string) => mockGetConversation(id),
    getConversationsForPage: (pageId: string | undefined, type: string | undefined) =>
      mockGetConversationsForPage(pageId, type),
    createConversation: () => mockCreateConversation(),
    updateConversation: (id: string, patch: unknown) => mockUpdateConversation(id, patch),
    deleteConversation: (id: string) => mockDeleteConversation(id),
  }),
}));

vi.mock("@/hooks/useAIChatActions", () => ({
  useAIChatActions: ({ pageContext }: { pageContext: PageContext | null }) => ({
    handleExecuteAction: (...args: unknown[]) => mockHandleExecuteAction(pageContext, ...args),
  }),
}));

vi.mock("@/hooks/useAIChat", () => ({
  useAIChat: (options: unknown) => {
    aiChatHookSpy.options = options;
    return {
      messages: [{ id: "u1", role: "user", content: "Hi", timestamp: 0 }] as TreeChatMessage[],
      messageMap: {
        u1: { id: "u1", role: "user", parentId: null, content: "Hi", timestamp: 0 },
      } satisfies MessageMap,
      rootMessageId: "u1",
      activeLeafId: "u1",
      sendMessage: (...args: unknown[]) => mockSendMessage(...args),
      stopStreaming: (...args: unknown[]) => mockStopStreaming(...args),
      clearMessages: () => mockClearMessages(),
      loadConversation: (c: Conversation) => mockLoadConversation(c),
      editAndResend: (...args: unknown[]) => mockEditAndResend(...args),
      switchBranch: (...args: unknown[]) => mockSwitchBranch(...args),
      navigateToNode: (id: string) => mockNavigateToNode(id),
      setBranchPoint: (id: string) => mockSetBranchPoint(id),
      deleteBranch: (id: string) => mockDeleteBranch(id),
      prepareBranchFromUserMessage: (id: string) => mockPrepareBranchFromUserMessage(id),
      isStreaming: true,
    };
  },
}));

vi.mock("@/hooks/useAIChatPanelContentLifecycle", () => ({
  useAIChatPanelContentLifecycle: (params: unknown) => {
    lifecycleSpy(params);
  },
}));

import { useAIChatPanelContentLogic } from "./useAIChatPanelContentLogic";

// --- Test helpers -------------------------------------------------------

const baseSetActiveConversation = vi.fn();

const editorContext: PageContext = {
  type: "editor",
  pageId: "page-1",
  pageTitle: "Note",
  pageFullContent: "",
};

beforeEach(() => {
  vi.clearAllMocks();
  aiChatHookSpy.options = undefined;
  mockUseAIChatContext.mockReturnValue({ pageContext: editorContext });
  mockUsePagesSummary.mockReturnValue({ data: [] });
  mockGetConversation.mockReturnValue(undefined);
  mockGetConversationsForPage.mockReturnValue([]);
});

// --- Tests --------------------------------------------------------------

describe("useAIChatPanelContentLogic - composition", () => {
  it("forwards pageContext, contextEnabled, and existingPageTitles to useAIChat", () => {
    mockUsePagesSummary.mockReturnValue({
      data: [
        { id: "p1", title: "  Alpha  ", isDeleted: false },
        { id: "p2", title: "Beta", isDeleted: false },
        { id: "p3", title: "Gamma", isDeleted: true },
        { id: "p4", title: "   ", isDeleted: false },
      ],
    });

    renderHook(() =>
      useAIChatPanelContentLogic({
        activeConversationId: null,
        setActiveConversation: baseSetActiveConversation,
        contextEnabled: true,
      }),
    );

    expect(aiChatHookSpy.options).toMatchObject({
      pageContext: editorContext,
      contextEnabled: true,
    });
    const opts = aiChatHookSpy.options as {
      existingPageTitles: string[];
      availablePages: Array<{ id: string; title: string; isDeleted: boolean }>;
    };
    expect(opts.existingPageTitles).toEqual(["Alpha", "Beta"]);
    expect(opts.availablePages).toHaveLength(4);
  });

  it("queries pageConversations using pageContext.pageId and pageContext.type", () => {
    mockGetConversationsForPage.mockReturnValue([
      {
        id: "c1",
        title: "",
        messageMap: {},
        rootMessageId: null,
        activeLeafId: null,
        createdAt: 0,
        updatedAt: 0,
      } as Conversation,
    ]);

    const { result } = renderHook(() =>
      useAIChatPanelContentLogic({
        activeConversationId: null,
        setActiveConversation: baseSetActiveConversation,
        contextEnabled: false,
      }),
    );

    expect(mockGetConversationsForPage).toHaveBeenCalledWith("page-1", "editor");
    expect(result.current.pageConversations).toHaveLength(1);
  });

  it("passes pageContext through to useAIChatActions and exposes handleExecuteAction", () => {
    const { result } = renderHook(() =>
      useAIChatPanelContentLogic({
        activeConversationId: null,
        setActiveConversation: baseSetActiveConversation,
        contextEnabled: false,
      }),
    );

    result.current.handleExecuteAction({ type: "noop" } as unknown as Parameters<
      typeof result.current.handleExecuteAction
    >[0]);

    expect(mockHandleExecuteAction).toHaveBeenCalledTimes(1);
    expect(mockHandleExecuteAction.mock.calls[0][0]).toEqual(editorContext);
    expect(mockHandleExecuteAction.mock.calls[0][1]).toEqual({ type: "noop" });
  });

  it("returns the streaming/messages snapshot from useAIChat", () => {
    const { result } = renderHook(() =>
      useAIChatPanelContentLogic({
        activeConversationId: null,
        setActiveConversation: baseSetActiveConversation,
        contextEnabled: false,
      }),
    );

    expect(result.current.messages).toHaveLength(1);
    expect(result.current.rootMessageId).toBe("u1");
    expect(result.current.activeLeafId).toBe("u1");
    expect(result.current.isStreaming).toBe(true);
  });

  it("forwards the active conversation lookup to the lifecycle hook", () => {
    const conv: Conversation = {
      id: "c-active",
      title: "T",
      messageMap: {},
      rootMessageId: null,
      activeLeafId: null,
      createdAt: 0,
      updatedAt: 0,
    };
    mockGetConversation.mockReturnValue(conv);

    renderHook(() =>
      useAIChatPanelContentLogic({
        activeConversationId: "c-active",
        setActiveConversation: baseSetActiveConversation,
        contextEnabled: false,
      }),
    );

    expect(mockGetConversation).toHaveBeenCalledWith("c-active");
    expect(lifecycleSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        pageContext: editorContext,
        activeConversation: conv,
        activeConversationId: "c-active",
      }),
    );
  });

  it("does not look up a conversation when activeConversationId is null", () => {
    renderHook(() =>
      useAIChatPanelContentLogic({
        activeConversationId: null,
        setActiveConversation: baseSetActiveConversation,
        contextEnabled: false,
      }),
    );

    expect(mockGetConversation).not.toHaveBeenCalled();
    expect(lifecycleSpy).toHaveBeenCalledWith(
      expect.objectContaining({ activeConversation: undefined }),
    );
  });

  it("memoizes existingPageTitles when pages reference is unchanged", () => {
    const pages = [
      { id: "p1", title: "Alpha", isDeleted: false },
      { id: "p2", title: "Beta", isDeleted: false },
    ];
    mockUsePagesSummary.mockReturnValue({ data: pages });

    const { rerender } = renderHook(() =>
      useAIChatPanelContentLogic({
        activeConversationId: null,
        setActiveConversation: baseSetActiveConversation,
        contextEnabled: false,
      }),
    );

    const titlesA = (aiChatHookSpy.options as { existingPageTitles: string[] }).existingPageTitles;
    rerender();
    const titlesB = (aiChatHookSpy.options as { existingPageTitles: string[] }).existingPageTitles;

    expect(titlesA).toBe(titlesB);
  });
});

describe("useAIChatPanelContentLogic - handlers wiring", () => {
  it("handleSendMessage creates a conversation snapshot from pageContext on first send", async () => {
    mockCreateConversation.mockReturnValue({
      id: "new-conv",
      title: "",
      messageMap: {},
      rootMessageId: null,
      activeLeafId: null,
      createdAt: 0,
      updatedAt: 0,
    });

    const setActive = vi.fn();
    const { result } = renderHook(() =>
      useAIChatPanelContentLogic({
        activeConversationId: null,
        setActiveConversation: setActive,
        contextEnabled: false,
      }),
    );

    await act(async () => {
      await result.current.handleSendMessage("hi", [] as ReferencedPage[]);
    });

    expect(mockCreateConversation).toHaveBeenCalledTimes(1);
    expect(setActive).toHaveBeenCalledWith("new-conv");
    expect(mockSendMessage).toHaveBeenCalledWith("hi", []);
  });

  it("handleSelectConversation just delegates to setActiveConversation", () => {
    const setActive = vi.fn();
    const { result } = renderHook(() =>
      useAIChatPanelContentLogic({
        activeConversationId: "c1",
        setActiveConversation: setActive,
        contextEnabled: false,
      }),
    );

    act(() => {
      result.current.handleSelectConversation("c2");
    });

    expect(setActive).toHaveBeenCalledWith("c2");
    expect(mockCreateConversation).not.toHaveBeenCalled();
  });

  it("handleDeleteConversation clears active when deleting the active id", () => {
    const setActive = vi.fn();
    const { result } = renderHook(() =>
      useAIChatPanelContentLogic({
        activeConversationId: "c1",
        setActiveConversation: setActive,
        contextEnabled: false,
      }),
    );

    act(() => {
      result.current.handleDeleteConversation("c1");
    });

    expect(mockDeleteConversation).toHaveBeenCalledWith("c1");
    expect(setActive).toHaveBeenCalledWith(null);
    expect(mockClearMessages).toHaveBeenCalledTimes(1);
  });

  it("handleDeleteConversation leaves active alone when deleting another id", () => {
    const setActive = vi.fn();
    const { result } = renderHook(() =>
      useAIChatPanelContentLogic({
        activeConversationId: "c1",
        setActiveConversation: setActive,
        contextEnabled: false,
      }),
    );

    act(() => {
      result.current.handleDeleteConversation("c-other");
    });

    expect(mockDeleteConversation).toHaveBeenCalledWith("c-other");
    expect(setActive).not.toHaveBeenCalled();
    expect(mockClearMessages).not.toHaveBeenCalled();
  });

  it("handleEditMessage forwards to editAndResend", () => {
    const { result } = renderHook(() =>
      useAIChatPanelContentLogic({
        activeConversationId: "c1",
        setActiveConversation: baseSetActiveConversation,
        contextEnabled: false,
      }),
    );

    act(() => {
      result.current.handleEditMessage("m1", "new");
    });

    expect(mockEditAndResend).toHaveBeenCalledWith("m1", "new");
  });

  it("handleSelectBranch navigates and switches view tab to chat", () => {
    const { result } = renderHook(() =>
      useAIChatPanelContentLogic({
        activeConversationId: "c1",
        setActiveConversation: baseSetActiveConversation,
        contextEnabled: false,
      }),
    );

    act(() => {
      // Move to a different tab first to assert the switch back to "chat".
      result.current.setActiveViewTab("branchTree");
    });
    expect(result.current.activeViewTab).toBe("branchTree");

    act(() => {
      result.current.handleSelectBranch("u1");
    });

    expect(mockNavigateToNode).toHaveBeenCalledWith("u1");
    expect(result.current.activeViewTab).toBe("chat");
  });

  it("handleBranchFrom on a user message prefills input with branch text", () => {
    mockPrepareBranchFromUserMessage.mockReturnValue("draft from user");

    const { result } = renderHook(() =>
      useAIChatPanelContentLogic({
        activeConversationId: "c1",
        setActiveConversation: baseSetActiveConversation,
        contextEnabled: false,
      }),
    );

    act(() => {
      result.current.handleBranchFrom("u1");
    });

    expect(mockSetBranchPoint).toHaveBeenCalledWith("u1");
    expect(mockPrepareBranchFromUserMessage).toHaveBeenCalledWith("u1");
    expect(result.current.inputPrefill?.text).toBe("draft from user");
    expect(result.current.activeViewTab).toBe("chat");
  });

  it("handleBranchFrom is a no-op when nodeId is unknown", () => {
    const { result } = renderHook(() =>
      useAIChatPanelContentLogic({
        activeConversationId: "c1",
        setActiveConversation: baseSetActiveConversation,
        contextEnabled: false,
      }),
    );

    act(() => {
      result.current.handleBranchFrom("unknown");
    });

    expect(mockSetBranchPoint).not.toHaveBeenCalled();
    expect(mockPrepareBranchFromUserMessage).not.toHaveBeenCalled();
  });

  it("handleDeleteBranchFromTree forwards to deleteBranch", () => {
    const { result } = renderHook(() =>
      useAIChatPanelContentLogic({
        activeConversationId: "c1",
        setActiveConversation: baseSetActiveConversation,
        contextEnabled: false,
      }),
    );

    act(() => {
      result.current.handleDeleteBranchFromTree("u1");
    });

    expect(mockDeleteBranch).toHaveBeenCalledWith("u1");
  });

  it("stopStreaming and switchBranch on the returned object call the underlying hook", () => {
    const { result } = renderHook(() =>
      useAIChatPanelContentLogic({
        activeConversationId: "c1",
        setActiveConversation: baseSetActiveConversation,
        contextEnabled: false,
      }),
    );

    act(() => {
      result.current.stopStreaming();
      result.current.switchBranch("u1", "next");
    });

    expect(mockStopStreaming).toHaveBeenCalledTimes(1);
    expect(mockSwitchBranch).toHaveBeenCalledWith("u1", "next");
  });
});

// React unused-import guard: keeps module reference live for JSX runtime.
void React;
