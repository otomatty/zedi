/**
 * Note view: loading / missing or forbidden / success with title, badge, header actions, grid.
 * ノートビュー: 読み込み中／存在しない・アクセス不可／正常（タイトル・バッジ・ヘッダーアクション・グリッド）。
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import NoteView from "./index";
import { useNote } from "@/hooks/notes/useNoteQueries";

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

vi.mock("@/hooks/notes/useNoteQueries", () => ({
  useNote: vi.fn(),
  useNoteApi: () => ({
    api: { getNoteTags: vi.fn().mockResolvedValue({ items: [], none_count: 0, total_pages: 0 }) },
    userId: "user-1",
    userEmail: "user@example.com",
    isSignedIn: true,
    isLoaded: true,
  }),
  useAddPageToNote: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRemovePageFromNote: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

// `useNoteTagAggregation` calls `useNoteApi` internally; we already stub the
// API there so the hook resolves with an empty aggregation. Mock it directly
// to keep the test independent of React Query setup.
vi.mock("@/hooks/notes/useNoteTagAggregation", () => ({
  useNoteTagAggregation: () => ({
    items: [],
    noneCount: 0,
    totalPages: 0,
    isLoading: false,
    isError: false,
    source: "empty" as const,
  }),
}));

// `useTagFilterBarPreference` resolves to disabled by default so the bar does
// not render in the existing NoteView test fixtures (the note shell does not
// declare `showTagFilterBar: true`).
vi.mock("@/hooks/tags/useTagFilterBarPreference", () => ({
  useTagFilterBarPreference: () => ({
    enabled: false,
    noteDefault: false,
    userOverride: undefined,
    setOverride: vi.fn(),
  }),
}));

vi.mock("@/hooks/pages/usePageQueries", () => ({
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
vi.mock("@/components/aiChat/ContentWithAIChat", () => ({
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
  default: (props: Record<string, unknown>) => (
    <div data-testid="fab" data-props={Object.keys(props).sort().join(",")}>
      FAB
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
vi.mock("@/components/note/NoteShareUrlCopyButton", () => ({
  NoteShareUrlCopyButton: ({ noteId, visibility }: { noteId: string; visibility: string }) => (
    <div
      data-testid="note-share-url-copy-button"
      data-note-id={noteId}
      data-visibility={visibility}
    />
  ),
}));
vi.mock("@/components/note/NoteTitleSwitcher", () => ({
  // タイトル切替 UI は単体テスト側で検証済み。ここではタイトル文字列だけを
  // スタブとして出力し、heading 検証 (`getByRole("heading")`) を維持する。
  // The switcher behaviour has its own unit tests; render the title only so
  // `heading` role assertions keep working.
  NoteTitleSwitcher: ({ noteTitle }: { noteTitle: string; noteId: string }) => (
    <span data-testid="note-title-switcher">{noteTitle || "notes.untitledNote"}</span>
  ),
}));
vi.mock("@/components/page/PageGrid", () => ({
  default: ({
    noteId,
    canEdit,
    canDeletePage,
  }: {
    noteId?: string;
    canEdit?: boolean;
    canDeletePage?: (page: unknown) => boolean;
  }) => (
    <div
      data-testid="page-grid"
      data-note-id={noteId ?? ""}
      data-can-edit={String(!!canEdit)}
      data-can-delete-fn={String(typeof canDeletePage === "function")}
    >
      PageGrid
    </div>
  ),
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
        canManageMembers: true,
        canDeletePage: vi.fn(() => true),
      },
      source: "local",
      isLoading: false,
    } as never);
    renderNoteView("note-1");
    expect(screen.getByRole("heading", { name: "My Note" })).toBeInTheDocument();
    expect(screen.getByTestId("note-view-header-actions")).toBeInTheDocument();
    const grid = screen.getByTestId("page-grid");
    expect(grid).toBeInTheDocument();
    expect(grid).toHaveAttribute("data-note-id", "n1");
    expect(grid).toHaveAttribute("data-can-edit", "true");
    expect(grid).toHaveAttribute("data-can-delete-fn", "true");
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

  it("ignores a `clipUrl` query: the browser-extension hand-off was removed", () => {
    vi.mocked(useNote).mockReturnValue({
      note: { id: "n1", title: "My Note", visibility: "private", isOfficial: false },
      access: {
        canView: true,
        canEdit: true,
        canManageMembers: true,
        canDeletePage: vi.fn(() => true),
      },
      source: "local",
      isLoading: false,
    } as never);
    const search = `?keep=1&clipUrl=${encodeURIComponent("https://example.com/article")}`;
    renderNoteView("n1", search);
    // FAB には noteId だけを渡し、URL のクエリにも手を付けない。
    // The FAB only gets the note id, and the query string is left as it was.
    expect(screen.getByTestId("fab")).toHaveAttribute("data-props", "noteId");
    expect(screen.getByTestId("current-search")).toHaveTextContent(search);
  });
});
