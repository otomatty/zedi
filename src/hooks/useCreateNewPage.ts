import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useCreatePage } from "./usePageQueries";
import { useAddPageToNote } from "./useNoteQueries";
import { useToast } from "@zedi/ui";

/**
 * 新規ページを作成して対応するエディタへ遷移するフック。
 * `noteId` が指定された場合はノートに紐づけ、`/notes/:noteId/pages/:pageId` へ遷移する。
 *
 * Hook to create a new page and navigate to it. When `noteId` is provided the
 * page is linked to that note and the caller is routed into the note-scoped
 * path `/notes/:noteId/pages/:pageId`; otherwise the standalone `/pages/:id`
 * route is used. Centralizing the create-then-navigate flow avoids race
 * conditions between page creation and navigation.
 */
export function useCreateNewPage(options?: { noteId?: string }) {
  const noteId = options?.noteId;
  const navigate = useNavigate();
  const createPageMutation = useCreatePage();
  const addPageToNoteMutation = useAddPageToNote();
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
      if (noteId) {
        try {
          await addPageToNoteMutation.mutateAsync({ noteId, pageId: newPage.id });
        } catch (error) {
          // 紐づけ失敗時はスタンドアロンページとして表示。
          // Fallback: navigate to the standalone page when linking fails.
          console.error("Failed to attach page to note:", error);
          navigate(`/pages/${newPage.id}`);
          return;
        }
        navigate(`/notes/${noteId}/pages/${newPage.id}`);
        return;
      }
      navigate(`/pages/${newPage.id}`);
    } catch (error) {
      console.error("Failed to create page:", error);
      toast({
        title: "ページの作成に失敗しました",
        variant: "destructive",
      });
    }
  }, [addPageToNoteMutation, createPageMutation, navigate, noteId, toast]);

  return {
    createNewPage,
    isCreating: createPageMutation.isPending,
  };
}
