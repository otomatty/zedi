/**
 * App sidebar: 2-column header + notes + AI history; no Settings/Plan in sidebar.
 * 左サイドバー: 2カラムヘッダー、参加ノート、常時 AI 履歴。Settings/Plan は出さない。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SidebarProvider } from "@zedi/ui";
import { AppSidebar } from "./AppSidebar";
import { AIChatConversationsProvider } from "@/hooks/useAIChatConversations";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
    i18n: { language: "ja" },
  }),
}));

const authState = vi.hoisted(() => ({ isSignedIn: true }));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ isSignedIn: authState.isSignedIn }),
}));

const mockNotes = vi.hoisted(() =>
  vi.fn(() => ({
    data: [] as Array<{ id: string; title: string; updatedAt: number }>,
    isLoading: false,
  })),
);

vi.mock("@/hooks/useNoteQueries", () => ({
  useNotes: () => mockNotes(),
}));

const mockConversations = vi.hoisted(() =>
  vi.fn(() => [] as import("@/types/aiChat").Conversation[]),
);

vi.mock("@/hooks/useAIChatConversations", async () => {
  const actual = await vi.importActual<typeof import("@/hooks/useAIChatConversations")>(
    "@/hooks/useAIChatConversations",
  );
  return {
    ...actual,
    useAIChatConversations: () => ({
      conversations: mockConversations(),
      createConversation: vi.fn(),
      updateConversation: vi.fn(),
      deleteConversation: vi.fn(),
      getConversation: vi.fn(),
      getConversationsForPage: vi.fn(() => []),
    }),
  };
});

const openPanel = vi.hoisted(() => vi.fn());
const setActiveConversation = vi.hoisted(() => vi.fn());

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

function renderAppSidebar(initialPath = "/home") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialPath]}>
        <SidebarProvider>
          <AIChatConversationsProvider>
            <AppSidebar />
          </AIChatConversationsProvider>
        </SidebarProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("AppSidebar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.isSignedIn = true;
    mockNotes.mockReturnValue({ data: [], isLoading: false });
    mockConversations.mockReturnValue([]);
  });

  it("renders Home, Notes, and AI links in the header with correct paths", () => {
    renderAppSidebar("/home");
    expect(screen.getByRole("link", { name: /nav\.home/ }).getAttribute("href")).toBe("/home");
    expect(screen.getByRole("link", { name: /nav\.notes/ }).getAttribute("href")).toBe("/notes");
    expect(screen.getByRole("link", { name: /nav\.ai/ }).getAttribute("href")).toBe("/ai");
  });

  it("does not render Settings or Plan links in the sidebar", () => {
    renderAppSidebar("/home");
    expect(screen.queryByRole("link", { name: /nav\.settings/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /nav\.plan/ })).not.toBeInTheDocument();
  });

  it("marks Home as active only when pathname is exactly /home", () => {
    renderAppSidebar("/home");
    const homeLink = screen.getByRole("link", { name: /nav\.home/ });
    expect(homeLink).toHaveAttribute("data-active", "true");
  });

  it("marks Home as not active when pathname is /notes", () => {
    renderAppSidebar("/notes");
    const homeLink = screen.getByRole("link", { name: /nav\.home/ });
    expect(homeLink).toHaveAttribute("data-active", "false");
  });

  it("marks Notes as active when pathname starts with /notes", () => {
    renderAppSidebar("/notes/discover");
    const notesLink = screen.getByRole("link", { name: /nav\.notes/ });
    expect(notesLink).toHaveAttribute("data-active", "true");
  });

  it("lists participating notes with links to /note/:id when signed in", () => {
    mockNotes.mockReturnValue({
      data: [{ id: "n1", title: "Alpha", updatedAt: Date.now() }],
      isLoading: false,
    });
    renderAppSidebar("/home");
    const link = screen.getByRole("link", { name: "Alpha" });
    expect(link.getAttribute("href")).toBe("/note/n1");
  });

  it("shows sign-in hint for notes when not signed in", () => {
    authState.isSignedIn = false;
    renderAppSidebar("/home");
    expect(screen.getByText("Sign in to see your notes")).toBeInTheDocument();
  });

  it("shows empty AI chat message when there are no conversations", () => {
    renderAppSidebar("/home");
    expect(screen.getByText("No conversations yet")).toBeInTheDocument();
  });

  it("navigates to chat detail page when a history row is clicked", async () => {
    const user = userEvent.setup();
    mockConversations.mockReturnValue([
      {
        id: "conv-1",
        title: "Hello thread",
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ]);
    renderAppSidebar("/home");
    await user.click(screen.getByRole("button", { name: /Hello thread/ }));
    expect(setActiveConversation).not.toHaveBeenCalled();
    expect(openPanel).not.toHaveBeenCalled();
  });

  it("shows at most five conversation rows in the sidebar", () => {
    const now = Date.now();
    mockConversations.mockReturnValue(
      Array.from({ length: 7 }, (_, i) => ({
        id: `conv-${i}`,
        title: `Chat ${i}`,
        messages: [],
        createdAt: now - i,
        updatedAt: now - i,
      })),
    );
    renderAppSidebar("/home");
    expect(screen.getAllByRole("button", { name: /Chat \d/ })).toHaveLength(5);
  });

  it("shows See all link when there are more than five conversations", () => {
    const now = Date.now();
    mockConversations.mockReturnValue(
      Array.from({ length: 6 }, (_, i) => ({
        id: `conv-${i}`,
        title: `Chat ${i}`,
        messages: [],
        createdAt: now - i,
        updatedAt: now - i,
      })),
    );
    renderAppSidebar("/home");
    const seeAll = screen.getByRole("link", { name: "See all" });
    expect(seeAll.getAttribute("href")).toBe("/ai/history");
  });

  it("does not show See all when there are five or fewer conversations", () => {
    const now = Date.now();
    mockConversations.mockReturnValue(
      Array.from({ length: 5 }, (_, i) => ({
        id: `conv-${i}`,
        title: `Chat ${i}`,
        messages: [],
        createdAt: now - i,
        updatedAt: now - i,
      })),
    );
    renderAppSidebar("/home");
    expect(screen.queryByRole("link", { name: "See all" })).not.toBeInTheDocument();
  });
});
