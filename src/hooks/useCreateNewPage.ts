import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useCreatePage } from "./usePageQueries";
import { useAddPageToNote } from "./useNoteQueries";
import { useToast } from "@zedi/ui";

/**
 * 新規ページを作成して対応するエディタへ遷移するフック。`noteId` が指定された
 * 場合はノートに紐づけてから `/notes/:noteId/:pageId` へ遷移する。未指定時は
 * サーバが返す `newPage.noteId`（呼び出し元のデフォルトノート）配下の
 * `/notes/:noteId/:pageId` に遷移する（Issue #889 Phase 3 で `/pages/:id`
 * を廃止）。紐づけ失敗時は toast を出して中断する。
 *
 * Hook to create a new page and navigate to it. With `noteId` provided the
 * page is attached to that note and navigation lands on
 * `/notes/:noteId/:pageId`. Without `noteId` we navigate using the page's
 * own `noteId` (the caller's default note returned by the API) since Issue
 * #889 Phase 3 retired the standalone `/pages/:id` route. Linking failures
 * surface a toast instead of falling back to a misleading standalone view.
 */
export function useCreateNewPage(options?: { noteId?: string }) {
  const noteId = options?.noteId;
  const navigate = useNavigate();
  const createPageMutation = useCreatePage();
  const addPageToNoteMutation = useAddPageToNote();
  const { toast } = useToast();

  // ページ作成〜ノート紐づけの一連の処理全体を「作成中」として扱う。
  // どちらかが進行中の間は FAB を再タップしても新規作成を開始しないことで、
  // 低速回線でノート配下での重複ページ作成が発生するのを防ぐ。
  //
  // Treat the whole create-then-link sequence as busy. Guarding on either
  // mutation being in flight prevents a second tap from starting another
  // create flow (which would produce duplicate blank pages under a note on
  // slow networks).
  const isCreating = createPageMutation.isPending || addPageToNoteMutation.isPending;

  const createNewPage = useCallback(async () => {
    if (isCreating) {
      return;
    }

    try {
      const newPage = await createPageMutation.mutateAsync({
        title: "",
        content: "",
      });
      if (noteId && noteId !== newPage.noteId) {
        try {
          await addPageToNoteMutation.mutateAsync({ noteId, pageId: newPage.id });
        } catch (error) {
          // ページ作成自体は成功しているのでデフォルトノート配下にフォールバック遷移する。
          // 「作成失敗」と誤読されないよう、トーストはノートへの追加に失敗した旨を明示する。
          // The page itself was created — only the re-link failed. Fall back
          // to the page's default-note URL so the user isn't stranded, and
          // surface the actual failure (attaching to the requested note)
          // instead of a misleading "create failed" message.
          console.error("Failed to attach page to note:", error);
          toast({
            title: "指定ノートへの追加に失敗しました",
            variant: "destructive",
          });
          navigate(`/notes/${newPage.noteId}/${newPage.id}`);
          return;
        }
        navigate(`/notes/${noteId}/${newPage.id}`);
        return;
      }
      navigate(`/notes/${newPage.noteId}/${newPage.id}`);
    } catch (error) {
      console.error("Failed to create page:", error);
      toast({
        title: "ページの作成に失敗しました",
        variant: "destructive",
      });
    }
  }, [addPageToNoteMutation, createPageMutation, isCreating, navigate, noteId, toast]);

  return {
    createNewPage,
    isCreating,
  };
}
