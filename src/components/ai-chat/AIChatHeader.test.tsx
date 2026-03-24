/**
 * AI chat dock header: list, new, open full page, close.
 * AI チャットドックのヘッダー。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AIChatHeader } from "./AIChatHeader";

const navigate = vi.fn();
const closePanel = vi.fn();
const storeState = vi.hoisted(() => ({
  activeConversationId: null as string | null,
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

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
  }),
}));

describe("AIChatHeader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storeState.activeConversationId = null;
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
});
