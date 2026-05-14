import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useWikiLinkCandidates } from "./useWikiLinkCandidates";
import type { PageSummary } from "@/types/page";

// usePagesSummary と useNoteTitleIndex は、個人 / ノートスコープに応じた候補
// リストの出し分けの仕様を検証するため、返す内容を固定でモックする。
// issue #860 Phase 6: ノートスコープの fetcher を `useNoteTitleIndex` に
// 変更したのに合わせて mock 名と signature を更新（id / title / isDeleted /
// updatedAt の最小行を返す）。
//
// Mock `usePagesSummary` / `useNoteTitleIndex` so we can verify that the
// scope chosen by `useWikiLinkCandidates` selects the correct backing
// source. Issue #860 Phase 6: the note-scope fetcher is now
// `useNoteTitleIndex`, returning the minimal `{ id, title, isDeleted,
// updatedAt }` row.
const mockUsePagesSummary = vi.fn();
const mockUseNoteTitleIndex = vi.fn();

vi.mock("@/hooks/usePageQueries", () => ({
  usePagesSummary: (...args: unknown[]) => mockUsePagesSummary(...args),
}));

vi.mock("@/hooks/useNoteQueries", () => ({
  useNoteTitleIndex: (...args: unknown[]) => mockUseNoteTitleIndex(...args),
}));

function makePersonalSummary(overrides: Partial<PageSummary> = {}): PageSummary {
  return {
    id: overrides.id ?? "p-1",
    ownerUserId: overrides.ownerUserId ?? "user-1",
    noteId: null,
    title: overrides.title ?? "Personal",
    contentPreview: undefined,
    thumbnailUrl: undefined,
    sourceUrl: undefined,
    createdAt: 0,
    updatedAt: 0,
    isDeleted: overrides.isDeleted ?? false,
  };
}

/**
 * `useNoteTitleIndex` が返す軽量タイトル行のテスト用ファクトリ。
 * `useWikiLinkCandidates` のスコープ判定には `id` / `title` / `isDeleted`
 * しか使われないため、それ以外のフィールドはダミー値で良い。
 *
 * Test factory for the lightweight row returned by `useNoteTitleIndex`.
 * `useWikiLinkCandidates` only reads `id` / `title` / `isDeleted`, so the
 * remaining slots get placeholder values.
 */
function makeNoteTitle(overrides: { id?: string; title?: string; isDeleted?: boolean } = {}) {
  return {
    id: overrides.id ?? "n-1",
    title: overrides.title ?? "Note Page",
    isDeleted: overrides.isDeleted ?? false,
    updatedAt: 0,
  };
}

beforeEach(() => {
  mockUsePagesSummary.mockReset();
  mockUseNoteTitleIndex.mockReset();
});

describe("useWikiLinkCandidates", () => {
  it("pageNoteId が null のとき、個人ページサマリを返し、useNoteTitleIndex は無効化して呼ばれる（enabled=false）", () => {
    const personal = [makePersonalSummary({ id: "p-1", title: "Alpha" })];
    mockUsePagesSummary.mockReturnValue({ data: personal, isLoading: false });
    mockUseNoteTitleIndex.mockReturnValue({ data: undefined, isLoading: false });

    const { result } = renderHook(() => useWikiLinkCandidates(null));

    expect(result.current.pages).toEqual([{ id: "p-1", title: "Alpha", isDeleted: false }]);
    // 個人スコープでは個人ページ取得を有効化する。
    expect(mockUsePagesSummary).toHaveBeenCalledWith({ enabled: true });
    // issue #860 Phase 6: useNoteTitleIndex は noteId が空 + { enabled: false }
    // で呼ばれる（実データは取りに行かない）。
    expect(mockUseNoteTitleIndex).toHaveBeenCalledWith("", { enabled: false });
  });

  it("pageNoteId 指定時、ノートのタイトル一覧を返し、個人ページは候補に入らない", () => {
    const noteId = "note-x";
    const noteTitles = [
      makeNoteTitle({ id: "n-1", title: "Spec" }),
      makeNoteTitle({ id: "n-2", title: "Design" }),
    ];
    mockUsePagesSummary.mockReturnValue({
      data: [makePersonalSummary({ id: "p-1", title: "Leaked Personal" })],
      isLoading: false,
    });
    mockUseNoteTitleIndex.mockReturnValue({ data: noteTitles, isLoading: false });

    const { result } = renderHook(() => useWikiLinkCandidates(noteId));

    expect(result.current.pages).toEqual([
      { id: "n-1", title: "Spec", isDeleted: false },
      { id: "n-2", title: "Design", isDeleted: false },
    ]);
    expect(mockUseNoteTitleIndex).toHaveBeenCalledWith(noteId, { enabled: true });
    // ノートスコープでは個人ページ取得を抑止して IndexedDB アクセスを避ける。
    expect(mockUsePagesSummary).toHaveBeenCalledWith({ enabled: false });
    // 個人ページがスコープを越えて紛れ込まないこと。
    expect(result.current.pages.find((p) => p.id === "p-1")).toBeUndefined();
  });

  it("useNoteTitleIndex の data が undefined のとき、pages は空配列で返る（null 安全）", () => {
    mockUsePagesSummary.mockReturnValue({ data: undefined, isLoading: false });
    mockUseNoteTitleIndex.mockReturnValue({ data: undefined, isLoading: true });

    const { result } = renderHook(() => useWikiLinkCandidates("note-y"));

    expect(result.current.pages).toEqual([]);
    expect(result.current.isLoading).toBe(true);
  });
});
