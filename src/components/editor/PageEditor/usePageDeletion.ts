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
      deletePageMutation.mutate(currentPageId, {
        onSuccess: () => {
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
  }, [currentPageId, deletePageMutation, navigate, toast]);

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
  }, [navigate, currentPageId, title, content, deletePageMutation, shouldBlockSave, toast]);

  const handleConfirmDelete = useCallback(() => {
    if (currentPageId) {
      deletePageMutation.mutate(currentPageId);
      toast({
        title: `${deleteReason}を削除しました`,
      });
    }
    setDeleteConfirmOpen(false);
    navigate(pendingNavTarget);
    // 次回に備えてデフォルトに戻す / reset to default for next invocation
    setPendingNavTarget("/home");
  }, [currentPageId, deletePageMutation, deleteReason, navigate, pendingNavTarget, toast]);

  const handleCancelDelete = useCallback(() => {
    setDeleteConfirmOpen(false);
    setPendingNavTarget("/home");
  }, []);

  const handleOpenDuplicatePage = useCallback(
    (targetPageId: string) => {
      const targetPath = `/page/${targetPageId}`;

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

      // コンテンツがない場合はそのまま削除して遷移
      // Otherwise delete immediately and navigate to the existing page.
      deletePageMutation.mutate(currentPageId);
      toast({
        title: "重複するタイトルのため、ページを削除しました",
      });
      navigate(targetPath);
    },
    [currentPageId, content, deletePageMutation, navigate, toast],
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
