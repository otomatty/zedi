/**
 * Note view: loading / missing or forbidden / success with title, badge, header actions, grid.
 * ノートビュー: 読み込み中／存在しない・アクセス不可／正常（タイトル・バッジ・ヘッダーアクション・グリッド）。
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import NoteView from "./index";
import { useNote, useNotePages, useNoteApi } from "@/hooks/useNoteQueries";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { count?: number }) =>
      opts?.count != null ? `${key} ${opts.count}` : key,
    i18n: { language: "ja" },
  }),
  // `@/lib/webClipper` を import すると i18n 経由で `initReactI18next` が
  // 参照されるため、最低限のモックを返してエラーを防ぐ。
  // The webClipper module reaches `i18n.use(initReactI18next)` via its error
  // helper; expose a minimal stub so the mock doesn't throw at import time.
  initReactI18next: { type: "3rdParty", init: () => undefined },
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
  default: ({
    initialClipUrl,
    onClipDialogClosedWithInitialUrl,
  }: {
    initialClipUrl?: string | null;
    onClipDialogClosedWithInitialUrl?: () => void;
  }) => (
    <div data-testid="fab" data-initial-clip-url={initialClipUrl ?? ""}>
      FAB
      {initialClipUrl && (
        <button
          type="button"
          data-testid="fab-close-clip"
          onClick={() => onClipDialogClosedWithInitialUrl?.()}
        >
          close-clip
        </button>
      )}
    </div>
  ),
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

function renderNoteView(noteId: string, search = "") {
  return render(
    <MemoryRouter initialEntries={[`/notes/${noteId}${search}`]}>
      <Routes>
        <Route
          path="/notes/:noteId"
          element={
            <>
              <NoteView />
              <LocationProbe />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

function LocationProbe() {
  const location = useLocation();
  return <span data-testid="current-search">{location.search}</span>;
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

  describe("clipUrl handoff (issue #826)", () => {
    function setEditableNote() {
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
    }

    it("forwards a validated `clipUrl` query into FloatingActionButton.initialClipUrl", () => {
      setEditableNote();
      const clipUrl = "https://example.com/article";
      renderNoteView("n1", `?clipUrl=${encodeURIComponent(clipUrl)}`);
      expect(screen.getByTestId("fab")).toHaveAttribute("data-initial-clip-url", clipUrl);
    });

    it("ignores a `clipUrl` that fails the URL policy check", () => {
      setEditableNote();
      renderNoteView("n1", `?clipUrl=${encodeURIComponent("chrome://extensions")}`);
      // 検証 NG: FAB は initialClipUrl を受け取らない（空文字属性）。
      // Invalid URL: FAB receives no initialClipUrl (empty attribute).
      expect(screen.getByTestId("fab")).toHaveAttribute("data-initial-clip-url", "");
    });

    it("strips `clipUrl` from the URL when the clip dialog closes, keeping other params", () => {
      setEditableNote();
      const clipUrl = "https://example.com/article";
      renderNoteView("n1", `?keep=1&clipUrl=${encodeURIComponent(clipUrl)}`);
      expect(screen.getByTestId("current-search")).toHaveTextContent(
        `?keep=1&clipUrl=${encodeURIComponent(clipUrl)}`,
      );
      act(() => {
        fireEvent.click(screen.getByTestId("fab-close-clip"));
      });
      // clipUrl のみ削除され、他のクエリは残る。
      // Only `clipUrl` is removed; other query params survive.
      expect(screen.getByTestId("current-search")).toHaveTextContent("?keep=1");
    });
  });
});
