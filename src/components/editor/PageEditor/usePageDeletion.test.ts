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

const { mockNavigate, mockMutate, mockToast, mockCancelPendingSave } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockMutate: vi.fn(),
  mockToast: vi.fn(),
  mockCancelPendingSave: vi.fn(),
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
        cancelPendingSave: mockCancelPendingSave,
      }),
    );

    act(() => result.current.handleOpenDuplicatePage("target-id"));

    expect(mockMutate).not.toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith("/pages/target-id");
    expect(result.current.deleteConfirmOpen).toBe(false);
  });

  it("コンテンツが空なら即削除して遷移する / deletes immediately and navigates when content is empty", () => {
    const { result } = renderHook(() =>
      usePageDeletion({
        currentPageId: "dup-id",
        title: "foo",
        content: EMPTY_CONTENT,
        shouldBlockSave: true,
        cancelPendingSave: mockCancelPendingSave,
      }),
    );

    act(() => result.current.handleOpenDuplicatePage("target-id"));

    expect(mockMutate).toHaveBeenCalledWith("dup-id");
    expect(mockNavigate).toHaveBeenCalledWith("/pages/target-id");
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
        cancelPendingSave: mockCancelPendingSave,
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
        cancelPendingSave: mockCancelPendingSave,
      }),
    );

    act(() => result.current.handleOpenDuplicatePage("target-id"));
    act(() => result.current.handleConfirmDelete());

    expect(mockMutate).toHaveBeenCalledWith("dup-id");
    expect(mockToast).toHaveBeenCalledWith({
      title: "重複するタイトルのページを削除しました",
    });
    expect(mockNavigate).toHaveBeenCalledWith("/pages/target-id");
    expect(result.current.deleteConfirmOpen).toBe(false);
  });

  it("キャンセルすると削除も遷移も行わない / cancel leaves page intact and does not navigate", () => {
    const { result } = renderHook(() =>
      usePageDeletion({
        currentPageId: "dup-id",
        title: "foo",
        content: NON_EMPTY_CONTENT,
        shouldBlockSave: true,
        cancelPendingSave: mockCancelPendingSave,
      }),
    );

    act(() => result.current.handleOpenDuplicatePage("target-id"));
    act(() => result.current.handleCancelDelete());

    expect(mockMutate).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(result.current.deleteConfirmOpen).toBe(false);
  });

  it("キャンセル後に handleBack を使うと /notes/me へ戻る / pendingNavTarget resets so handleBack goes back to /notes/me", () => {
    const { result } = renderHook(() =>
      usePageDeletion({
        currentPageId: "dup-id",
        title: "foo",
        content: NON_EMPTY_CONTENT,
        shouldBlockSave: true,
        cancelPendingSave: mockCancelPendingSave,
      }),
    );

    act(() => result.current.handleOpenDuplicatePage("target-id"));
    act(() => result.current.handleCancelDelete());
    act(() => result.current.handleBack());
    // handleBack は hasContent のため確認ダイアログを開くだけ
    act(() => result.current.handleConfirmDelete());

    // 最終 navigate は /notes/me であるべき
    expect(mockNavigate).toHaveBeenLastCalledWith("/notes/me");
  });
});

/**
 * Issue #768: 削除前に保留中の autosave をキャンセルすることで、
 * unmount flush の `updatePage` が論理削除を上書きして「無題のページ」が
 * 復活するレースを防ぐ。各削除パスで `cancelPendingSave` が
 * `deletePageMutation.mutate` よりも先に呼ばれることを順序検証する。
 *
 * Issue #768: cancelling the pending autosave before deletion prevents the
 * unmount flush's `updatePage` from racing the soft delete and resurrecting
 * an "untitled page" row. These tests assert that for each deletion path
 * `cancelPendingSave` runs *before* `deletePageMutation.mutate`.
 */
describe("usePageDeletion - cancelPendingSave 順序 (issue #768)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("handleOpenDuplicatePage (空コンテンツ) は mutate より先に cancelPendingSave を呼ぶ", () => {
    const callOrder: string[] = [];
    mockCancelPendingSave.mockImplementation(() => {
      callOrder.push("cancel");
    });
    mockMutate.mockImplementation(() => {
      callOrder.push("mutate");
    });

    const { result } = renderHook(() =>
      usePageDeletion({
        currentPageId: "dup-id",
        title: "foo",
        content: EMPTY_CONTENT,
        shouldBlockSave: true,
        cancelPendingSave: mockCancelPendingSave,
      }),
    );

    act(() => result.current.handleOpenDuplicatePage("target-id"));

    expect(callOrder).toEqual(["cancel", "mutate"]);
  });

  it("handleBack (タイトル空・コンテンツ無し) は mutate より先に cancelPendingSave を呼ぶ", () => {
    const callOrder: string[] = [];
    mockCancelPendingSave.mockImplementation(() => {
      callOrder.push("cancel");
    });
    mockMutate.mockImplementation(() => {
      callOrder.push("mutate");
    });

    const { result } = renderHook(() =>
      usePageDeletion({
        currentPageId: "page-1",
        title: "",
        content: EMPTY_CONTENT,
        shouldBlockSave: false,
        cancelPendingSave: mockCancelPendingSave,
      }),
    );

    act(() => result.current.handleBack());

    expect(callOrder).toEqual(["cancel", "mutate"]);
    expect(mockToast).toHaveBeenCalledWith({
      title: "タイトルが未入力のため、ページを削除しました",
    });
  });

  it("handleConfirmDelete は mutate より先に cancelPendingSave を呼ぶ", () => {
    const callOrder: string[] = [];
    mockCancelPendingSave.mockImplementation(() => {
      callOrder.push("cancel");
    });
    mockMutate.mockImplementation(() => {
      callOrder.push("mutate");
    });

    const { result } = renderHook(() =>
      usePageDeletion({
        currentPageId: "page-1",
        title: "",
        content: NON_EMPTY_CONTENT,
        shouldBlockSave: false,
        cancelPendingSave: mockCancelPendingSave,
      }),
    );

    // 確認ダイアログを開いてから confirm
    act(() => result.current.handleBack());
    act(() => result.current.handleConfirmDelete());

    expect(callOrder).toEqual(["cancel", "mutate"]);
  });

  it("handleDelete (明示削除) は mutate → onSuccess の順で cancelPendingSave を呼ぶ (Codex P2: 失敗時の保留保存を保護)", () => {
    // Codex P2 レビューの観点: `handleDelete` は他のハンドラと違い `onError`
    // でエディタに残るため、mutate 前に cancelPendingSave すると失敗時に
    // 保留中の編集が落ちる。`onSuccess` の中でだけキャンセルする実装を
    // 順序検証する。
    //
    // Codex P2: unlike other deletion paths, `handleDelete`'s `onError`
    // keeps the user on the editor, so cancelling before the mutation
    // would silently drop their queued autosave. Verify cancellation
    // only happens inside `onSuccess`.
    const callOrder: string[] = [];
    mockCancelPendingSave.mockImplementation(() => {
      callOrder.push("cancel");
    });
    mockMutate.mockImplementation((_id: string, opts?: { onSuccess?: () => void }) => {
      callOrder.push("mutate");
      opts?.onSuccess?.();
    });

    const { result } = renderHook(() =>
      usePageDeletion({
        currentPageId: "page-1",
        title: "foo",
        content: NON_EMPTY_CONTENT,
        shouldBlockSave: false,
        cancelPendingSave: mockCancelPendingSave,
      }),
    );

    act(() => result.current.handleDelete());

    expect(callOrder).toEqual(["mutate", "cancel"]);
    expect(mockNavigate).toHaveBeenCalledWith("/notes/me");
  });

  it("handleDelete: 削除失敗時は cancelPendingSave を呼ばず保留保存を保持する (Codex P2)", () => {
    // 失敗ブランチではエディタに残るので、保留中の autosave は触らない。
    // On the failure branch the user stays on the editor, so the pending
    // autosave must remain intact.
    mockMutate.mockImplementation((_id: string, opts?: { onError?: (e: Error) => void }) => {
      opts?.onError?.(new Error("network down"));
    });

    const { result } = renderHook(() =>
      usePageDeletion({
        currentPageId: "page-1",
        title: "foo",
        content: NON_EMPTY_CONTENT,
        shouldBlockSave: false,
        cancelPendingSave: mockCancelPendingSave,
      }),
    );

    act(() => result.current.handleDelete());

    expect(mockCancelPendingSave).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith({
      title: "削除に失敗しました",
      variant: "destructive",
    });
  });

  it("削除に至らないキャンセルパス (handleCancelDelete) では cancelPendingSave を呼ばない", () => {
    const { result } = renderHook(() =>
      usePageDeletion({
        currentPageId: "page-1",
        title: "",
        content: NON_EMPTY_CONTENT,
        shouldBlockSave: false,
        cancelPendingSave: mockCancelPendingSave,
      }),
    );

    act(() => result.current.handleBack()); // opens dialog only
    act(() => result.current.handleCancelDelete());

    expect(mockCancelPendingSave).not.toHaveBeenCalled();
    expect(mockMutate).not.toHaveBeenCalled();
  });
});
