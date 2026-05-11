import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useParams } from "react-router-dom";
import NotePageView from "./NotePageView";
import {
  useNote,
  useNotePage,
  useCopyNotePageToPersonal,
  useNoteApi,
} from "@/hooks/useNoteQueries";
import { useAuth } from "@/hooks/useAuth";
import { AIChatProvider } from "@/contexts/AIChatContext";

// `vi.hoisted` で共有フック用の `vi.fn()` を巻き上げる。`vi.mock` のファクトリは
// hoisting されてテストスコープの変数を参照できないので、モジュール境界をまたぐ
// 共有状態はこの方式にする必要がある。`mockToast` を差し込むことで、`handleCopyToPersonal`
// が `toast({...})` に渡した `action` をテストから検査できるようにする。
// Hoist `vi.fn()` refs so the mock factory (which runs before the test body)
// can see them. Required because `vi.mock` hoists above normal `const`s. The
// shared `mockToast` lets tests inspect what `toast({...})` was called with
// — in particular whether the `action` (toast CTA) was supplied.
const { mockToast, mockUpdatePageMutateAsync, mockApi, mockSetPageContext } = vi.hoisted(() => ({
  mockToast: vi.fn(),
  mockUpdatePageMutateAsync: vi.fn().mockResolvedValue({ skipped: false }),
  mockApi: {
    getPageContent: vi.fn(),
    putPageContent: vi.fn(),
  },
  mockSetPageContext: vi.fn(),
}));

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
  useNoteApi: vi.fn(() => ({
    api: mockApi,
    userId: "user-1",
    userEmail: undefined,
    isSignedIn: true,
    isLoaded: true,
  })),
  useCopyNotePageToPersonal: vi.fn(() => ({
    mutateAsync: vi
      .fn()
      .mockResolvedValue({ created: true, page_id: "pg-copy", localImported: true }),
    isPending: false,
  })),
  noteKeys: {
    page: (noteId: string, pageId: string) => ["notes", "pages", noteId, pageId],
    detailsByNoteId: (noteId: string) => ["notes", "detail", noteId],
  },
}));

vi.mock("@/hooks/usePageQueries", () => ({
  useUpdatePage: vi.fn(() => ({ mutateAsync: mockUpdatePageMutateAsync })),
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

vi.mock("@/contexts/AIChatContext", () => ({
  AIChatProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useAIChatContext: () => ({
    setPageContext: mockSetPageContext,
    contentAppendHandlerRef: { current: null },
    insertAtCursorRef: { current: null },
  }),
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
  PageEditorContent: ({
    title,
    onTitleChange,
  }: {
    title: string;
    onTitleChange?: (title: string) => void;
  }) => (
    <div data-testid="page-editor">
      <div data-testid="page-title">{title}</div>
      <button type="button" onClick={() => onTitleChange?.("Edited title")}>
        change-title
      </button>
    </div>
  ),
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
  useToast: () => ({ toast: mockToast }),
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
    mockToast.mockReset();
    mockSetPageContext.mockReset();
    mockUpdatePageMutateAsync.mockResolvedValue({ skipped: false });
    mockApi.getPageContent.mockReset();
    mockApi.putPageContent.mockReset();
    vi.mocked(useParams).mockReturnValue({ noteId: "note-1", pageId: "page-1" });
    vi.mocked(useAuth).mockReturnValue({ isSignedIn: true, userId: "user-1" } as never);
    vi.mocked(useNoteApi).mockReturnValue({
      api: mockApi,
      userId: "user-1",
      userEmail: undefined,
      isSignedIn: true,
      isLoaded: true,
    } as never);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
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

    expect(screen.getByText("common.loading")).toBeInTheDocument();
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

  it("saves note-native page titles through the page-content API for note editors", async () => {
    vi.mocked(useNote).mockReturnValue({
      note: { id: "note-1" },
      access: { canView: true, canEdit: true },
      source: "local",
      isLoading: false,
    } as never);
    vi.mocked(useNotePage).mockReturnValue({
      data: {
        id: "page-1",
        title: "Original title",
        content: "{}",
        ownerUserId: "user-other",
        noteId: "note-1",
      },
      isLoading: false,
    } as never);
    mockApi.getPageContent.mockResolvedValue({
      ydoc_state: "AQ==",
      version: 3,
      content_text: "body",
    });
    mockApi.putPageContent.mockResolvedValue({ version: 4 });

    renderNotePageView();
    fireEvent.click(screen.getByText("change-title"));
    await vi.advanceTimersByTimeAsync(500);
    await Promise.resolve();
    await Promise.resolve();

    expect(mockApi.putPageContent).toHaveBeenCalledTimes(1);
    expect(mockApi.putPageContent).toHaveBeenCalledWith("page-1", {
      ydoc_state: "AQ==",
      content_text: "body",
      expected_version: 3,
      title: "Edited title",
    });
    expect(mockUpdatePageMutateAsync).not.toHaveBeenCalled();
  });

  it("rolls back the visible title when a note-native title save fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(useNote).mockReturnValue({
      note: { id: "note-1" },
      access: { canView: true, canEdit: true },
      source: "local",
      isLoading: false,
    } as never);
    vi.mocked(useNotePage).mockReturnValue({
      data: {
        id: "page-1",
        title: "Original title",
        content: "{}",
        ownerUserId: "user-other",
        noteId: "note-1",
      },
      isLoading: false,
    } as never);
    mockApi.getPageContent.mockResolvedValue({
      ydoc_state: "AQ==",
      version: 3,
      content_text: "body",
    });
    mockApi.putPageContent.mockRejectedValue(new Error("save failed"));

    renderNotePageView();
    fireEvent.click(screen.getByText("change-title"));
    expect(screen.getByTestId("page-title")).toHaveTextContent("Edited title");

    await vi.advanceTimersByTimeAsync(500);
    vi.useRealTimers();
    await waitFor(() => {
      expect(screen.getByTestId("page-title")).toHaveTextContent("Original title");
    });
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "errors.titleSaveFailedTitle",
        description: "errors.titleSaveFailedDescription",
        variant: "destructive",
      }),
    );
    consoleError.mockRestore();
  });

  it("keeps linked personal page titles read-only for non-owners", async () => {
    vi.mocked(useNote).mockReturnValue({
      note: { id: "note-1" },
      access: { canView: true, canEdit: true },
      source: "local",
      isLoading: false,
    } as never);
    vi.mocked(useNotePage).mockReturnValue({
      data: {
        id: "page-1",
        title: "Original title",
        content: "{}",
        ownerUserId: "user-other",
        noteId: null,
      },
      isLoading: false,
    } as never);

    renderNotePageView();
    fireEvent.click(screen.getByText("change-title"));
    vi.advanceTimersByTime(500);
    await Promise.resolve();

    expect(screen.getByTestId("page-title")).toHaveTextContent("Original title");
    expect(mockApi.putPageContent).not.toHaveBeenCalled();
    expect(mockUpdatePageMutateAsync).not.toHaveBeenCalled();
  });

  it("keeps note-native pages read-only for owners without note edit permission", async () => {
    vi.mocked(useNote).mockReturnValue({
      note: { id: "note-1" },
      access: { canView: true, canEdit: false },
      source: "local",
      isLoading: false,
    } as never);
    vi.mocked(useNotePage).mockReturnValue({
      data: {
        id: "page-1",
        title: "Original title",
        content: "{}",
        ownerUserId: "user-1",
        noteId: "note-1",
      },
      isLoading: false,
    } as never);

    renderNotePageView();
    fireEvent.click(screen.getByText("change-title"));
    vi.advanceTimersByTime(500);
    await Promise.resolve();

    expect(screen.getByText("閲覧専用")).toBeInTheDocument();
    expect(screen.getByTestId("page-title")).toHaveTextContent("Original title");
    expect(mockApi.putPageContent).not.toHaveBeenCalled();
    expect(mockUpdatePageMutateAsync).not.toHaveBeenCalled();
  });

  it("passes the owning note id to AI chat for note-native pages", () => {
    vi.mocked(useNote).mockReturnValue({
      note: { id: "note-1" },
      access: { canView: true, canEdit: true },
      source: "local",
      isLoading: false,
    } as never);
    vi.mocked(useNotePage).mockReturnValue({
      data: {
        id: "page-1",
        title: "Note-native",
        content: "{}",
        ownerUserId: "user-1",
        noteId: "note-1",
      },
      isLoading: false,
    } as never);

    renderNotePageView();

    expect(mockSetPageContext).toHaveBeenCalledWith(
      expect.objectContaining({
        pageId: "page-1",
        noteId: "note-1",
      }),
    );
  });

  it("keeps AI chat on personal scope for linked personal pages", () => {
    vi.mocked(useNote).mockReturnValue({
      note: { id: "note-1" },
      access: { canView: true, canEdit: true },
      source: "local",
      isLoading: false,
    } as never);
    vi.mocked(useNotePage).mockReturnValue({
      data: {
        id: "page-1",
        title: "Linked personal",
        content: "{}",
        ownerUserId: "user-1",
        noteId: null,
      },
      isLoading: false,
    } as never);

    renderNotePageView();

    expect(mockSetPageContext).toHaveBeenCalledWith(
      expect.objectContaining({
        pageId: "page-1",
        noteId: undefined,
      }),
    );
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

  // ── localImported 分岐: トースト CTA の UX 契約を固定する ──
  // 「コピーに成功」というサーバー側結果は `localImported` の真偽に関わらず
  // トーストで出す（ユーザーにとっては成功）。ただし「開く」CTA は IDB に
  // 新ページが載っている場合（`localImported: true`）にだけ出す — 載っていない
  // ときに遷移させると `/pages/:id` が次回 sync まで空のローカルを読んで着地に
  // 失敗するため。ここで両分岐をピン止めし、将来の回帰を検知する。
  // Pin the toast-CTA UX contract: the success toast fires either way (the
  // server-side copy did happen), but the "Open" CTA should only appear when
  // the new page is already in IDB (`localImported: true`). Otherwise
  // `/pages/:id` would land on a stale-empty local read until the next sync.
  // These two tests lock down the branch behind `result.localImported`.
  describe("copy-to-personal toast CTA (issue #713 Phase 3 / CodeRabbit)", () => {
    function setupNoteNativeRender(mutateResult: {
      created: boolean;
      page_id: string;
      localImported: boolean;
    }) {
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
          noteId: "note-1",
        },
        isLoading: false,
      } as never);
      const mutateAsync = vi.fn().mockResolvedValue(mutateResult);
      vi.mocked(useCopyNotePageToPersonal).mockReturnValue({
        mutateAsync,
        isPending: false,
      } as never);
      return { mutateAsync };
    }

    async function clickCopyMenuItem() {
      const trigger = screen.getByText("notes.copyToPersonal");
      fireEvent.click(trigger);
      // handleCopyToPersonal は mutateAsync(...)/toast(...) を連続して呼ぶ
      // async 関数なので、microtask を 1 周回して resolve を消化させる。
      // `handleCopyToPersonal` is an async function that awaits mutateAsync
      // then calls toast(...). Flush a microtask so the toast call lands
      // before we inspect `mockToast`.
      await Promise.resolve();
      await Promise.resolve();
    }

    it("includes the Open CTA when localImported is true", async () => {
      setupNoteNativeRender({ created: true, page_id: "pg-copy", localImported: true });
      renderNotePageView();

      await clickCopyMenuItem();

      expect(mockToast).toHaveBeenCalledTimes(1);
      const arg = mockToast.mock.calls[0][0] as { title: unknown; action?: unknown };
      expect(arg.title).toBe("notes.pageCopiedToPersonal");
      // `localImported: true` のときだけ「開く」CTA 用の React 要素が渡される。
      // The "Open" CTA element is supplied only when `localImported` is true.
      expect(arg.action).toBeTruthy();
    });

    it("omits the Open CTA when localImported is false (IDB write-through skipped)", async () => {
      setupNoteNativeRender({ created: true, page_id: "pg-copy", localImported: false });
      renderNotePageView();

      await clickCopyMenuItem();

      expect(mockToast).toHaveBeenCalledTimes(1);
      const arg = mockToast.mock.calls[0][0] as { title: unknown; action?: unknown };
      expect(arg.title).toBe("notes.pageCopiedToPersonal");
      // 書き戻し失敗/スキップ時は CTA なし。次回 sync で `/home` に反映される。
      // No CTA when the write-through missed; the next sync will reconcile.
      expect(arg.action).toBeUndefined();
    });
  });
});
