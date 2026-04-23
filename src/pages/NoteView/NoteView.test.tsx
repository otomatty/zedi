/**
 * Note view: loading / missing or forbidden / success with title, badge, header actions, grid.
 * ノートビュー: 読み込み中／存在しない・アクセス不可／正常（タイトル・バッジ・ヘッダーアクション・グリッド）。
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import NoteView from "./index";
import { useNote, useNotePages, useNoteApi } from "@/hooks/useNoteQueries";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { count?: number }) =>
      opts?.count != null ? `${key} ${opts.count}` : key,
    i18n: { language: "ja" },
  }),
}));

vi.mock("@/hooks/useNoteQueries", () => ({
  useNote: vi.fn(),
  useNotePages: vi.fn(() => ({ data: [], isLoading: false })),
  useAddPageToNote: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCopyPersonalPageToNote: () => ({
    mutateAsync: vi.fn().mockResolvedValue({ created: true, page_id: "pg", sort_order: 1 }),
    isPending: false,
  }),
  useRemovePageFromNote: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useNoteApi: vi.fn(() => ({ isSignedIn: true })),
}));

vi.mock("@/hooks/usePageQueries", () => ({
  usePagesSummary: () => ({ data: [] }),
}));

vi.mock("@zedi/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@zedi/ui")>();
  return {
    ...actual,
    useToast: () => ({ toast: vi.fn() }),
  };
});

vi.mock("@/components/layout/AppLayout", () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="app-layout">{children}</div>
  ),
}));
vi.mock("@/components/ai-chat/ContentWithAIChat", () => ({
  ContentWithAIChat: ({
    children,
    floatingAction,
  }: {
    children: React.ReactNode;
    floatingAction?: React.ReactNode;
  }) => (
    <div data-testid="content-with-ai-chat">
      {children}
      {floatingAction}
    </div>
  ),
}));
vi.mock("@/components/layout/FloatingActionButton", () => ({
  default: () => <button data-testid="fab">FAB</button>,
}));
vi.mock("@/components/layout/Container", () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="container">{children}</div>
  ),
}));
vi.mock("./NoteViewHeaderActions", () => ({
  NoteViewHeaderActions: () => <div data-testid="note-view-header-actions">HeaderActions</div>,
}));
vi.mock("./NoteViewMainContent", () => ({
  NoteViewMainContent: () => <div data-testid="note-view-main-content">MainContent</div>,
}));

function renderNoteView(noteId: string) {
  return render(
    <MemoryRouter initialEntries={[`/notes/${noteId}`]}>
      <Routes>
        <Route path="/notes/:noteId" element={<NoteView />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("NoteView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useNote).mockReturnValue({
      note: null,
      access: null,
      source: "local",
      isLoading: false,
    } as never);
    vi.mocked(useNotePages).mockReturnValue({ data: [], isLoading: false } as never);
    vi.mocked(useNoteApi).mockReturnValue({ isSignedIn: true } as never);
  });

  it("shows loading message when note is loading", () => {
    vi.mocked(useNote).mockReturnValue({
      note: null,
      access: null,
      source: "local",
      isLoading: true,
    } as never);
    renderNoteView("note-1");
    expect(screen.getByText("common.loading")).toBeInTheDocument();
  });

  it("shows not found / no access message when note missing or no view access", () => {
    vi.mocked(useNote).mockReturnValue({
      note: null,
      access: null,
      source: "local",
      isLoading: false,
    } as never);
    renderNoteView("note-1");
    expect(screen.getByText("notes.noteNotFoundOrNoAccess")).toBeInTheDocument();
  });

  it("shows not found when access.canView is false", () => {
    vi.mocked(useNote).mockReturnValue({
      note: { id: "n1", title: "My Note", visibility: "private", isOfficial: false },
      access: { canView: false },
      source: "local",
      isLoading: false,
    } as never);
    renderNoteView("note-1");
    expect(screen.getByText("notes.noteNotFoundOrNoAccess")).toBeInTheDocument();
  });

  it("renders note title and main content when note and access are present", () => {
    vi.mocked(useNote).mockReturnValue({
      note: { id: "n1", title: "My Note", visibility: "private", isOfficial: false },
      access: {
        canView: true,
        canEdit: true,
        canAddPage: true,
        canManageMembers: true,
        canDeletePage: vi.fn(() => true),
      },
      source: "local",
      isLoading: false,
    } as never);
    vi.mocked(useNotePages).mockReturnValue({ data: [], isLoading: false } as never);
    renderNoteView("note-1");
    expect(screen.getByRole("heading", { name: "My Note" })).toBeInTheDocument();
    expect(screen.getByTestId("note-view-header-actions")).toBeInTheDocument();
    expect(screen.getByTestId("note-view-main-content")).toBeInTheDocument();
  });

  it("renders untitled note label when note title is empty", () => {
    vi.mocked(useNote).mockReturnValue({
      note: { id: "n1", title: "", visibility: "private", isOfficial: false },
      access: { canView: true },
      source: "local",
      isLoading: false,
    } as never);
    renderNoteView("note-1");
    expect(screen.getByRole("heading", { name: "notes.untitledNote" })).toBeInTheDocument();
  });
});
