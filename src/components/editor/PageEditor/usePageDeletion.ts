import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useDeletePage } from "@/hooks/usePageQueries";
import { useToast } from "@zedi/ui";
import { isContentNotEmpty } from "@/lib/contentUtils";

interface UsePageDeletionOptions {
  currentPageId: string | null;
  title: string;
  content: string;
  shouldBlockSave: boolean;
  /**
   * 削除発火直前に呼ぶ、保留中 autosave のキャンセル関数。
   * `useEditorAutoSave.cancelPendingSave` を渡す想定。issue #768 のレース
   * （unmount flush の `updatePage` が論理削除を上書きして「無題のページ」
   * が復活する）を防ぐために必須。
   *
   * Cancel any pending autosave before firing a delete. Pass
   * `useEditorAutoSave.cancelPendingSave`. Required to prevent the issue
   * #768 race where the unmount flush's `updatePage` overwrites the soft
   * delete and resurrects an "untitled page" row.
   */
  cancelPendingSave: () => void;
}

interface UsePageDeletionReturn {
  deleteConfirmOpen: boolean;
  deleteReason: string;
  setDeleteConfirmOpen: (open: boolean) => void;
  handleDelete: () => void;
  handleBack: () => void;
  handleConfirmDelete: () => void;
  handleCancelDelete: () => void;
  /**
   * 重複警告の「開く」ボタン押下時のハンドラ。
   * 現在編集中のページ（重複側）を削除してから既存ページへ遷移する。
   * コンテンツがある場合は確認ダイアログを表示する。
   *
   * Handler for the "Open" button on the duplicate-title warning.
   * Deletes the currently editing (duplicate) page before navigating to the existing one.
   * Shows a confirmation dialog when the page has content.
   */
  handleOpenDuplicatePage: (targetPageId: string) => void;
}

/**
 * Hook for page deletion logic
 * Handles delete confirmation, back navigation with cleanup
 */
export function usePageDeletion({
  currentPageId,
  title,
  content,
  shouldBlockSave,
  cancelPendingSave,
}: UsePageDeletionOptions): UsePageDeletionReturn {
  const navigate = useNavigate();
  const { toast } = useToast();
  const deletePageMutation = useDeletePage();

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteReason, setDeleteReason] = useState<string>("");
  // 確認ダイアログ確定後の遷移先。デフォルトは /home。
  // Navigation target to use after the confirmation dialog resolves. Defaults to /home.
  const [pendingNavTarget, setPendingNavTarget] = useState<string>("/home");

  const handleDelete = useCallback(() => {
    if (currentPageId) {
      // issue #768 + Codex P2: 他のハンドラと違い、`handleDelete` の `onError`
      // ではユーザーがエディタに残るため、削除失敗時に保留中の autosave を
      // 落とすと最近の編集が失われる。そのため `cancelPendingSave` は削除が
      // 成功して `/home` に遷移する直前（`onSuccess` 内）でのみ呼ぶ。
      //
      // issue #768 + Codex P2: unlike the other handlers, `handleDelete`'s
      // `onError` keeps the user on the editor, so cancelling the pending
      // autosave before the mutation would silently drop their queued edits
      // on a failed delete. Cancel only inside `onSuccess`, just before
      // navigating away (and the unmount flush).
      deletePageMutation.mutate(currentPageId, {
        onSuccess: () => {
          cancelPendingSave();
          toast({
            title: "ページを削除しました",
          });
          navigate("/home");
        },
        onError: () => {
          toast({
            title: "削除に失敗しました",
            variant: "destructive",
          });
        },
      });
    }
  }, [currentPageId, deletePageMutation, navigate, toast, cancelPendingSave]);

  const handleBack = useCallback(() => {
    const hasContent = isContentNotEmpty(content);
    const isTitleEmptyOrUntitled = !title.trim();

    // 削除が必要なケースを判定
    // 1. タイトル重複警告がある場合
    // 2. タイトルが空（無題）の場合
    const shouldDeleteForDuplicate = currentPageId && shouldBlockSave;
    const shouldDeleteForEmptyTitle = currentPageId && isTitleEmptyOrUntitled;

    if (shouldDeleteForDuplicate || shouldDeleteForEmptyTitle) {
      // コンテンツがある場合は確認ダイアログを表示
      if (hasContent) {
        if (shouldDeleteForDuplicate) {
          setDeleteReason("重複するタイトルのページ");
        } else {
          setDeleteReason("タイトルが未入力のページ");
        }
        // 戻る経由なので遷移先はホーム
        setPendingNavTarget("/home");
        setDeleteConfirmOpen(true);
        return;
      }

      // issue #768: 削除発火前に保留中の autosave をキャンセル。
      // issue #768: cancel any pending autosave before firing the delete.
      cancelPendingSave();
      // コンテンツがない場合はそのまま削除
      deletePageMutation.mutate(currentPageId);
      if (shouldDeleteForDuplicate) {
        toast({
          title: "重複するタイトルのため、ページを削除しました",
        });
      } else {
        toast({
          title: "タイトルが未入力のため、ページを削除しました",
        });
      }
    }
    navigate("/home");
  }, [
    navigate,
    currentPageId,
    title,
    content,
    deletePageMutation,
    shouldBlockSave,
    toast,
    cancelPendingSave,
  ]);

  const handleConfirmDelete = useCallback(() => {
    if (currentPageId) {
      // issue #768: 削除発火前に保留中の autosave をキャンセル。
      // issue #768: cancel any pending autosave before firing the delete.
      cancelPendingSave();
      deletePageMutation.mutate(currentPageId);
      toast({
        title: `${deleteReason}を削除しました`,
      });
    }
    setDeleteConfirmOpen(false);
    navigate(pendingNavTarget);
    // 次回に備えてデフォルトに戻す / reset to default for next invocation
    setPendingNavTarget("/home");
  }, [
    currentPageId,
    deletePageMutation,
    deleteReason,
    navigate,
    pendingNavTarget,
    toast,
    cancelPendingSave,
  ]);

  const handleCancelDelete = useCallback(() => {
    setDeleteConfirmOpen(false);
    setPendingNavTarget("/home");
  }, []);

  const handleOpenDuplicatePage = useCallback(
    (targetPageId: string) => {
      const targetPath = `/pages/${targetPageId}`;

      // 現在のページがまだ作成されていない場合は削除不要でそのまま遷移
      // No current page persisted yet — just navigate.
      if (!currentPageId) {
        navigate(targetPath);
        return;
      }

      const hasContent = isContentNotEmpty(content);

      // コンテンツがある場合は確認ダイアログを表示
      // Ask for confirmation when the duplicate page has content.
      if (hasContent) {
        setDeleteReason("重複するタイトルのページ");
        setPendingNavTarget(targetPath);
        setDeleteConfirmOpen(true);
        return;
      }

      // issue #768: 削除発火前に保留中の autosave をキャンセル。
      // issue #768: cancel any pending autosave before firing the delete.
      cancelPendingSave();
      // コンテンツがない場合はそのまま削除して遷移
      // Otherwise delete immediately and navigate to the existing page.
      deletePageMutation.mutate(currentPageId);
      toast({
        title: "重複するタイトルのため、ページを削除しました",
      });
      navigate(targetPath);
    },
    [currentPageId, content, deletePageMutation, navigate, toast, cancelPendingSave],
  );

  return {
    deleteConfirmOpen,
    deleteReason,
    setDeleteConfirmOpen,
    handleDelete,
    handleBack,
    handleConfirmDelete,
    handleCancelDelete,
    handleOpenDuplicatePage,
  };
}
