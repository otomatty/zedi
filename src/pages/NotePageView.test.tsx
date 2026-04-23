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

// i18n: テストで「生キーが DOM に出る」前提に依存したくないので、`t(key, fallback)`
// の仕様を明示的にモックする。共通セットアップが将来実ロケールを読み込むように
// なっても、ここでの期待値が壊れないようにする（CodeRabbit 指摘）。
// Mock `useTranslation` so these tests don't rely on the raw-key fallback of a
// bare setup. Makes the test robust if the shared setup ever starts loading
// real locale data. (CodeRabbit.)
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
  }),
}));

vi.mock("@/hooks/useNoteQueries", () => ({
  useNote: vi.fn(),
  useNotePage: vi.fn(),
  useCopyNotePageToPersonal: vi.fn(() => ({
    mutateAsync: vi
      .fn()
      .mockResolvedValue({ created: true, page_id: "pg-copy", localImported: true }),
    isPending: false,
  })),
  noteKeys: {
    page: (noteId: string, pageId: string) => ["notes", "pages", noteId, pageId],
    pageList: (noteId: string) => ["notes", "pages", noteId],
  },
}));

vi.mock("@/hooks/usePageQueries", () => ({
  useUpdatePage: vi.fn(() => ({ mutateAsync: vi.fn().mockResolvedValue({ skipped: false }) })),
}));

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useQueryClient: vi.fn(() => ({ invalidateQueries: vi.fn() })),
  };
});

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
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuItem: ({
    children,
    onClick,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
  }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock("@/components/layout/AppLayout", () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="app-layout">{children}</div>
  ),
}));

function renderNotePageView() {
  return render(
    <MemoryRouter initialEntries={[`/notes/note-1/page-1`]}>
      <AIChatProvider>
        <Routes>
          <Route path="/notes/:noteId/:pageId" element={<NotePageView />} />
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

  it("shows copy-to-personal action for note-native pages (issue #713 Phase 3)", () => {
    // `page.noteId === noteId` → ノートネイティブ。サインイン済みなら「個人に取り込み」
    // を出す。i18n モックは `t(key)` が生キーを返す実装なので、キー文字列で DOM を引く。
    // A note-native page (`page.noteId === noteId`) surfaces the menu item for
    // signed-in viewers. `useTranslation` is mocked to echo the key, so we
    // assert on the raw key string. Issue #713 Phase 3.
    vi.mocked(useNote).mockReturnValue({
      note: { id: "note-1" },
      access: { canView: true, canEdit: false },
      source: "local",
      isLoading: false,
    } as never);
    vi.mocked(useNotePage).mockReturnValue({
      data: {
        id: "page-1",
        title: "Note-native",
        content: "{}",
        ownerUserId: "user-other",
        noteId: "note-1", // note-native: scope matches current note
      },
      isLoading: false,
    } as never);

    renderNotePageView();

    expect(screen.getByText("notes.copyToPersonal")).toBeInTheDocument();
  });

  it("hides copy-to-personal action for linked personal pages (Codex P2)", () => {
    // `page.noteId === null` はノートにリンクされている個人ページ。サーバーは
    // copy-to-personal を 400 で弾くため、UI からは出さない。
    // A linked personal page (`page.noteId === null`) would be rejected by the
    // server (`Page does not belong to this note`), so hide the UI entry to
    // avoid a guaranteed-fail click. Codex P2.
    vi.mocked(useNote).mockReturnValue({
      note: { id: "note-1" },
      access: { canView: true, canEdit: false },
      source: "local",
      isLoading: false,
    } as never);
    vi.mocked(useNotePage).mockReturnValue({
      data: {
        id: "page-1",
        title: "Linked personal",
        content: "{}",
        ownerUserId: "user-1",
        noteId: null, // linked personal page
      },
      isLoading: false,
    } as never);

    renderNotePageView();

    expect(screen.queryByText("notes.copyToPersonal")).not.toBeInTheDocument();
  });
});
