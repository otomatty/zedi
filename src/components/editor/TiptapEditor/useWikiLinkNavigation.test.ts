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

vi.mock("@/hooks/usePageQueries", () => ({
  usePageByTitle: vi.fn(),
  usePagesSummary: vi.fn(() => ({ data: [], isLoading: false, isFetched: true })),
  useCreatePage: () => ({
    mutateAsync: mockMutateAsync,
  }),
}));

vi.mock("@/hooks/useNoteQueries", () => ({
  useNotePages: vi.fn(() => ({ data: [], isLoading: false, isFetched: true })),
}));

import { usePageByTitle } from "@/hooks/usePageQueries";
import { useNotePages } from "@/hooks/useNoteQueries";

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
          data: title === "Existing Page" ? { id: "existing-id" } : undefined,
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
      expect(mockNavigate).toHaveBeenCalledWith("/pages/existing-id", {
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
    mockMutateAsync.mockResolvedValue({ id: "new-page-id" });

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
    expect(mockNavigate).toHaveBeenCalledWith("/pages/new-page-id", {
      replace: false,
      flushSync: true,
    });
    expect(result.current.createPageDialogOpen).toBe(false);
    expect(result.current.pendingCreatePageTitle).toBe(null);
  });

  it("re-clicking a just-created title navigates immediately without reopening dialog", async () => {
    mockMutateAsync.mockResolvedValue({ id: "new-page-id" });
    const byTitleCache: Record<string, { id: string } | undefined> = {};
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
    byTitleCache["Fresh Page"] = { id: "new-page-id" };
    mockNavigate.mockClear();

    act(() => {
      result.current.handleLinkClick("Fresh Page");
    });

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/pages/new-page-id", {
        replace: false,
        flushSync: true,
      });
    });
    expect(result.current.createPageDialogOpen).toBe(false);
  });

  // Issue #713 Phase 4: `pageNoteId` を指定したときは同一ノートのページを
  // 解決候補にし、遷移先は `/notes/:noteId/pages/:id`。個人ページの検索
  // (`usePageByTitle`) は呼ばれないため、ここではモック応答の有無にかかわらず
  // 同一ノート内のマッチだけが採用される。
  // Note-scoped branch (issue #713 Phase 4): navigation targets the note
  // URL and personal lookups must not leak into the resolved page.
  describe("ノートスコープ (pageNoteId 指定)", () => {
    const noteId = "note-42";

    it("同一ノート内のページにマッチしたら /notes/:noteId/pages/:id に遷移する", async () => {
      vi.mocked(useNotePages).mockReturnValue({
        data: [
          {
            id: "note-page-1",
            ownerUserId: "user-1",
            noteId,
            title: "Note Page A",
            contentPreview: undefined,
            thumbnailUrl: undefined,
            sourceUrl: undefined,
            createdAt: 0,
            updatedAt: 0,
            isDeleted: false,
            addedByUserId: "user-1",
          },
        ],
        isFetched: true,
        isLoading: false,
      } as unknown as ReturnType<typeof useNotePages>);

      const { result } = renderHook(() => useWikiLinkNavigation({ pageNoteId: noteId }), {
        wrapper: createHookWrapper(),
      });

      act(() => {
        result.current.handleLinkClick("Note Page A");
      });

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith(`/notes/${noteId}/pages/note-page-1`, {
          replace: false,
          flushSync: true,
        });
      });
      expect(result.current.createPageDialogOpen).toBe(false);
    });

    it("ノート内で一致しないタイトルをクリックするとダイアログを開き、handleConfirmCreate は新規作成 API を呼ばずに閉じる", async () => {
      vi.mocked(useNotePages).mockReturnValue({
        data: [],
        isFetched: true,
        isLoading: false,
      } as unknown as ReturnType<typeof useNotePages>);

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

    it("削除済みノートページと同一タイトルのクリックでは、ダイアログを開いて新規作成フローに入る", async () => {
      vi.mocked(useNotePages).mockReturnValue({
        data: [
          {
            id: "tombstone",
            ownerUserId: "user-1",
            noteId,
            title: "Archived",
            contentPreview: undefined,
            thumbnailUrl: undefined,
            sourceUrl: undefined,
            createdAt: 0,
            updatedAt: 0,
            isDeleted: true,
            addedByUserId: "user-1",
          },
        ],
        isFetched: true,
        isLoading: false,
      } as unknown as ReturnType<typeof useNotePages>);

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
