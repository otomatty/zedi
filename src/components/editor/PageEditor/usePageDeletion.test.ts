import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePageDeletion } from "./usePageDeletion";

/**
 * `usePageDeletion` の振る舞い、特に重複タイトル時の「開く」ボタンハンドラ
 * (`handleOpenDuplicatePage`) をカバーするテスト。
 *
 * Tests for `usePageDeletion`, focused on the "Open" button handler
 * (`handleOpenDuplicatePage`) used by the duplicate-title warning.
 */

const { mockNavigate, mockMutate, mockToast } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockMutate: vi.fn(),
  mockToast: vi.fn(),
}));

vi.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock("@/hooks/usePageQueries", () => ({
  useDeletePage: () => ({ mutate: mockMutate }),
}));

vi.mock("@zedi/ui", () => ({
  useToast: () => ({ toast: mockToast }),
}));

// 空ではないコンテンツを表す JSON / JSON representing non-empty Tiptap content.
const NON_EMPTY_CONTENT = JSON.stringify({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: "hello" }] }],
});

// 空の Tiptap ドキュメント / Empty Tiptap document.
const EMPTY_CONTENT = JSON.stringify({
  type: "doc",
  content: [{ type: "paragraph" }],
});

describe("usePageDeletion.handleOpenDuplicatePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("現在のページが未作成なら削除せず遷移する / navigates without deleting when currentPageId is null", () => {
    const { result } = renderHook(() =>
      usePageDeletion({
        currentPageId: null,
        title: "foo",
        content: NON_EMPTY_CONTENT,
        shouldBlockSave: true,
      }),
    );

    act(() => result.current.handleOpenDuplicatePage("target-id"));

    expect(mockMutate).not.toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith("/page/target-id");
    expect(result.current.deleteConfirmOpen).toBe(false);
  });

  it("コンテンツが空なら即削除して遷移する / deletes immediately and navigates when content is empty", () => {
    const { result } = renderHook(() =>
      usePageDeletion({
        currentPageId: "dup-id",
        title: "foo",
        content: EMPTY_CONTENT,
        shouldBlockSave: true,
      }),
    );

    act(() => result.current.handleOpenDuplicatePage("target-id"));

    expect(mockMutate).toHaveBeenCalledWith("dup-id");
    expect(mockNavigate).toHaveBeenCalledWith("/page/target-id");
    expect(mockToast).toHaveBeenCalledWith({
      title: "重複するタイトルのため、ページを削除しました",
    });
    expect(result.current.deleteConfirmOpen).toBe(false);
  });

  it("コンテンツがあれば確認ダイアログを開き、削除・遷移はまだ行わない / opens confirm dialog without deleting or navigating when content exists", () => {
    const { result } = renderHook(() =>
      usePageDeletion({
        currentPageId: "dup-id",
        title: "foo",
        content: NON_EMPTY_CONTENT,
        shouldBlockSave: true,
      }),
    );

    act(() => result.current.handleOpenDuplicatePage("target-id"));

    expect(mockMutate).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(result.current.deleteConfirmOpen).toBe(true);
    expect(result.current.deleteReason).toBe("重複するタイトルのページ");
  });

  it("確認後は削除して既存ページへ遷移する / after confirm, deletes and navigates to the target page", () => {
    const { result } = renderHook(() =>
      usePageDeletion({
        currentPageId: "dup-id",
        title: "foo",
        content: NON_EMPTY_CONTENT,
        shouldBlockSave: true,
      }),
    );

    act(() => result.current.handleOpenDuplicatePage("target-id"));
    act(() => result.current.handleConfirmDelete());

    expect(mockMutate).toHaveBeenCalledWith("dup-id");
    expect(mockToast).toHaveBeenCalledWith({
      title: "重複するタイトルのページを削除しました",
    });
    expect(mockNavigate).toHaveBeenCalledWith("/page/target-id");
    expect(result.current.deleteConfirmOpen).toBe(false);
  });

  it("キャンセルすると削除も遷移も行わない / cancel leaves page intact and does not navigate", () => {
    const { result } = renderHook(() =>
      usePageDeletion({
        currentPageId: "dup-id",
        title: "foo",
        content: NON_EMPTY_CONTENT,
        shouldBlockSave: true,
      }),
    );

    act(() => result.current.handleOpenDuplicatePage("target-id"));
    act(() => result.current.handleCancelDelete());

    expect(mockMutate).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(result.current.deleteConfirmOpen).toBe(false);
  });

  it("キャンセル後に handleBack を使うと /home へ戻る / pendingNavTarget resets so handleBack goes back to /home", () => {
    const { result } = renderHook(() =>
      usePageDeletion({
        currentPageId: "dup-id",
        title: "foo",
        content: NON_EMPTY_CONTENT,
        shouldBlockSave: true,
      }),
    );

    act(() => result.current.handleOpenDuplicatePage("target-id"));
    act(() => result.current.handleCancelDelete());
    act(() => result.current.handleBack());
    // handleBack は hasContent のため確認ダイアログを開くだけ
    act(() => result.current.handleConfirmDelete());

    // 最終 navigate は /home であるべき
    expect(mockNavigate).toHaveBeenLastCalledWith("/home");
  });
});
