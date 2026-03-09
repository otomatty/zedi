import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AIChatPanel } from "./AIChatPanel";

const mockUseAIChatStore = vi.fn(() => ({
  isOpen: true,
  activeConversationId: null,
  setActiveConversation: vi.fn(),
  contextEnabled: false,
  showConversationList: false,
}));

vi.mock("../../stores/aiChatStore", () => ({
  useAIChatStore: () => mockUseAIChatStore(),
}));

vi.mock("../../contexts/AIChatContext", () => ({
  useAIChatContext: () => ({
    pageContext: null,
  }),
}));

vi.mock("../../hooks/usePageQueries", () => ({
  usePagesSummary: () => ({ data: [] }),
}));

vi.mock("../../hooks/useAIChatConversations", () => ({
  useAIChatConversations: () => ({
    createConversation: vi.fn(() => ({ id: "conv-1" })),
    updateConversation: vi.fn(),
    deleteConversation: vi.fn(),
    getConversation: vi.fn(),
    getConversationsForPage: () => [],
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
    sendMessage: vi.fn(),
    stopStreaming: vi.fn(),
    clearMessages: vi.fn(),
    loadMessages: vi.fn(),
    editAndResend: vi.fn(),
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
  AIChatConversationList: () => null,
}));

describe("AIChatPanel", () => {
  it("renders header, context bar, messages and input when open", () => {
    render(<AIChatPanel />);

    expect(screen.getByTestId("ai-chat-header")).toBeInTheDocument();
    expect(screen.getByTestId("ai-chat-context-bar")).toBeInTheDocument();
    expect(screen.getByTestId("ai-chat-messages")).toBeInTheDocument();
    expect(screen.getByTestId("ai-chat-input")).toBeInTheDocument();
  });

  it("returns null when closed", () => {
    mockUseAIChatStore.mockReturnValueOnce({
      isOpen: false,
      activeConversationId: null,
      setActiveConversation: vi.fn(),
      contextEnabled: false,
      showConversationList: false,
    });

    const { container } = render(<AIChatPanel />);

    expect(container.firstChild).toBeNull();
  });
});
