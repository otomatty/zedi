import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { AIChatPanelContent } from "./AIChatPanelContent";

const mocks = vi.hoisted(() => ({
  activeViewTab: "chat" as "chat" | "branch",
  setActiveViewTab: vi.fn(),
}));

vi.mock("@/hooks/aiChat/useAIChatPanelContentLogic", () => ({
  useAIChatPanelContentLogic: () => ({
    pageConversations: [],
    handleExecuteAction: vi.fn(),
    messages: [],
    messageMap: {},
    rootMessageId: null,
    activeLeafId: null,
    stopStreaming: vi.fn(),
    switchBranch: vi.fn(),
    isStreaming: false,
    handleSendMessage: vi.fn(),
    handleSelectConversation: vi.fn(),
    handleDeleteConversation: vi.fn(),
    handleEditMessage: vi.fn(),
    activeViewTab: mocks.activeViewTab,
    setActiveViewTab: mocks.setActiveViewTab,
    inputPrefill: null,
    focusEditorNonce: 0,
    handleSelectBranch: vi.fn(),
    handleBranchFrom: vi.fn(),
    handleDeleteBranchFromTree: vi.fn(),
  }),
}));

vi.mock("@/contexts/AIChatContext", () => ({
  useAIChatContext: () => ({
    insertAtCursorRef: { current: vi.fn() },
    pageContext: { type: "editor", pageId: "page-1", pageTitle: "Page 1" },
  }),
}));

vi.mock("@/hooks/wiki/usePromoteToWiki", () => ({
  usePromoteToWiki: () => ({
    handlePromote: vi.fn(),
    open: false,
    conversationText: "",
    close: vi.fn(),
  }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@zedi/ui", () => ({
  cn: (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(" "),
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock("./AIChatHeader", () => ({
  AIChatHeader: () => <div data-testid="ai-chat-header" />,
}));

vi.mock("./AIChatViewTabs", () => ({
  AIChatViewTabs: () => <div data-testid="ai-chat-view-tabs" />,
}));

vi.mock("./AIChatInput", () => ({
  AIChatInput: () => <div data-testid="ai-chat-input" />,
}));

vi.mock("./AIChatMessages", () => ({
  AIChatMessages: () => <div data-testid="ai-chat-messages" />,
}));

vi.mock("./AIChatContextBar", () => ({
  AIChatContextBar: () => <div data-testid="ai-chat-context-bar" />,
}));

vi.mock("./AIChatConversationList", () => ({
  AIChatConversationList: () => <div data-testid="ai-chat-conversation-list" />,
}));

vi.mock("./PromoteToWikiDialog", () => ({
  PromoteToWikiDialog: () => null,
}));

describe("AIChatPanelContent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.activeViewTab = "chat";
  });

  const renderPanel = () =>
    render(
      <AIChatPanelContent
        activeConversationId={null}
        setActiveConversation={vi.fn()}
        contextEnabled={false}
        showConversationList={false}
      />,
    );

  it("shows the messages and the input on the chat tab", () => {
    renderPanel();

    expect(screen.getByTestId("ai-chat-messages")).toBeInTheDocument();
    expect(screen.getByTestId("ai-chat-input")).toBeInTheDocument();
    expect(mocks.setActiveViewTab).not.toHaveBeenCalled();
  });

  it("keeps the input but not the messages on the branch tab", () => {
    mocks.activeViewTab = "branch";

    renderPanel();

    expect(screen.queryByTestId("ai-chat-messages")).not.toBeInTheDocument();
    expect(screen.getByTestId("ai-chat-input")).toBeInTheDocument();
  });
});
