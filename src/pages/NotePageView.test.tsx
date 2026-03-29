import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useParams } from "react-router-dom";
import NotePageView from "./NotePageView";
import { useNote, useNotePage } from "@/hooks/useNoteQueries";
import { useAuth } from "@/hooks/useAuth";
import { AIChatProvider } from "@/contexts/AIChatContext";

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...actual,
    useParams: vi.fn(),
  };
});

vi.mock("@/hooks/useNoteQueries", () => ({
  useNote: vi.fn(),
  useNotePage: vi.fn(),
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/hooks/useCollaboration", () => ({
  useCollaboration: vi.fn(() => ({})),
}));

vi.mock("@/components/layout/Header", () => ({
  default: () => <header data-testid="header">Header</header>,
}));

vi.mock("@/components/layout/Container", () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="container">{children}</div>
  ),
}));

vi.mock("@/components/editor/PageEditor/PageEditorContent", () => ({
  PageEditorContent: () => <div data-testid="page-editor">PageEditorContent</div>,
}));

vi.mock("@/components/ai-chat/ContentWithAIChat", () => ({
  ContentWithAIChat: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="content-with-ai-chat">{children}</div>
  ),
}));

vi.mock("@zedi/ui", () => ({
  Button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
}));

vi.mock("@/components/layout/AppLayout", () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="app-layout">{children}</div>
  ),
}));

function renderNotePageView() {
  return render(
    <MemoryRouter initialEntries={[`/note/note-1/page/page-1`]}>
      <AIChatProvider>
        <Routes>
          <Route path="/note/:noteId/page/:pageId" element={<NotePageView />} />
        </Routes>
      </AIChatProvider>
    </MemoryRouter>,
  );
}

describe("NotePageView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useParams).mockReturnValue({ noteId: "note-1", pageId: "page-1" });
    vi.mocked(useAuth).mockReturnValue({ isSignedIn: true, userId: "user-1" } as never);
  });

  it("shows loading state when note or page is loading", () => {
    vi.mocked(useNote).mockReturnValue({
      note: null,
      access: null,
      source: "local",
      isLoading: true,
    } as never);
    vi.mocked(useNotePage).mockReturnValue({
      data: null,
      isLoading: true,
    } as never);

    renderNotePageView();

    expect(screen.getByText("読み込み中...")).toBeInTheDocument();
  });

  it("shows not found message when note or page is not found", () => {
    vi.mocked(useNote).mockReturnValue({
      note: null,
      access: { canView: false },
      source: "local",
      isLoading: false,
    } as never);
    vi.mocked(useNotePage).mockReturnValue({
      data: null,
      isLoading: false,
    } as never);

    renderNotePageView();

    expect(screen.getByText(/ページが見つからないか、閲覧権限がありません/)).toBeInTheDocument();
  });

  it("renders editor when note and page are loaded with canEdit", () => {
    vi.mocked(useNote).mockReturnValue({
      note: { id: "note-1" },
      access: { canView: true, canEdit: true },
      source: "local",
      isLoading: false,
    } as never);
    vi.mocked(useNotePage).mockReturnValue({
      data: {
        id: "page-1",
        title: "Test Page",
        content: "{}",
        ownerUserId: "user-1",
      },
      isLoading: false,
    } as never);

    renderNotePageView();

    expect(screen.getByTestId("content-with-ai-chat")).toBeInTheDocument();
    expect(screen.getByTestId("page-editor")).toBeInTheDocument();
  });
});
