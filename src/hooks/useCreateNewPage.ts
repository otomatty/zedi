import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useCreatePage } from "./usePageQueries";
import { useToast } from "./use-toast";

/**
 * Hook to create a new page and navigate to it
 * This centralizes page creation logic and ensures pages are created
 * before navigation, avoiding race conditions.
 */
export function useCreateNewPage() {
  const navigate = useNavigate();
  const createPageMutation = useCreatePage();
  const { toast } = useToast();

  const createNewPage = useCallback(async () => {
    // 既に作成中の場合はスキップ
    if (createPageMutation.isPending) {
      return;
    }

    try {
      const newPage = await createPageMutation.mutateAsync({
        title: "",
        content: "",
      });
      navigate(`/page/${newPage.id}`);
    } catch (error) {
      console.error("Failed to create page:", error);
      toast({
        title: "ページの作成に失敗しました",
        variant: "destructive",
      });
    }
  }, [createPageMutation, navigate, toast]);

  return {
    createNewPage,
    isCreating: createPageMutation.isPending,
  };
}
