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

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    // The second argument is either a fallback string or interpolation options.
    t: (key: string, fallback?: unknown) => (typeof fallback === "string" ? fallback : key),
  }),
}));

describe("AIChatHeader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storeState.activeConversationId = null;
    aiSettingsState.current = null;
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

  it("names the provider in the badge in own-key mode", async () => {
    aiSettingsState.current = {
      provider: "openai",
      apiKey: "sk-test",
      apiMode: "user_api_key",
      model: "gpt-5",
      modelId: "openai:gpt-5",
      isConfigured: true,
    };
    renderHeader();

    await waitFor(() => {
      expect(screen.getByText("aiChat.mode.apiKeyWithProvider")).toBeInTheDocument();
    });
  });
});
