import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { PageContext } from "../../types/aiChat";
import { AIChatPanel } from "./AIChatPanel";

/**
 * Shared spies and mutable page context for AIChatPanel tests.
 * AIChatPanel テスト用の共有スパイと可変ページコンテキスト。
 */
const mocks = vi.hoisted(() => {
  const setActiveConversation = vi.fn();
  const clearMessages = vi.fn();
  const loadConversation = vi.fn();
  /**
   * Stable across renders so AIChatPanel effects do not re-run spuriously on rerender.
   * レンダー間で参照を固定し、AIChatPanel の effect が不要に再実行されないようにする。
   */
  const createConversation = vi.fn(() => ({ id: "conv-1" }));
  const updateConversation = vi.fn();
  const deleteConversation = vi.fn();
  const getConversation = vi.fn();
  const getConversationsForPage = vi.fn(() => []);
  const mockPageContextRef = { current: null as PageContext | null };
  const mockStore = {
    isOpen: true,
    activeConversationId: null as string | null,
    setActiveConversation,
    contextEnabled: false,
    showConversationList: false,
  };
  return {
    mockPageContextRef,
    mockStore,
    clearMessages,
    loadConversation,
    setActiveConversation,
    createConversation,
    updateConversation,
    deleteConversation,
    getConversation,
    getConversationsForPage,
  };
});

vi.mock("../../stores/aiChatStore", () => ({
  useAIChatStore: () => mocks.mockStore,
}));

vi.mock("../../contexts/AIChatContext", () => ({
  useAIChatContext: () => ({
    pageContext: mocks.mockPageContextRef.current,
  }),
}));

vi.mock("../../hooks/usePageQueries", () => ({
  usePagesSummary: () => ({ data: [] }),
}));

vi.mock("../../hooks/useAIChatConversations", () => ({
  useAIChatConversations: () => ({
    createConversation: mocks.createConversation,
    updateConversation: mocks.updateConversation,
    deleteConversation: mocks.deleteConversation,
    getConversation: mocks.getConversation,
    getConversationsForPage: mocks.getConversationsForPage,
  }),
}));

vi.mock("../../hooks/useAIChatActions", () => ({
  useAIChatActions: () => ({
    handleExecuteAction: vi.fn(),
  }),
}));

vi.mock("../../hooks/useAIChat", () => ({
  useAIChat: () => ({
    messages: [],
    messageMap: {},
    rootMessageId: null,
    activeLeafId: null,
    sendMessage: vi.fn(),
    stopStreaming: vi.fn(),
    clearMessages: mocks.clearMessages,
    loadConversation: mocks.loadConversation,
    editAndResend: vi.fn(),
    switchBranch: vi.fn(),
    navigateToNode: vi.fn(),
    setBranchPoint: vi.fn(),
    deleteBranch: vi.fn(),
    prepareBranchFromUserMessage: vi.fn(() => ""),
    isStreaming: false,
  }),
}));

vi.mock("./AIChatHeader", () => ({
  AIChatHeader: () => <div data-testid="ai-chat-header">Header</div>,
}));
vi.mock("./AIChatContextBar", () => ({
  AIChatContextBar: () => <div data-testid="ai-chat-context-bar">ContextBar</div>,
}));
vi.mock("./AIChatMessages", () => ({
  AIChatMessages: () => <div data-testid="ai-chat-messages">Messages</div>,
}));
vi.mock("./AIChatInput", () => ({
  AIChatInput: () => <div data-testid="ai-chat-input">Input</div>,
}));
vi.mock("./AIChatConversationList", () => ({
  AIChatConversationList: () => <div data-testid="ai-chat-conversation-list">ConversationList</div>,
}));

describe("AIChatPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockPageContextRef.current = {
      type: "editor",
      pageId: "page-1",
      pageTitle: "Page 1",
    };
    mocks.mockStore.isOpen = true;
    mocks.mockStore.activeConversationId = null;
    mocks.mockStore.showConversationList = false;
  });

  it("renders header, context bar, messages and input when open", () => {
    render(<AIChatPanel />);

    expect(screen.getByTestId("ai-chat-header")).toBeInTheDocument();
    expect(screen.getByTestId("ai-chat-context-bar")).toBeInTheDocument();
    expect(screen.getByTestId("ai-chat-messages")).toBeInTheDocument();
    expect(screen.getByTestId("ai-chat-input")).toBeInTheDocument();
  });

  it("returns null when closed", () => {
    mocks.mockStore.isOpen = false;

    const { container } = render(<AIChatPanel />);

    expect(container.firstChild).toBeNull();
  });

  it("calls setActiveConversation(null) and clearMessages when page key (pageId) changes", () => {
    mocks.mockPageContextRef.current = {
      type: "editor",
      pageId: "page-1",
      pageTitle: "A",
    };
    const { rerender } = render(<AIChatPanel />);
    vi.clearAllMocks();

    mocks.mockPageContextRef.current = {
      type: "editor",
      pageId: "page-2",
      pageTitle: "B",
    };
    rerender(<AIChatPanel />);

    expect(mocks.setActiveConversation).toHaveBeenCalledWith(null);
    expect(mocks.clearMessages).toHaveBeenCalledTimes(1);
  });

  it("calls setActiveConversation(null) and clearMessages when page key (type without pageId) changes", () => {
    mocks.mockPageContextRef.current = { type: "home" };
    const { rerender } = render(<AIChatPanel />);
    vi.clearAllMocks();

    mocks.mockPageContextRef.current = { type: "search" };
    rerender(<AIChatPanel />);

    expect(mocks.setActiveConversation).toHaveBeenCalledWith(null);
    expect(mocks.clearMessages).toHaveBeenCalledTimes(1);
  });

  it("does not reset active conversation when page key is unchanged", () => {
    mocks.mockPageContextRef.current = {
      type: "editor",
      pageId: "page-1",
      pageTitle: "A",
    };
    const { rerender } = render(<AIChatPanel />);

    mocks.mockPageContextRef.current = {
      type: "editor",
      pageId: "page-1",
      pageTitle: "Title updated only",
    };
    rerender(<AIChatPanel />);

    expect(mocks.setActiveConversation).not.toHaveBeenCalled();
  });

  it("renders conversation list when showConversationList is true", () => {
    mocks.mockStore.showConversationList = true;

    render(<AIChatPanel />);

    expect(screen.getByTestId("ai-chat-conversation-list")).toBeInTheDocument();
  });

  it("does not render conversation list when showConversationList is false", () => {
    mocks.mockStore.showConversationList = false;

    render(<AIChatPanel />);

    expect(screen.queryByTestId("ai-chat-conversation-list")).not.toBeInTheDocument();
  });

  it("renders messages area while panel is open (including when conversation list is shown)", () => {
    mocks.mockStore.showConversationList = true;

    render(<AIChatPanel />);

    expect(screen.getByTestId("ai-chat-messages")).toBeInTheDocument();
  });
});
