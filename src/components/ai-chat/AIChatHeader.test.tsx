/**
 * AI chat dock header: list, new, open full page, close.
 * AI チャットドックのヘッダー。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AIChatHeader } from "./AIChatHeader";
import type { AISettings } from "@/types/ai";

const navigate = vi.fn();
const closePanel = vi.fn();
const storeState = vi.hoisted(() => ({
  activeConversationId: null as string | null,
}));
const aiSettingsState = vi.hoisted(() => ({
  current: null as AISettings | null,
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => navigate,
  };
});

vi.mock("@/stores/aiChatStore", () => ({
  useAIChatStore: () => ({
    closePanel,
    toggleConversationList: vi.fn(),
    setActiveConversation: vi.fn(),
    activeConversationId: storeState.activeConversationId,
  }),
}));

vi.mock("@/lib/aiSettings", () => ({
  AI_SETTINGS_CHANGED_EVENT: "ai-settings-changed",
  loadAISettings: () => Promise.resolve(aiSettingsState.current),
}));

vi.mock("@/lib/platform", () => ({
  isTauriDesktop: vi.fn(() => true),
}));

const platformMod = () =>
  import("@/lib/platform") as Promise<{ isTauriDesktop: ReturnType<typeof vi.fn> }>;

vi.mock("./McpStatusIndicator", () => ({
  McpStatusIndicator: () => <div data-testid="mcp-status-indicator" />,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
  }),
}));

describe("AIChatHeader", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    storeState.activeConversationId = null;
    aiSettingsState.current = null;
    const { isTauriDesktop } = await platformMod();
    isTauriDesktop.mockReturnValue(true);
  });

  function renderHeader() {
    return render(
      <MemoryRouter>
        <AIChatHeader />
      </MemoryRouter>,
    );
  }

  it("navigates to /ai and closes panel when opening full page with no active conversation", async () => {
    const user = userEvent.setup();
    renderHeader();
    await user.click(screen.getByTitle("Open in full page"));
    expect(navigate).toHaveBeenCalledWith("/ai");
    expect(closePanel).toHaveBeenCalled();
  });

  it("navigates to /ai/:id and closes panel when a conversation is active", async () => {
    storeState.activeConversationId = "conv-99";
    const user = userEvent.setup();
    renderHeader();
    await user.click(screen.getByTitle("Open in full page"));
    expect(navigate).toHaveBeenCalledWith("/ai/conv-99");
    expect(closePanel).toHaveBeenCalled();
  });

  it("shows McpStatusIndicator when claude_code mode is active on desktop", async () => {
    aiSettingsState.current = {
      provider: "claude-code",
      apiKey: "",
      apiMode: "api_server",
      model: "default",
      modelId: "claude-code:default",
      isConfigured: true,
    };
    renderHeader();
    await waitFor(() => {
      expect(screen.getByTestId("mcp-status-indicator")).toBeInTheDocument();
    });
  });

  it("hides McpStatusIndicator on web even if settings claim claude_code mode", async () => {
    const { isTauriDesktop } = await platformMod();
    isTauriDesktop.mockReturnValue(false);
    aiSettingsState.current = {
      provider: "claude-code",
      apiKey: "",
      apiMode: "api_server",
      model: "default",
      modelId: "claude-code:default",
      isConfigured: true,
    };
    renderHeader();

    // Wait for async loadAISettings to settle so the badge would have rendered if not gated.
    // 非同期 loadAISettings 解決後に確認することで、ガードが効いていることを保証する。
    await waitFor(() => {
      expect(screen.getByText("aiChat.mode.default")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("mcp-status-indicator")).not.toBeInTheDocument();
    expect(screen.queryByText("aiChat.mode.claudeCode")).not.toBeInTheDocument();
  });
});
