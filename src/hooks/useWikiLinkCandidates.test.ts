import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useWikiLinkCandidates } from "./useWikiLinkCandidates";
import type { PageSummary } from "@/types/page";

// usePagesSummary と useNotePages は、個人 / ノートスコープに応じた候補
// リストの出し分けの仕様を検証するため、返す内容を固定でモックする。
// Mock `usePagesSummary` / `useNotePages` so we can verify that the scope
// chosen by `useWikiLinkCandidates` selects the correct backing source.
const mockUsePagesSummary = vi.fn();
const mockUseNotePages = vi.fn();

vi.mock("@/hooks/usePageQueries", () => ({
  usePagesSummary: (...args: unknown[]) => mockUsePagesSummary(...args),
}));

vi.mock("@/hooks/useNoteQueries", () => ({
  useNotePages: (...args: unknown[]) => mockUseNotePages(...args),
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

function makeNoteSummary(noteId: string, overrides: Partial<PageSummary> = {}): PageSummary {
  return {
    id: overrides.id ?? "n-1",
    ownerUserId: overrides.ownerUserId ?? "user-1",
    noteId,
    title: overrides.title ?? "Note Page",
    contentPreview: undefined,
    thumbnailUrl: undefined,
    sourceUrl: undefined,
    createdAt: 0,
    updatedAt: 0,
    isDeleted: overrides.isDeleted ?? false,
  };
}

beforeEach(() => {
  mockUsePagesSummary.mockReset();
  mockUseNotePages.mockReset();
});

describe("useWikiLinkCandidates", () => {
  it("pageNoteId が null のとき、個人ページサマリを返し、useNotePages は無効化して呼ばれる（enabled=false）", () => {
    const personal = [makePersonalSummary({ id: "p-1", title: "Alpha" })];
    mockUsePagesSummary.mockReturnValue({ data: personal, isLoading: false });
    mockUseNotePages.mockReturnValue({ data: undefined, isLoading: false });

    const { result } = renderHook(() => useWikiLinkCandidates(null));

    expect(result.current.pages).toEqual([{ id: "p-1", title: "Alpha", isDeleted: false }]);
    // 個人スコープでは個人ページ取得を有効化する。
    expect(mockUsePagesSummary).toHaveBeenCalledWith({ enabled: true });
    // useNotePages は noteId が空 + enabled=false で呼ばれる（実データは取りに行かない）。
    expect(mockUseNotePages).toHaveBeenCalledWith("", undefined, false);
  });

  it("pageNoteId 指定時、ノートのページサマリを返し、個人ページは候補に入らない", () => {
    const noteId = "note-x";
    const notePages = [
      makeNoteSummary(noteId, { id: "n-1", title: "Spec" }),
      makeNoteSummary(noteId, { id: "n-2", title: "Design" }),
    ];
    mockUsePagesSummary.mockReturnValue({
      data: [makePersonalSummary({ id: "p-1", title: "Leaked Personal" })],
      isLoading: false,
    });
    mockUseNotePages.mockReturnValue({ data: notePages, isLoading: false });

    const { result } = renderHook(() => useWikiLinkCandidates(noteId));

    expect(result.current.pages).toEqual([
      { id: "n-1", title: "Spec", isDeleted: false },
      { id: "n-2", title: "Design", isDeleted: false },
    ]);
    expect(mockUseNotePages).toHaveBeenCalledWith(noteId, undefined, true);
    // ノートスコープでは個人ページ取得を抑止して IndexedDB アクセスを避ける。
    expect(mockUsePagesSummary).toHaveBeenCalledWith({ enabled: false });
    // 個人ページがスコープを越えて紛れ込まないこと。
    expect(result.current.pages.find((p) => p.id === "p-1")).toBeUndefined();
  });

  it("useNotePages の data が undefined のとき、pages は空配列で返る（null 安全）", () => {
    mockUsePagesSummary.mockReturnValue({ data: undefined, isLoading: false });
    mockUseNotePages.mockReturnValue({ data: undefined, isLoading: true });

    const { result } = renderHook(() => useWikiLinkCandidates("note-y"));

    expect(result.current.pages).toEqual([]);
    expect(result.current.isLoading).toBe(true);
  });
});
