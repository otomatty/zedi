import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { MessageMap, TreeChatMessage } from "@/types/aiChat";
import { useAIChatPanelContentHandlers } from "./useAIChatPanelContentHandlers";

function createMocks() {
  const userMsg: TreeChatMessage = {
    id: "u1",
    role: "user",
    content: "hello",
    timestamp: 1,
    parentId: null,
  };
  const assistantMsg: TreeChatMessage = {
    id: "a1",
    role: "assistant",
    content: "hi",
    timestamp: 2,
    parentId: "u1",
  };
  const messageMap: MessageMap = { u1: userMsg, a1: assistantMsg };

  return {
    activeConversationId: "c1" as string | null,
    setActiveConversation: vi.fn(),
    pageContext: null,
    createConversation: vi.fn(() => ({
      id: "new-conv",
      title: "",
      messageMap: {},
      rootMessageId: null,
      activeLeafId: null,
      createdAt: 0,
      updatedAt: 0,
    })),
    sendMessage: vi.fn(),
    deleteConversation: vi.fn(),
    clearMessages: vi.fn(),
    editAndResend: vi.fn(),
    navigateToNode: vi.fn(),
    setBranchPoint: vi.fn(),
    prepareBranchFromUserMessage: vi.fn(() => "prefilled text"),
    messageMap,
    deleteBranch: vi.fn(),
  };
}

describe("useAIChatPanelContentHandlers", () => {
  let mocks: ReturnType<typeof createMocks>;

  beforeEach(() => {
    mocks = createMocks();
  });

  it("handleSendMessage sends message when conversation is active", () => {
    const { result } = renderHook(() => useAIChatPanelContentHandlers(mocks));

    act(() => result.current.handleSendMessage("hey"));

    expect(mocks.createConversation).not.toHaveBeenCalled();
    expect(mocks.sendMessage).toHaveBeenCalledWith("hey", []);
  });

  it("handleSendMessage creates conversation when no active id", () => {
    mocks.activeConversationId = null;
    const { result } = renderHook(() => useAIChatPanelContentHandlers(mocks));

    act(() => result.current.handleSendMessage("first msg"));

    expect(mocks.createConversation).toHaveBeenCalled();
    expect(mocks.setActiveConversation).toHaveBeenCalledWith("new-conv");
    expect(mocks.sendMessage).toHaveBeenCalledWith("first msg", []);
  });

  it("handleSelectConversation sets active conversation", () => {
    const { result } = renderHook(() => useAIChatPanelContentHandlers(mocks));

    act(() => result.current.handleSelectConversation("c2"));

    expect(mocks.setActiveConversation).toHaveBeenCalledWith("c2");
  });

  it("handleDeleteConversation clears messages when deleting active", () => {
    const { result } = renderHook(() => useAIChatPanelContentHandlers(mocks));

    act(() => result.current.handleDeleteConversation("c1"));

    expect(mocks.deleteConversation).toHaveBeenCalledWith("c1");
    expect(mocks.setActiveConversation).toHaveBeenCalledWith(null);
    expect(mocks.clearMessages).toHaveBeenCalled();
  });

  it("handleDeleteConversation does not clear when deleting non-active", () => {
    const { result } = renderHook(() => useAIChatPanelContentHandlers(mocks));

    act(() => result.current.handleDeleteConversation("c-other"));

    expect(mocks.deleteConversation).toHaveBeenCalledWith("c-other");
    expect(mocks.setActiveConversation).not.toHaveBeenCalled();
    expect(mocks.clearMessages).not.toHaveBeenCalled();
  });

  it("handleEditMessage delegates to editAndResend", () => {
    const { result } = renderHook(() => useAIChatPanelContentHandlers(mocks));

    act(() => result.current.handleEditMessage("u1", "updated"));

    expect(mocks.editAndResend).toHaveBeenCalledWith("u1", "updated");
  });

  it("handleSelectBranch navigates to node and switches to chat tab", () => {
    const { result } = renderHook(() => useAIChatPanelContentHandlers(mocks));

    act(() => result.current.handleSelectBranch("a1"));

    expect(mocks.navigateToNode).toHaveBeenCalledWith("a1");
    expect(result.current.activeViewTab).toBe("chat");
  });

  it("handleBranchFrom on user node prefills input", () => {
    const { result } = renderHook(() => useAIChatPanelContentHandlers(mocks));

    act(() => result.current.handleBranchFrom("u1"));

    expect(mocks.setBranchPoint).toHaveBeenCalledWith("u1");
    expect(mocks.prepareBranchFromUserMessage).toHaveBeenCalledWith("u1");
    expect(result.current.inputPrefill?.text).toBe("prefilled text");
    expect(result.current.activeViewTab).toBe("chat");
  });

  it("handleBranchFrom on assistant node focuses editor", () => {
    const { result } = renderHook(() => useAIChatPanelContentHandlers(mocks));

    const initialNonce = result.current.focusEditorNonce;
    act(() => result.current.handleBranchFrom("a1"));

    expect(mocks.setBranchPoint).toHaveBeenCalledWith("a1");
    expect(result.current.inputPrefill).toBeNull();
    expect(result.current.focusEditorNonce).toBe(initialNonce + 1);
    expect(result.current.activeViewTab).toBe("chat");
  });

  it("handleBranchFrom on unknown node does nothing", () => {
    const { result } = renderHook(() => useAIChatPanelContentHandlers(mocks));

    act(() => result.current.handleBranchFrom("unknown"));

    expect(mocks.setBranchPoint).not.toHaveBeenCalled();
  });

  it("handleDeleteBranchFromTree delegates to deleteBranch", () => {
    const { result } = renderHook(() => useAIChatPanelContentHandlers(mocks));

    act(() => result.current.handleDeleteBranchFromTree("a1"));

    expect(mocks.deleteBranch).toHaveBeenCalledWith("a1");
  });

  it("activeViewTab defaults to chat", () => {
    const { result } = renderHook(() => useAIChatPanelContentHandlers(mocks));
    expect(result.current.activeViewTab).toBe("chat");
  });
});
