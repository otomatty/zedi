import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useParams } from "react-router-dom";
import NotePageView from "./NotePageView";
import { useNote, useNotePage, useNoteApi, useRemovePageFromNote } from "@/hooks/useNoteQueries";
import { useAuth } from "@/hooks/useAuth";
import { usePagePublicContent } from "@/hooks/usePagePublicContent";
import { AIChatProvider } from "@/contexts/AIChatContext";

const { mockNavigate } = vi.hoisted(() => ({ mockNavigate: vi.fn() }));

// `vi.hoisted` で共有フック用の `vi.fn()` を巻き上げる。`vi.mock` のファクトリは
// hoisting されてテストスコープの変数を参照できないので、モジュール境界をまたぐ
// 共有状態はこの方式にする必要がある。
// Hoist `vi.fn()` refs so the mock factory (which runs before the test body)
// can see them. Required because `vi.mock` hoists above normal `const`s.
const {
  mockToast,
  mockUpdatePageMutateAsync,
  mockApi,
  mockSetPageContext,
  mockExportMarkdown,
  mockCopyMarkdown,
  mockRemoveFromNoteMutate,
  mockUseMarkdownExport,
} = vi.hoisted(() => ({
  mockToast: vi.fn(),
  mockUpdatePageMutateAsync: vi.fn().mockResolvedValue({ skipped: false }),
  mockApi: {
    // Issue #889 Phase 4: タイトル保存は `PUT /api/pages/:id`
    // (`updatePageMetadata`) に統一されたため、旧 `getPageContent` /
    // `putPageContent` のモックは撤去している。
    // Issue #889 Phase 4: title saves now go through
    // `PUT /api/pages/:id` (`updatePageMetadata`) exclusively, so the legacy
    // `getPageContent` / `putPageContent` mocks have been removed.
    updatePageMetadata: vi.fn(),
  },
  mockSetPageContext: vi.fn(),
  mockExportMarkdown: vi.fn(),
  mockCopyMarkdown: vi.fn().mockResolvedValue(undefined),
  mockRemoveFromNoteMutate: vi.fn(),
  // `useMarkdownExport(title, body, sourceUrl)` の呼び出し引数を捕捉するための
  // モック。Codex P1 (PR #893) の「export/copy が `page.content` を読んで空に
  // なる」回帰を防ぐためのテストで、引き渡された `body` を検査する。
  // Capture the args `useMarkdownExport(title, body, sourceUrl)` is called with
  // so the regression test (Codex P1 on PR #893) can assert the body matches
  // the public-content response rather than the always-empty `page.content`.
  mockUseMarkdownExport: vi.fn(),
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...actual,
    useParams: vi.fn(),
    useNavigate: () => mockNavigate,
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
    t: (key: string, fallback?: string) => {
      // `t(key, { title })` のようなオプション引数は無視して生キーを返す。
      // 既存テストはどれもキー文字列での DOM 引きを前提にしているため、補間後
      // の文字列を期待しているテストはない。文字列フォールバックはそのまま返す。
      // Ignore option objects (e.g. `{ title }`) and return the raw key; the
      // existing assertions consistently match on the i18n key. A second-arg
      // string fallback (`t(key, "default")`) is passed through verbatim.
      if (typeof fallback === "string") return fallback;
      return key;
    },
  }),
  initReactI18next: { type: "3rdParty", init: () => undefined },
  // Translation 関連の他コンシューマー（dateUtils → @/i18n 経由）が
  // 副作用で import するための最低限のスタブ。
  // Minimal stub so other consumers that pull in `@/i18n` via dateUtils
  // (which uses `initReactI18next`) can load without a real i18n boot.
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
  useRemovePageFromNote: vi.fn(() => ({
    mutate: mockRemoveFromNoteMutate,
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

vi.mock("@/components/editor/PageEditor/useMarkdownExport", () => ({
  useMarkdownExport: (...args: unknown[]) => {
    mockUseMarkdownExport(...args);
    return {
      handleExportMarkdown: mockExportMarkdown,
      handleCopyMarkdown: mockCopyMarkdown,
    };
  },
}));

// 読み取り専用経路の Markdown export ソースは `usePagePublicContent` 経由で
// 取得した `content_text` に切り替わった (Codex P1, PR #893)。テストは初期値で
// 「ロード完了 + 本文あり」を返し、必要なテストだけ `mockReturnValue` で上書きする。
// The read-only Markdown export source now comes from `usePagePublicContent`
// (Codex P1 on PR #893). Default mock returns a resolved, non-empty body;
// individual tests override via `mockReturnValue` when they need a different
// state (loading / empty content / error).
vi.mock("@/hooks/usePagePublicContent", () => ({
  usePagePublicContent: vi.fn(),
}));

// `PageHistoryModal` は重い依存（yjs / snapshot queries）を引き込むので、テスト
// 用に「open のときだけ存在を示す要素を出す」軽量モックに差し替える。`pageId`
// は data-attr で読めるようにして履歴がどのページに対して開いたかを検証できる
// ようにする。
// Mock `PageHistoryModal` to avoid pulling in yjs + snapshot queries during
// this test. The mock renders a marker only while `open` is true and exposes
// `pageId` so tests can assert the history opened for the correct page.
vi.mock("@/components/editor/pageHistory/PageHistoryModal", () => ({
  PageHistoryModal: ({ open, pageId }: { open: boolean; pageId: string }) =>
    open ? (
      <div data-testid="page-history-modal" data-page-id={pageId}>
        history
      </div>
    ) : null,
}));

vi.mock("@/components/layout/Header", () => ({
  default: () => <header data-testid="header">Header</header>,
}));

vi.mock("@/components/layout/Container", () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="container">{children}</div>
  ),
}));

vi.mock("@/components/note/PageEditorContent", () => ({
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

// 読み取り専用分岐 (`!canEdit`) は `NotePagePublicView` に委譲される。
// 内部実装をここで描画する必要はないので test 用 stub に差し替える。
// The `!canEdit` branch delegates to `NotePagePublicView`. Stub it so the
// branch test only asserts the delegation, not the inner rendering.
vi.mock("@/components/note/NotePagePublicView", () => ({
  NotePagePublicView: ({ pageId }: { pageId: string }) => (
    <div data-testid="note-public-view" data-page-id={pageId} />
  ),
}));

vi.mock("@/components/ai-chat/ContentWithAIChat", () => ({
  ContentWithAIChat: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="content-with-ai-chat">{children}</div>
  ),
}));

vi.mock("@zedi/ui", () => ({
  Button: ({
    children,
    onClick,
    "aria-label": ariaLabel,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    "aria-label"?: string;
  }) => (
    <button type="button" onClick={onClick} aria-label={ariaLabel}>
      {children}
    </button>
  ),
  cn: (...args: unknown[]) => args.filter(Boolean).join(" "),
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuSeparator: () => <hr data-testid="dropdown-separator" />,
  DropdownMenuItem: ({
    children,
    onClick,
    disabled,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button type="button" onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
  // ── AlertDialog: `open` のときだけ children を描画する最小モック ──
  // 削除確認ダイアログのテストで `Action` を直接クリックして mutation を発火
  // する想定。`onClick` の `preventDefault` も呼ばれるが、ここでは Radix の
  // 自動 close をシミュレートしないので、production と同じく `onSuccess` /
  // `onError` 経由でしか閉じない動線を維持できる。
  //
  // Minimal AlertDialog mock: render children only while `open`. Tests click
  // `AlertDialogAction` directly to fire the mutation; we don't simulate Radix
  // auto-close so the close-on-success / close-on-error contract is exercised.
  AlertDialog: ({ open, children }: { open?: boolean; children: React.ReactNode }) =>
    open ? <div data-testid="delete-confirm-dialog">{children}</div> : null,
  AlertDialogContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  AlertDialogHeader: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  AlertDialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  AlertDialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  AlertDialogFooter: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  AlertDialogCancel: ({
    children,
    onClick,
    disabled,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button type="button" onClick={onClick} disabled={disabled} data-testid="confirm-cancel">
      {children}
    </button>
  ),
  AlertDialogAction: ({
    children,
    onClick,
    disabled,
  }: {
    children: React.ReactNode;
    onClick?: (e: React.MouseEvent) => void;
    disabled?: boolean;
  }) => (
    <button
      type="button"
      onClick={(e) => onClick?.(e)}
      disabled={disabled}
      data-testid="confirm-delete"
    >
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
    mockNavigate.mockReset();
    mockUpdatePageMutateAsync.mockResolvedValue({ skipped: false });
    mockApi.updatePageMetadata.mockReset();
    mockExportMarkdown.mockReset();
    mockCopyMarkdown.mockReset().mockResolvedValue(undefined);
    mockRemoveFromNoteMutate.mockReset();
    mockUseMarkdownExport.mockReset();
    // 既定: read-only 経路の公開コンテンツは「ロード完了 + 本文あり」。
    // Default: read-only public content is resolved with a non-empty body so
    // existing tests asserting menu item presence and click behavior remain
    // unaffected. Individual tests override this for loading / empty cases.
    vi.mocked(usePagePublicContent).mockReturnValue({
      data: {
        id: "page-1",
        title: "Public title",
        content_text: "public body",
        content_preview: null,
        version: 1,
        updated_at: "2026-01-01T00:00:00Z",
      },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as never);
    vi.mocked(useRemovePageFromNote).mockReturnValue({
      mutate: mockRemoveFromNoteMutate,
      isPending: false,
    } as never);
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

  // ── 共通ツールバー (`PageEditorHeader`) 統合 ─────────────────────
  // Issue #884: NotePageView は `/pages/:id` と同じツールバーを再利用する。
  // back ボタンは必ず `/notes/:noteId` に戻り、`/home` への fallback には依存しない。
  //
  // Issue #884: NotePageView reuses the shared `PageEditorHeader`. Back must
  // navigate to `/notes/:noteId` (no legacy `/home` fallback).
  describe("shared toolbar (issue #884 / #890)", () => {
    it("back ボタンは /notes/:noteId に遷移する / clicking back navigates to /notes/:noteId", () => {
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
          noteId: "note-1",
        },
        isLoading: false,
      } as never);

      renderNotePageView();

      const backButton = screen.getByRole("button", { name: "Back" });
      fireEvent.click(backButton);

      expect(mockNavigate).toHaveBeenCalledWith("/notes/note-1");
      expect(mockNavigate).not.toHaveBeenCalledWith("/home");
    });

    it("閲覧専用ユーザーには `閲覧専用` ラベルが共通ツールバー右側に出る / surfaces the read-only badge for non-editors", () => {
      vi.mocked(useNote).mockReturnValue({
        note: { id: "note-1" },
        access: { canView: true, canEdit: false },
        source: "local",
        isLoading: false,
      } as never);
      vi.mocked(useNotePage).mockReturnValue({
        data: {
          id: "page-1",
          title: "Read only",
          content: "{}",
          ownerUserId: "user-other",
          noteId: "note-1",
        },
        isLoading: false,
      } as never);

      renderNotePageView();

      expect(screen.getByText("閲覧専用")).toBeInTheDocument();
    });

    it("編集可能ユーザーには `閲覧専用` ラベルを出さない / hides the badge when canEdit", () => {
      vi.mocked(useNote).mockReturnValue({
        note: { id: "note-1" },
        access: { canView: true, canEdit: true },
        source: "local",
        isLoading: false,
      } as never);
      vi.mocked(useNotePage).mockReturnValue({
        data: {
          id: "page-1",
          title: "Editable",
          content: "{}",
          ownerUserId: "user-1",
          noteId: "note-1",
        },
        isLoading: false,
      } as never);

      renderNotePageView();

      expect(screen.queryByText("閲覧専用")).not.toBeInTheDocument();
    });

    // Issue #890: アクションメニューを `/pages/:id` と同じ4項目に揃える。
    // Issue #890: align the action menu with `/pages/:id` (4 items).
    it("編集可能時、共通ツールバーに `/pages/:id` と同じ4項目を出す / surfaces the four `/pages/:id` actions when editable", () => {
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

      expect(screen.getByText("editor.pageHistory.menuButton")).toBeInTheDocument();
      expect(screen.getByText("editor.pageMenu.exportMarkdown")).toBeInTheDocument();
      expect(screen.getByText("editor.pageMenu.copyMarkdown")).toBeInTheDocument();
      expect(screen.getByText("editor.pageMenu.deletePage")).toBeInTheDocument();
      // 旧「個人に取り込み」項目は削除されていることを明示的に検証する。
      // Explicitly verify the removed "copy to personal" entry is gone.
      expect(screen.queryByText("notes.copyToPersonal")).not.toBeInTheDocument();
    });

    it("read-only 時、削除以外の3項目だけを出す / shows history/export/copy but hides delete in read-only mode", () => {
      vi.mocked(useNote).mockReturnValue({
        note: { id: "note-1" },
        access: { canView: true, canEdit: false },
        source: "local",
        isLoading: false,
      } as never);
      vi.mocked(useNotePage).mockReturnValue({
        data: {
          id: "page-1",
          title: "Read only",
          content: "{}",
          ownerUserId: "user-other",
          noteId: "note-1",
        },
        isLoading: false,
      } as never);

      renderNotePageView();

      expect(screen.getByText("editor.pageHistory.menuButton")).toBeInTheDocument();
      expect(screen.getByText("editor.pageMenu.exportMarkdown")).toBeInTheDocument();
      expect(screen.getByText("editor.pageMenu.copyMarkdown")).toBeInTheDocument();
      // read-only では削除は出さない（権限がないため）。
      // Delete is hidden in read-only mode (no permission).
      expect(screen.queryByText("editor.pageMenu.deletePage")).not.toBeInTheDocument();
    });

    // Codex P2 review on PR #891: `/api/pages/:id/snapshots` requires auth, so
    // unauthenticated guests viewing a public / unlisted note page must not see
    // the history entry (it would 401 inside `PageHistoryModal`). Export / copy
    // remain available since they read `page.content` client-side.
    it("未ログインの read-only viewer には履歴項目を出さず、エクスポート/コピーは残す / hides history but keeps export/copy for unauthenticated read-only viewers", () => {
      vi.mocked(useAuth).mockReturnValue({ isSignedIn: false, userId: undefined } as never);
      // `useAuth` を未ログインに切り替えるなら、同じく `isSignedIn` を持つ
      // `useNoteApi` も整合させておく（CodeRabbit）。現状の実装は `useAuth`
      // 側だけを読んでいるが、将来 `useNoteApi.isSignedIn` を参照しても
      // テストが silently pass しないよう fixture をそろえる。
      // Keep the auth fixtures coherent: if `useAuth.isSignedIn` is false, the
      // sibling `useNoteApi.isSignedIn` should match. The component currently
      // only reads from `useAuth`, but aligning the fixture prevents a future
      // refactor from silently passing this test.
      vi.mocked(useNoteApi).mockReturnValue({
        api: mockApi,
        userId: "",
        userEmail: undefined,
        isSignedIn: false,
        isLoaded: true,
      } as never);
      vi.mocked(useNote).mockReturnValue({
        note: { id: "note-1" },
        access: { canView: true, canEdit: false },
        source: "remote",
        isLoading: false,
      } as never);
      vi.mocked(useNotePage).mockReturnValue({
        data: {
          id: "page-1",
          title: "Guest viewable",
          content: "Body",
          ownerUserId: "user-other",
          noteId: "note-1",
        },
        isLoading: false,
      } as never);

      renderNotePageView();

      expect(screen.queryByText("editor.pageHistory.menuButton")).not.toBeInTheDocument();
      expect(screen.getByText("editor.pageMenu.exportMarkdown")).toBeInTheDocument();
      expect(screen.getByText("editor.pageMenu.copyMarkdown")).toBeInTheDocument();
      expect(screen.queryByText("editor.pageMenu.deletePage")).not.toBeInTheDocument();
    });
  });

  describe("menu actions (issue #890)", () => {
    function setupEditableRender(overrides?: { canEdit?: boolean; noteId?: string | null }) {
      const canEdit = overrides?.canEdit ?? true;
      const noteIdValue = overrides?.noteId ?? "note-1";
      vi.mocked(useNote).mockReturnValue({
        note: { id: "note-1" },
        access: { canView: true, canEdit },
        source: "local",
        isLoading: false,
      } as never);
      vi.mocked(useNotePage).mockReturnValue({
        data: {
          id: "page-1",
          title: "Note title",
          content: "Note body",
          ownerUserId: canEdit ? "user-1" : "user-other",
          noteId: noteIdValue,
        },
        isLoading: false,
      } as never);
    }

    it("`変更履歴` をクリックすると `PageHistoryModal` を開く / opens PageHistoryModal on history click", () => {
      setupEditableRender();
      renderNotePageView();

      // 開く前は modal 非表示 / modal hidden initially
      expect(screen.queryByTestId("page-history-modal")).not.toBeInTheDocument();

      fireEvent.click(screen.getByText("editor.pageHistory.menuButton"));

      const modal = screen.getByTestId("page-history-modal");
      expect(modal).toBeInTheDocument();
      expect(modal).toHaveAttribute("data-page-id", "page-1");
    });

    it("`Markdownでエクスポート` で `handleExportMarkdown` を呼ぶ / invokes handleExportMarkdown on export click", () => {
      setupEditableRender();
      renderNotePageView();

      fireEvent.click(screen.getByText("editor.pageMenu.exportMarkdown"));

      expect(mockExportMarkdown).toHaveBeenCalledTimes(1);
    });

    it("`Markdownをコピー` で `handleCopyMarkdown` を呼ぶ / invokes handleCopyMarkdown on copy click", () => {
      setupEditableRender();
      renderNotePageView();

      fireEvent.click(screen.getByText("editor.pageMenu.copyMarkdown"));

      expect(mockCopyMarkdown).toHaveBeenCalledTimes(1);
    });

    it("`削除` で確認ダイアログを開くがミューテーションは確認後に走る / opens confirm dialog without firing mutation until confirmed", () => {
      setupEditableRender();
      renderNotePageView();

      // ダイアログは最初閉じている / dialog starts closed
      expect(screen.queryByTestId("delete-confirm-dialog")).not.toBeInTheDocument();

      fireEvent.click(screen.getByText("editor.pageMenu.deletePage"));

      expect(screen.getByTestId("delete-confirm-dialog")).toBeInTheDocument();
      // 確認前は mutation 未発火 / mutation must not fire pre-confirmation
      expect(mockRemoveFromNoteMutate).not.toHaveBeenCalled();
    });

    it("削除成功時に `/notes/:noteId` へ遷移して toast を出す / navigates to /notes/:noteId and toasts on success", () => {
      setupEditableRender();
      mockRemoveFromNoteMutate.mockImplementation((_args, options) => {
        options?.onSuccess?.();
      });
      renderNotePageView();

      fireEvent.click(screen.getByText("editor.pageMenu.deletePage"));
      fireEvent.click(screen.getByTestId("confirm-delete"));

      expect(mockRemoveFromNoteMutate).toHaveBeenCalledWith(
        { noteId: "note-1", pageId: "page-1" },
        expect.any(Object),
      );
      expect(mockNavigate).toHaveBeenCalledWith("/notes/note-1");
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "common.page.pageDeleted" }),
      );
      // 成功後はダイアログを閉じる / dialog closes after success
      expect(screen.queryByTestId("delete-confirm-dialog")).not.toBeInTheDocument();
    });

    it("削除失敗時はナビゲートせず destructive toast を出す / does not navigate and surfaces destructive toast on failure", async () => {
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
      setupEditableRender();
      mockRemoveFromNoteMutate.mockImplementation((_args, options) => {
        options?.onError?.(new Error("server error"));
      });
      renderNotePageView();

      fireEvent.click(screen.getByText("editor.pageMenu.deletePage"));
      fireEvent.click(screen.getByTestId("confirm-delete"));

      expect(mockRemoveFromNoteMutate).toHaveBeenCalled();
      expect(mockNavigate).not.toHaveBeenCalledWith("/notes/note-1");
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "common.error",
          variant: "destructive",
        }),
      );
      consoleError.mockRestore();
    });

    it("削除キャンセル時はダイアログを閉じて mutation を呼ばない / closes dialog and skips mutation on cancel", () => {
      setupEditableRender();
      renderNotePageView();

      fireEvent.click(screen.getByText("editor.pageMenu.deletePage"));
      expect(screen.getByTestId("delete-confirm-dialog")).toBeInTheDocument();

      fireEvent.click(screen.getByTestId("confirm-cancel"));

      expect(screen.queryByTestId("delete-confirm-dialog")).not.toBeInTheDocument();
      expect(mockRemoveFromNoteMutate).not.toHaveBeenCalled();
    });

    it("read-only でも `変更履歴` から `PageHistoryModal` を開ける / read-only viewer can still open history", () => {
      setupEditableRender({ canEdit: false });
      renderNotePageView();

      fireEvent.click(screen.getByText("editor.pageHistory.menuButton"));

      const modal = screen.getByTestId("page-history-modal");
      expect(modal).toBeInTheDocument();
      expect(modal).toHaveAttribute("data-page-id", "page-1");
    });

    // Codex P2 review on PR #891 + Issue #889 Phase 4: 削除成功直後の navigate で
    // アンマウント flush が走ると、保留中のタイトル保存が「もう存在しない
    // ページ」に対する `updatePageMetadata` を撃ってしまい spurious な
    // failed-toast が出る。`change-title` で debounce 中のタイトルを作った状態で
    // 削除を成功させ、`mockApi.updatePageMetadata` が呼ばれていないことで
    // cancel hook の効果を検証する。
    //
    // Pin the cancel-pending-title-save behavior added for Codex P2 (now
    // exercising the Phase 4 `updatePageMetadata` path). We prime a pending
    // debounced title change, then confirm a successful delete; the editable
    // child's unmount flush must be neutered before navigation so
    // `updatePageMetadata` is never invoked against the just-removed page.
    it("削除成功時に保留中のタイトル保存をキャンセルする / cancels pending title save before delete-success navigation", async () => {
      setupEditableRender();
      // 漏れた unmount-flush が `updatePageMetadata` まで到達したケースを検出
      // できるように、応答も用意しておく。
      // Wire up a resolved response so any leaked unmount-flush would actually
      // reach `updatePageMetadata` — the assertion below depends on this never
      // firing.
      mockApi.updatePageMetadata.mockResolvedValue({
        id: "page-1",
        title: "Edited title",
        content_preview: null,
        updated_at: "2026-05-17T00:00:00Z",
      });
      mockRemoveFromNoteMutate.mockImplementation((_args, options) => {
        options?.onSuccess?.();
      });
      // `useNavigate` はモック化済みなので、本番の "navigate → route unmount"
      // を再現するには明示的に `unmount()` する必要がある。`render()` の戻り値を
      // 取って後で呼ぶ。
      // `useNavigate` is mocked in this suite, so navigation never actually
      // unmounts the route's children. Capture `unmount` from `render()` and
      // invoke it explicitly to reproduce the production sequence
      // (delete onSuccess → navigate → react-router unmounts `NotePageView`).
      const { unmount } = renderNotePageView();

      // 編集中のタイトル変更で debounce タイマーを設置する。timer は flush 前に
      // キャンセルされる前提なので `advanceTimersByTime` は呼ばない。
      // Stage a debounced title change without flushing it; the delete flow
      // must cancel the timer before unmount runs.
      fireEvent.click(screen.getByText("change-title"));

      fireEvent.click(screen.getByText("editor.pageMenu.deletePage"));
      fireEvent.click(screen.getByTestId("confirm-delete"));

      expect(mockNavigate).toHaveBeenCalledWith("/notes/note-1");

      // ここで navigate 相当のアンマウントを実行する。cancel hook が onSuccess
      // 内で走っているはずなので、unmount cleanup の `flushPendingTitleRef.current()`
      // は pending == null で即 return すべき。
      // Simulate the post-navigate unmount. The cancel hook should have run
      // inside `onSuccess`, so the unmount cleanup's
      // `flushPendingTitleRef.current()` must short-circuit on a null pending.
      unmount();
      vi.useRealTimers();
      await new Promise((resolve) => setTimeout(resolve, 0));

      // タイトル保存経路は `updatePageMetadata` 一発のみ。これが呼ばれて
      // いなければ pendingTitleRef は確実に null 化されている。
      // The Phase 4 title-save flush issues a single `updatePageMetadata`
      // call; asserting it never fires guarantees the cancel hook neutered
      // the pending state before unmount.
      expect(mockApi.updatePageMetadata).not.toHaveBeenCalled();
      // unmount-flush が走らなければ `errors.titleSaveFailedTitle` の
      // destructive トーストも当然出ない。
      // No spurious title-save-failed toast either.
      expect(mockToast).not.toHaveBeenCalledWith(
        expect.objectContaining({ title: "errors.titleSaveFailedTitle" }),
      );
    });

    // CodeRabbit major review on PR #891 + Issue #889 Phase 4: debounce が既に
    // 発火して `persistTitleRef.current()` が `updatePageMetadata` を await
    // している最中に削除が成功すると、後から in-flight save が「ページが既に
    // 存在しない」エラーを返し、削除成功の直後に `errors.titleSaveFailedTitle`
    // の destructive トーストが出てしまう。`suppressTitleSaveEffectsRef` が
    // この経路で toast を出さないことを検証する。
    //
    // Regression test for the in-flight title-save suppression. When the
    // debounce has already fired and the save is mid-await, the cancel hook
    // raises a suppress flag so the rejected `updatePageMetadata` does not
    // toast `errors.titleSaveFailedTitle` after the delete has navigated away.
    it("削除成功時に進行中のタイトル保存失敗のトーストを抑止する / suppresses in-flight title-save failure toast after delete success", async () => {
      setupEditableRender();
      // `updatePageMetadata` 呼び出し時に毎回 fresh な保留 promise を返すよう
      // `mockImplementation` を使う。`mockReturnValue` で一度作る方式だと
      // `rejectPut` の捕捉が呼び出しタイミングと無関係に進んで「テストが本当に
      // in-flight 経路を踏んだか」を保証しにくい (CodeRabbit major)。
      //
      // Use `mockImplementation` so each call creates a fresh deferred and
      // captures its `reject` at invocation time. Stubbing once up-front with
      // `mockReturnValue` makes it harder to prove the test actually reached
      // the in-flight path before we reject. CodeRabbit major review.
      let rejectPut: (err: Error) => void = () => undefined;
      mockApi.updatePageMetadata.mockImplementation(
        () =>
          new Promise((_, reject) => {
            rejectPut = reject;
          }),
      );
      mockRemoveFromNoteMutate.mockImplementation((_args, options) => {
        options?.onSuccess?.();
      });

      const { unmount } = renderNotePageView();

      // タイトルを編集して debounce timer を仕掛け、500ms 経過させて save を発火。
      // `updatePageMetadata` は保留 = in-flight save。
      // Stage a title change, flush the debounce so the save enters its
      // awaiting state — `updatePageMetadata` is left pending so the save is
      // genuinely mid-flight.
      fireEvent.click(screen.getByText("change-title"));
      await vi.advanceTimersByTimeAsync(500);

      // save が `updatePageMetadata` まで進んでいることを明示的に確認する。
      // ここを通らない限り `rejectPut(...)` は no-op になり、最終アサートが
      // 理由で通ったように見えてしまう (CodeRabbit major)。`vi.waitFor` は
      // 実時間でポーリングするので real timers に切り替えてから呼ぶ。
      // Pin that the save actually entered the in-flight path before we
      // trigger delete; otherwise `rejectPut(...)` is a no-op and the final
      // assertion passes for the wrong reason. `vi.waitFor` polls in real
      // time so flip to real timers first.
      vi.useRealTimers();
      await vi.waitFor(() => {
        expect(mockApi.updatePageMetadata).toHaveBeenCalledTimes(1);
      });

      // この時点で in-flight。削除を発火する。
      // Trigger delete while the save is still awaiting `updatePageMetadata`.
      fireEvent.click(screen.getByText("editor.pageMenu.deletePage"));
      fireEvent.click(screen.getByTestId("confirm-delete"));

      // navigate 後のアンマウントを再現。
      // Simulate the post-navigate unmount.
      unmount();

      // 削除済みページ側の `updatePageMetadata` を 404 相当で決着させる。
      // Resolve the deferred `updatePageMetadata` with the "deleted" error.
      rejectPut(new Error("page not found"));
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));

      // 抑止フラグが立っているので失敗 toast は出ないはず。
      // Suppress flag should be set, so the destructive toast must not fire.
      expect(mockToast).not.toHaveBeenCalledWith(
        expect.objectContaining({ title: "errors.titleSaveFailedTitle" }),
      );
    });

    // CodeRabbit major review on PR #891: `AlertDialogAction` の `disabled` は
    // 次回コミットまで反映されないため、同一フレームの二重クリックで
    // `mutate` が二回走ってしまう。`isPending` を同期ガードに使うことで
    // 二回目を弾く動作をピン止めする。
    //
    // Same-frame double-click guard: the AlertDialog's `disabled` prop doesn't
    // update until next render, so a synchronous `isPending` bail-out is the
    // only thing keeping `mutate` from firing twice. Force the mutation into
    // a pending state and verify a second confirm click is a no-op.
    it("削除確定が同期的に二回呼ばれても mutate は一回しか走らない / guards handleConfirmDelete against same-frame double submit", () => {
      setupEditableRender();
      // 1 回目で `isPending: true` に切り替えてから 2 回目をシミュレートする。
      // Flip the mutation hook into pending after the first call so the
      // second synchronous click hits the `isPending` guard.
      let pending = false;
      vi.mocked(useRemovePageFromNote).mockImplementation(
        () =>
          ({
            mutate: (...args: unknown[]) => {
              pending = true;
              mockRemoveFromNoteMutate(...args);
            },
            get isPending() {
              return pending;
            },
          }) as never,
      );
      renderNotePageView();

      fireEvent.click(screen.getByText("editor.pageMenu.deletePage"));
      // Confirm button is rendered inside the dialog; click it twice in the
      // same task. The second click must not reach `mutate`.
      const confirmButton = screen.getByTestId("confirm-delete");
      fireEvent.click(confirmButton);
      fireEvent.click(confirmButton);

      expect(mockRemoveFromNoteMutate).toHaveBeenCalledTimes(1);
    });
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

  // Issue #889 Phase 2: 非編集者には Y.Doc を一切張らない `NotePagePublicView` に委譲する。
  // Issue #889 Phase 2: Non-editors are delegated to `NotePagePublicView`, which
  // never opens a Y.Doc / WebSocket session.
  it("非編集者には NotePagePublicView を描画する / delegates the read-only branch to NotePagePublicView", () => {
    vi.mocked(useNote).mockReturnValue({
      note: { id: "note-1" },
      access: { canView: true, canEdit: false },
      source: "local",
      isLoading: false,
    } as never);
    vi.mocked(useNotePage).mockReturnValue({
      data: {
        id: "page-1",
        title: "Read only",
        content: "{}",
        ownerUserId: "user-other",
        noteId: "note-1",
      },
      isLoading: false,
    } as never);

    renderNotePageView();

    const publicView = screen.getByTestId("note-public-view");
    expect(publicView).toBeInTheDocument();
    expect(publicView).toHaveAttribute("data-page-id", "page-1");
    // 編集パスの `PageEditorContent` は描画されないこと。
    // The editable-path `PageEditorContent` must not be rendered.
    expect(screen.queryByTestId("page-editor")).not.toBeInTheDocument();
  });

  // Codex P1 (PR #893): `useNotePage` 経由の `page.content` は常に "" のため、
  // 読み取り経路の Markdown export / copy は `usePagePublicContent` 由来の
  // `content_text` を使う必要がある。
  // Codex P1 (PR #893): `page.content` from `useNotePage` is always `""`, so
  // read-only Markdown export / copy must consume `content_text` from the
  // public-content query instead.
  it("読み取り経路の Markdown export は public-content の content_text を使う / read-only Markdown export sources text from public-content", () => {
    vi.mocked(useNote).mockReturnValue({
      note: { id: "note-1" },
      access: { canView: true, canEdit: false },
      source: "local",
      isLoading: false,
    } as never);
    vi.mocked(useNotePage).mockReturnValue({
      data: {
        id: "page-1",
        // `apiPageToPage` is hard-coded to `""` here; this is the regression input.
        title: "Stale metadata title",
        content: "",
        ownerUserId: "user-other",
        noteId: "note-1",
      },
      isLoading: false,
    } as never);
    vi.mocked(usePagePublicContent).mockReturnValue({
      data: {
        id: "page-1",
        title: "Fresh public title",
        content_text: "real body from public-content",
        content_preview: null,
        version: 1,
        updated_at: "2026-01-01T00:00:00Z",
      },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as never);

    renderNotePageView();

    // `useMarkdownExport(title, body, sourceUrl)` の 2 引数目に public-content の
    // `content_text` が、1 引数目に response の `title` が渡ること。
    // The second arg to `useMarkdownExport(title, body, sourceUrl)` must be the
    // public-content `content_text` and the first arg must be its `title`.
    expect(mockUseMarkdownExport).toHaveBeenCalled();
    const lastCall = mockUseMarkdownExport.mock.calls[mockUseMarkdownExport.mock.calls.length - 1];
    expect(lastCall?.[0]).toBe("Fresh public title");
    expect(lastCall?.[1]).toBe("real body from public-content");
  });

  it("public-content が未到着の間は export/copy メニュー項目を無効化する / disables export/copy until public-content resolves", () => {
    vi.mocked(useNote).mockReturnValue({
      note: { id: "note-1" },
      access: { canView: true, canEdit: false },
      source: "local",
      isLoading: false,
    } as never);
    vi.mocked(useNotePage).mockReturnValue({
      data: {
        id: "page-1",
        title: "Loading body",
        content: "",
        ownerUserId: "user-other",
        noteId: "note-1",
      },
      isLoading: false,
    } as never);
    vi.mocked(usePagePublicContent).mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
      refetch: vi.fn(),
    } as never);

    renderNotePageView();

    const exportItem = screen.getByText("editor.pageMenu.exportMarkdown").closest("button");
    const copyItem = screen.getByText("editor.pageMenu.copyMarkdown").closest("button");
    expect(exportItem).toBeDisabled();
    expect(copyItem).toBeDisabled();
  });

  it("saves note-native page titles through the metadata API for note editors", async () => {
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
    mockApi.updatePageMetadata.mockResolvedValue({
      id: "page-1",
      title: "Edited title",
      content_preview: null,
      updated_at: "2026-05-17T00:00:00Z",
    });

    renderNotePageView();
    fireEvent.click(screen.getByText("change-title"));
    await vi.advanceTimersByTimeAsync(500);
    await Promise.resolve();
    await Promise.resolve();

    // Issue #889 Phase 4: タイトル保存は Y.Doc を介さず、`PUT /api/pages/:id`
    // (`updatePageMetadata`) ひとつだけが発火する。旧 `getPageContent` +
    // `putPageContent` の 2 段経路は廃止されている。
    // Issue #889 Phase 4: title saves now fire a single `updatePageMetadata`
    // call instead of the legacy `getPageContent` + `putPageContent`
    // round-trip.
    expect(mockApi.updatePageMetadata).toHaveBeenCalledTimes(1);
    expect(mockApi.updatePageMetadata).toHaveBeenCalledWith("page-1", {
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
    mockApi.updatePageMetadata.mockRejectedValue(new Error("save failed"));

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
    expect(mockApi.updatePageMetadata).not.toHaveBeenCalled();
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
    vi.advanceTimersByTime(500);
    await Promise.resolve();

    // Issue #889 Phase 2: 非編集者には NotePagePublicView を描画する。
    // 編集可能な PageEditorContent (`page-editor` / `change-title` ボタンを持つ)
    // は mount されないため、タイトル編集や save 経路には決して到達しない。
    // Issue #889 Phase 2: Non-editors render `NotePagePublicView` instead of the
    // editable `PageEditorContent`, so the title-edit button never mounts and
    // the save paths are unreachable by construction.
    expect(screen.getByText("閲覧専用")).toBeInTheDocument();
    expect(screen.getByTestId("note-public-view")).toBeInTheDocument();
    expect(screen.queryByTestId("page-editor")).not.toBeInTheDocument();
    expect(screen.queryByText("change-title")).not.toBeInTheDocument();
    expect(mockApi.updatePageMetadata).not.toHaveBeenCalled();
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
});
