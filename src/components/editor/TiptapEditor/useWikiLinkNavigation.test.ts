import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useWikiLinkNavigation } from "./useWikiLinkNavigation";
import { createHookWrapper } from "@/test/testWrapper";

const mockNavigate = vi.fn();
const mockMutateAsync = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock("@/hooks/pages/usePageQueries", () => ({
  usePageByTitle: vi.fn(),
  usePagesSummary: vi.fn(() => ({ data: [], isLoading: false, isFetched: true })),
  useCreatePage: () => ({
    mutateAsync: mockMutateAsync,
  }),
}));

vi.mock("@/hooks/notes/useNoteQueries", () => ({
  // issue #860 Phase 6: useNotePages → useNoteTitleIndex への移行に合わせて
  // mock 名を変更。返す shape は { id, title, isDeleted, updatedAt } 配列。
  // Issue #860 Phase 6: switched mock to `useNoteTitleIndex`; data is an
  // array of `{ id, title, isDeleted, updatedAt }` rather than full
  // `NotePageSummary` rows.
  useNoteTitleIndex: vi.fn(() => ({ data: [], isLoading: false, isFetched: true })),
}));

import { usePageByTitle } from "@/hooks/pages/usePageQueries";
import { useNoteTitleIndex } from "@/hooks/notes/useNoteQueries";

// Issue #889 Phase 3: `/pages/:id` 廃止に伴い、個人スコープのナビゲーションも
// `/notes/:noteId/:pageId` に統合された。テストの期待値も note-scoped に揃える。
// Issue #889 Phase 3: personal-scope navigation now also targets
// `/notes/:noteId/:pageId` since `/pages/:id` has been retired.
const DEFAULT_NOTE_ID = "default-note";

describe("useWikiLinkNavigation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(usePageByTitle).mockReturnValue({
      data: undefined,
      isFetched: false,
    } as ReturnType<typeof usePageByTitle>);
  });

  it("returns initial state with dialog closed and no pending title", () => {
    const { result } = renderHook(() => useWikiLinkNavigation(), {
      wrapper: createHookWrapper(),
    });
    expect(result.current.createPageDialogOpen).toBe(false);
    expect(result.current.pendingCreatePageTitle).toBe(null);
  });

  it("opens dialog and sets pendingCreatePageTitle when page is not found", async () => {
    vi.mocked(usePageByTitle).mockImplementation(
      (title: string) =>
        ({
          data: undefined,
          isFetched: title !== "",
        }) as ReturnType<typeof usePageByTitle>,
    );

    const { result } = renderHook(() => useWikiLinkNavigation(), {
      wrapper: createHookWrapper(),
    });

    act(() => {
      result.current.handleLinkClick("Some New Page");
    });

    await waitFor(() => {
      expect(result.current.createPageDialogOpen).toBe(true);
      expect(result.current.pendingCreatePageTitle).toBe("Some New Page");
    });
  });

  it("calls navigate when page is found and does not open dialog", async () => {
    vi.mocked(usePageByTitle).mockImplementation(
      (title: string) =>
        ({
          data:
            title === "Existing Page"
              ? { id: "existing-id", title: "Existing Page", noteId: DEFAULT_NOTE_ID }
              : undefined,
          isFetched: title !== "",
        }) as ReturnType<typeof usePageByTitle>,
    );

    const { result } = renderHook(() => useWikiLinkNavigation(), {
      wrapper: createHookWrapper(),
    });

    act(() => {
      result.current.handleLinkClick("Existing Page");
    });

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith(`/notes/${DEFAULT_NOTE_ID}/existing-id`, {
        replace: false,
        flushSync: true,
      });
    });
    expect(result.current.createPageDialogOpen).toBe(false);
  });

  it("handleCancelCreate closes dialog and clears pending title", async () => {
    vi.mocked(usePageByTitle).mockImplementation(
      (title: string) =>
        ({
          data: undefined,
          isFetched: title !== "",
        }) as ReturnType<typeof usePageByTitle>,
    );

    const { result } = renderHook(() => useWikiLinkNavigation(), {
      wrapper: createHookWrapper(),
    });

    act(() => {
      result.current.handleLinkClick("Cancel Test");
    });

    await waitFor(() => {
      expect(result.current.createPageDialogOpen).toBe(true);
    });

    act(() => {
      result.current.handleCancelCreate();
    });

    expect(result.current.createPageDialogOpen).toBe(false);
    expect(result.current.pendingCreatePageTitle).toBe(null);
  });

  it("handleConfirmCreate calls mutateAsync and navigates on success", async () => {
    mockMutateAsync.mockResolvedValue({ id: "new-page-id", noteId: DEFAULT_NOTE_ID });

    vi.mocked(usePageByTitle).mockImplementation(
      (title: string) =>
        ({
          data: undefined,
          isFetched: title !== "",
        }) as ReturnType<typeof usePageByTitle>,
    );

    const { result } = renderHook(() => useWikiLinkNavigation(), {
      wrapper: createHookWrapper(),
    });

    act(() => {
      result.current.handleLinkClick("New Page Title");
    });

    await waitFor(() => {
      expect(result.current.createPageDialogOpen).toBe(true);
      expect(result.current.pendingCreatePageTitle).toBe("New Page Title");
    });

    await act(async () => {
      await result.current.handleConfirmCreate();
    });

    expect(mockMutateAsync).toHaveBeenCalledWith({
      title: "New Page Title",
      content: "",
    });
    expect(mockNavigate).toHaveBeenCalledWith(`/notes/${DEFAULT_NOTE_ID}/new-page-id`, {
      replace: false,
      flushSync: true,
    });
    expect(result.current.createPageDialogOpen).toBe(false);
    expect(result.current.pendingCreatePageTitle).toBe(null);
  });

  // Issue #931: 既存個人ページに対する Cmd/Ctrl+クリックは、クリック時に
  // 同期で `window.open("about:blank")` を呼んでユーザーアクティベーション
  // を確保し、ページ解決後にそのタブの `location.href` を差し替える。
  // ルータは呼ばないこと。
  // Issue #931: Cmd/Ctrl+click on an existing personal page opens an
  // `about:blank` tab synchronously to preserve user activation and
  // updates its `location.href` once the page resolves. The router must
  // not be invoked.
  it("既存個人ページに対する newTab クリックは about:blank を同期で開き、解決後に location を上書きする", async () => {
    const mockWindow = { location: { href: "" }, close: vi.fn() };
    const openSpy = vi.spyOn(window, "open").mockReturnValue(mockWindow as unknown as Window);
    vi.mocked(usePageByTitle).mockImplementation(
      (title: string) =>
        ({
          data:
            title === "Existing Page"
              ? { id: "existing-id", title: "Existing Page", noteId: DEFAULT_NOTE_ID }
              : undefined,
          isFetched: title !== "",
        }) as ReturnType<typeof usePageByTitle>,
    );

    const { result } = renderHook(() => useWikiLinkNavigation(), {
      wrapper: createHookWrapper(),
    });

    act(() => {
      result.current.handleLinkClick("Existing Page", { newTab: true });
    });

    // The blank tab is reserved synchronously inside the click handler.
    expect(openSpy).toHaveBeenCalledWith("about:blank", "_blank", "noopener,noreferrer");

    await waitFor(() => {
      expect(mockWindow.location.href).toBe(`/notes/${DEFAULT_NOTE_ID}/existing-id`);
    });
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(mockWindow.close).not.toHaveBeenCalled();

    openSpy.mockRestore();
  });

  // Issue #931: ゴーストリンクを Cmd/Ctrl+クリックすると、クリック時に
  // about:blank タブを確保 → 確認ダイアログを表示 → 確定後にそのタブの
  // `location.href` を新規ページに差し替える。
  // Issue #931: Cmd/Ctrl+click on a ghost link reserves an `about:blank`
  // tab during the user gesture, shows the confirm dialog, and rewrites
  // the tab's `location.href` after the mutation succeeds.
  it("newTab で開いたゴーストリンクは Dialog 確定で about:blank の location を上書きする", async () => {
    const mockWindow = { location: { href: "" }, close: vi.fn() };
    const openSpy = vi.spyOn(window, "open").mockReturnValue(mockWindow as unknown as Window);
    mockMutateAsync.mockResolvedValue({ id: "new-page-id", noteId: DEFAULT_NOTE_ID });
    vi.mocked(usePageByTitle).mockImplementation(
      (title: string) =>
        ({
          data: undefined,
          isFetched: title !== "",
        }) as ReturnType<typeof usePageByTitle>,
    );

    const { result } = renderHook(() => useWikiLinkNavigation(), {
      wrapper: createHookWrapper(),
    });

    act(() => {
      result.current.handleLinkClick("Brand New", { newTab: true });
    });
    expect(openSpy).toHaveBeenCalledWith("about:blank", "_blank", "noopener,noreferrer");

    await waitFor(() => {
      expect(result.current.createPageDialogOpen).toBe(true);
      expect(result.current.pendingCreatePageTitle).toBe("Brand New");
    });

    await act(async () => {
      await result.current.handleConfirmCreate();
    });

    expect(mockMutateAsync).toHaveBeenCalledWith({ title: "Brand New", content: "" });
    expect(mockWindow.location.href).toBe(`/notes/${DEFAULT_NOTE_ID}/new-page-id`);
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(result.current.createPageDialogOpen).toBe(false);
    expect(mockWindow.close).not.toHaveBeenCalled();

    openSpy.mockRestore();
  });

  // Issue #931: newTab で開いたゴーストをキャンセルすると、確保済みの
  // about:blank タブを閉じる。次の通常クリックでは navigate にフォール
  // バックすること。
  // Issue #931: cancelling a new-tab ghost dialog must close the reserved
  // `about:blank` tab and leave subsequent normal clicks untouched.
  it("newTab ゴーストをキャンセルすると about:blank を閉じ、次の通常クリックは navigate にフォールバックする", async () => {
    const cancelledWindow = { location: { href: "" }, close: vi.fn() };
    const openSpy = vi.spyOn(window, "open").mockReturnValue(cancelledWindow as unknown as Window);
    mockMutateAsync.mockResolvedValue({ id: "second-id", noteId: DEFAULT_NOTE_ID });
    vi.mocked(usePageByTitle).mockImplementation(
      (title: string) =>
        ({
          data: undefined,
          isFetched: title !== "",
        }) as ReturnType<typeof usePageByTitle>,
    );

    const { result } = renderHook(() => useWikiLinkNavigation(), {
      wrapper: createHookWrapper(),
    });

    act(() => {
      result.current.handleLinkClick("Ghost A", { newTab: true });
    });
    // 初回クリックでは about:blank を確保する。
    // The initial click reserves an `about:blank` tab.
    expect(openSpy).toHaveBeenCalledTimes(1);
    expect(openSpy).toHaveBeenCalledWith("about:blank", "_blank", "noopener,noreferrer");
    await waitFor(() => {
      expect(result.current.createPageDialogOpen).toBe(true);
    });
    act(() => {
      result.current.handleCancelCreate();
    });
    // キャンセル時は確保したタブを閉じる。
    // Cancel closes the reserved tab.
    expect(cancelledWindow.close).toHaveBeenCalledTimes(1);

    openSpy.mockClear();
    act(() => {
      result.current.handleLinkClick("Ghost B");
    });
    // newTab なしのクリックは window.open を呼ばない。
    // A normal click must not invoke `window.open`.
    expect(openSpy).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(result.current.createPageDialogOpen).toBe(true);
      expect(result.current.pendingCreatePageTitle).toBe("Ghost B");
    });

    await act(async () => {
      await result.current.handleConfirmCreate();
    });

    expect(mockNavigate).toHaveBeenCalledWith(`/notes/${DEFAULT_NOTE_ID}/second-id`, {
      replace: false,
      flushSync: true,
    });

    openSpy.mockRestore();
  });

  // Issue #931: ミューテーション失敗時は確保した about:blank を閉じる。
  // Issue #931: a failed mutation must close the reserved blank tab so
  // the user is not left with a stray popup.
  it("newTab ゴーストでミューテーションが失敗したら about:blank を閉じる", async () => {
    const mockWindow = { location: { href: "" }, close: vi.fn() };
    const openSpy = vi.spyOn(window, "open").mockReturnValue(mockWindow as unknown as Window);
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockMutateAsync.mockRejectedValue(new Error("network down"));
    vi.mocked(usePageByTitle).mockImplementation(
      (title: string) =>
        ({
          data: undefined,
          isFetched: title !== "",
        }) as ReturnType<typeof usePageByTitle>,
    );

    const { result } = renderHook(() => useWikiLinkNavigation(), {
      wrapper: createHookWrapper(),
    });

    act(() => {
      result.current.handleLinkClick("Fails", { newTab: true });
    });
    await waitFor(() => {
      expect(result.current.createPageDialogOpen).toBe(true);
    });

    await act(async () => {
      await result.current.handleConfirmCreate();
    });

    expect(mockWindow.close).toHaveBeenCalledTimes(1);
    expect(mockWindow.location.href).toBe("");

    openSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it("re-clicking a just-created title navigates immediately without reopening dialog", async () => {
    mockMutateAsync.mockResolvedValue({ id: "new-page-id", noteId: DEFAULT_NOTE_ID });
    const byTitleCache: Record<string, { id: string; title: string; noteId: string } | undefined> =
      {};
    vi.mocked(usePageByTitle).mockImplementation(
      (title: string) =>
        ({
          data: byTitleCache[title] ?? undefined,
          isFetched: title !== "",
        }) as ReturnType<typeof usePageByTitle>,
    );

    const { result } = renderHook(() => useWikiLinkNavigation(), {
      wrapper: createHookWrapper(),
    });

    act(() => {
      result.current.handleLinkClick("Fresh Page");
    });

    await waitFor(() => {
      expect(result.current.createPageDialogOpen).toBe(true);
    });

    await act(async () => {
      await result.current.handleConfirmCreate();
    });

    // Simulate useCreatePage onSuccess: byTitle cache is now populated
    byTitleCache["Fresh Page"] = {
      id: "new-page-id",
      title: "Fresh Page",
      noteId: DEFAULT_NOTE_ID,
    };
    mockNavigate.mockClear();

    act(() => {
      result.current.handleLinkClick("Fresh Page");
    });

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith(`/notes/${DEFAULT_NOTE_ID}/new-page-id`, {
        replace: false,
        flushSync: true,
      });
    });
    expect(result.current.createPageDialogOpen).toBe(false);
  });

  // Issue #713 Phase 4: `pageNoteId` を指定したときは同一ノートのページを
  // 解決候補にし、遷移先は canonical ルート `/notes/:noteId/:pageId`。
  // 個人ページの検索 (`usePageByTitle`) は呼ばれないため、ここではモック応答の
  // 有無にかかわらず同一ノート内のマッチだけが採用される。
  // Note-scoped branch (issue #713 Phase 4): navigation targets the
  // canonical `/notes/:noteId/:pageId` route and personal lookups must
  // not leak into the resolved page.
  describe("ノートスコープ (pageNoteId 指定)", () => {
    const noteId = "note-42";

    it("同一ノート内のページにマッチしたら /notes/:noteId/:pageId に遷移する", async () => {
      // issue #860 Phase 6: useNoteTitleIndex は { id, title, isDeleted,
      // updatedAt } のみ返す。wiki link 解決はこの 4 フィールドだけ参照する。
      // Issue #860 Phase 6: useNoteTitleIndex returns the minimal title row;
      // wiki-link resolution reads only id/title/isDeleted.
      vi.mocked(useNoteTitleIndex).mockReturnValue({
        data: [{ id: "note-page-1", title: "Note Page A", isDeleted: false, updatedAt: 0 }],
        isFetched: true,
        isLoading: false,
      } as unknown as ReturnType<typeof useNoteTitleIndex>);

      const { result } = renderHook(() => useWikiLinkNavigation({ pageNoteId: noteId }), {
        wrapper: createHookWrapper(),
      });

      act(() => {
        result.current.handleLinkClick("Note Page A");
      });

      await waitFor(() => {
        // 旧パス `/notes/:noteId/pages/:pageId` はリダイレクト用に残って
        // いるが、canonical ルート（App.tsx）は `/notes/:noteId/:pageId`。
        // Use the canonical short route to avoid the legacy redirect hop.
        expect(mockNavigate).toHaveBeenCalledWith(`/notes/${noteId}/note-page-1`, {
          replace: false,
          flushSync: true,
        });
      });
      expect(result.current.createPageDialogOpen).toBe(false);
    });

    it("ノート内で一致しないタイトルをクリックするとダイアログを開き、handleConfirmCreate は新規作成 API を呼ばずに閉じる", async () => {
      vi.mocked(useNoteTitleIndex).mockReturnValue({
        data: [],
        isFetched: true,
        isLoading: false,
      } as unknown as ReturnType<typeof useNoteTitleIndex>);

      const { result } = renderHook(() => useWikiLinkNavigation({ pageNoteId: noteId }), {
        wrapper: createHookWrapper(),
      });

      act(() => {
        result.current.handleLinkClick("Nonexistent");
      });

      await waitFor(() => {
        expect(result.current.createPageDialogOpen).toBe(true);
        expect(result.current.pendingCreatePageTitle).toBe("Nonexistent");
      });

      await act(async () => {
        await result.current.handleConfirmCreate();
      });

      // 個人用作成ミューテーションはノートスコープでは呼ばない（別フロー）。
      expect(mockMutateAsync).not.toHaveBeenCalled();
      expect(mockNavigate).not.toHaveBeenCalled();
      expect(result.current.createPageDialogOpen).toBe(false);
      expect(result.current.pendingCreatePageTitle).toBe(null);
    });

    // Issue #931: Cmd/Ctrl+クリックや中クリックでは、クリック時に同期で
    // `about:blank` を確保 → 解決後に `location.href` を上書きする。
    // ルータは呼ばないこと。
    // Issue #931: modifier / middle-click clicks reserve an `about:blank`
    // tab synchronously and rewrite its `location.href` once the note
    // page resolves. The router must not be invoked.
    it("既存ノートページに対する newTab クリックは about:blank を同期で開き、解決後に location を上書きする", async () => {
      const mockWindow = { location: { href: "" }, close: vi.fn() };
      const openSpy = vi.spyOn(window, "open").mockReturnValue(mockWindow as unknown as Window);
      vi.mocked(useNoteTitleIndex).mockReturnValue({
        data: [{ id: "note-page-1", title: "Note Page A", isDeleted: false, updatedAt: 0 }],
        isFetched: true,
        isLoading: false,
      } as unknown as ReturnType<typeof useNoteTitleIndex>);

      const { result } = renderHook(() => useWikiLinkNavigation({ pageNoteId: noteId }), {
        wrapper: createHookWrapper(),
      });

      act(() => {
        result.current.handleLinkClick("Note Page A", { newTab: true });
      });
      expect(openSpy).toHaveBeenCalledWith("about:blank", "_blank", "noopener,noreferrer");

      await waitFor(() => {
        expect(mockWindow.location.href).toBe(`/notes/${noteId}/note-page-1`);
      });
      expect(mockNavigate).not.toHaveBeenCalled();
      expect(mockWindow.close).not.toHaveBeenCalled();

      openSpy.mockRestore();
    });

    it("削除済みノートページと同一タイトルのクリックでは、ダイアログを開いて新規作成フローに入る", async () => {
      vi.mocked(useNoteTitleIndex).mockReturnValue({
        data: [{ id: "tombstone", title: "Archived", isDeleted: true, updatedAt: 0 }],
        isFetched: true,
        isLoading: false,
      } as unknown as ReturnType<typeof useNoteTitleIndex>);

      const { result } = renderHook(() => useWikiLinkNavigation({ pageNoteId: noteId }), {
        wrapper: createHookWrapper(),
      });

      act(() => {
        result.current.handleLinkClick("Archived");
      });

      await waitFor(() => {
        expect(result.current.createPageDialogOpen).toBe(true);
        expect(result.current.pendingCreatePageTitle).toBe("Archived");
      });
      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });
});
