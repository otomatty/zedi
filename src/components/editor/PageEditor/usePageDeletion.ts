import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useDeletePage } from "@/hooks/usePageQueries";
import { useToast } from "@/hooks/use-toast";
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
  }, [
    navigate,
    currentPageId,
    title,
    content,
    deletePageMutation,
    shouldBlockSave,
    toast,
  ]);

  const handleConfirmDelete = useCallback(() => {
    if (currentPageId) {
      deletePageMutation.mutate(currentPageId);
      toast({
        title: `${deleteReason}を削除しました`,
      });
    }
    setDeleteConfirmOpen(false);
    navigate("/home");
  }, [currentPageId, deletePageMutation, deleteReason, navigate, toast]);

  const handleCancelDelete = useCallback(() => {
    setDeleteConfirmOpen(false);
  }, []);

  return {
    deleteConfirmOpen,
    deleteReason,
    setDeleteConfirmOpen,
    handleDelete,
    handleBack,
    handleConfirmDelete,
    handleCancelDelete,
  };
}
