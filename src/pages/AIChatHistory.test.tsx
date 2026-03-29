/**
 * AI chat history page: title, list rows, empty state.
 * AI チャット履歴ページの表示テスト。
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AIChatHistory from "./AIChatHistory";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
    i18n: { language: "en" },
  }),
}));

const deleteConversation = vi.fn();
const mockConversations = vi.hoisted(() =>
  vi.fn(() => [] as import("@/types/aiChat").Conversation[]),
);

vi.mock("@/hooks/useAIChatConversations", () => ({
  useAIChatConversations: () => ({
    conversations: mockConversations(),
    createConversation: vi.fn(),
    updateConversation: vi.fn(),
    deleteConversation,
    getConversation: vi.fn(),
    getConversationsForPage: vi.fn(() => []),
  }),
}));

const openPanel = vi.fn();
const setActiveConversation = vi.fn();

vi.mock("@/stores/aiChatStore", () => ({
  useAIChatStore: Object.assign(
    () => ({
      openPanel,
      setActiveConversation,
      activeConversationId: null,
      isOpen: false,
    }),
    {
      getState: () => ({ activeConversationId: null as string | null }),
    },
  ),
}));

vi.mock("@/components/layout/AppLayout", () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="app-layout">{children}</div>
  ),
}));

vi.mock("@/components/ai-chat/ContentWithAIChat", () => ({
  ContentWithAIChat: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="content-with-ai">{children}</div>
  ),
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <AIChatHistory />
    </MemoryRouter>,
  );
}

describe("AIChatHistory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConversations.mockReturnValue([]);
  });

  it("renders page title and empty state when there are no conversations", () => {
    renderPage();
    expect(screen.getByRole("heading", { name: "AI chat history" })).toBeInTheDocument();
    expect(screen.getByText("No conversations yet")).toBeInTheDocument();
  });

  it("renders a row per conversation", () => {
    const now = Date.now();
    mockConversations.mockReturnValue([
      {
        id: "a",
        title: "First chat",
        messages: [],
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "b",
        title: "Second chat",
        messages: [],
        createdAt: now - 1,
        updatedAt: now - 1,
      },
    ]);
    renderPage();
    expect(screen.getByRole("button", { name: /First chat/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Second chat/ })).toBeInTheDocument();
  });
});
