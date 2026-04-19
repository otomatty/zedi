import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { AIChatPanelContent } from "./AIChatPanelContent";

const mocks = vi.hoisted(() => ({
  activeViewTab: "workflow" as "chat" | "branch" | "workflow",
  setActiveViewTab: vi.fn(),
}));

vi.mock("@/hooks/useAIChatPanelContentLogic", () => ({
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

vi.mock("@/hooks/usePromoteToWiki", () => ({
  usePromoteToWiki: () => ({
    handlePromote: vi.fn(),
    isOpen: false,
    candidate: null,
    confirmPromote: vi.fn(),
    close: vi.fn(),
  }),
}));

vi.mock("@/lib/platform", () => ({
  isTauriDesktop: vi.fn(() => false),
}));

const platformMod = () =>
  import("@/lib/platform") as Promise<{ isTauriDesktop: ReturnType<typeof vi.fn> }>;

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
  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.activeViewTab = "workflow";
    const { isTauriDesktop } = await platformMod();
    isTauriDesktop.mockReturnValue(false);
  });

  it("falls back to chat when workflow tab is persisted on web", () => {
    render(
      <AIChatPanelContent
        activeConversationId={null}
        setActiveConversation={vi.fn()}
        contextEnabled={false}
        showConversationList={false}
      />,
    );

    expect(mocks.setActiveViewTab).toHaveBeenCalledWith("chat");
  });

  it("does not force a fallback on desktop", async () => {
    const { isTauriDesktop } = await platformMod();
    isTauriDesktop.mockReturnValue(true);
    mocks.activeViewTab = "chat";

    render(
      <AIChatPanelContent
        activeConversationId={null}
        setActiveConversation={vi.fn()}
        contextEnabled={false}
        showConversationList={false}
      />,
    );

    expect(mocks.setActiveViewTab).not.toHaveBeenCalled();
    expect(screen.queryByTestId("ai-chat-input")).not.toBeInTheDocument();
  });
});
