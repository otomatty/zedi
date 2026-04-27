import { useQueryClient } from "@tanstack/react-query";
import { useEditorAutoSave } from "./useEditorAutoSave";
import { useUpdatePage, useSyncWikiLinks, useRepository, pageKeys } from "@/hooks/usePageQueries";
import { extractFirstImage } from "@/lib/contentUtils";

interface UsePageEditorAutoSaveWithMutationOptions {
  currentPageId: string | null;
  shouldBlockSave: boolean;
  updateLastSaved: (timestamp: number) => void;
}

/**
 * ページエディタの autosave を `useUpdatePage` mutation と `useSyncWikiLinks`
 * の WikiLink / タグ同期に配線するフック。保存成功時にサムネイル抽出と
 * `linkedPages` クエリの invalidate も行う（issue #725 Phase 1 でタグ同期を追加）。
 *
 * Hook that wires the page editor's autosave pipeline to the `useUpdatePage`
 * mutation and `useSyncWikiLinks` (WikiLink + tag sync). It also extracts the
 * first image for thumbnail updates and invalidates the `linkedPages` cache on
 * save. Tag sync was added by issue #725 Phase 1.
 */
export function usePageEditorAutoSaveWithMutation({
  currentPageId,
  shouldBlockSave,
  updateLastSaved,
}: UsePageEditorAutoSaveWithMutationOptions) {
  const queryClient = useQueryClient();
  const { userId } = useRepository();
  const updatePageMutation = useUpdatePage();
  const { syncLinks, syncTags } = useSyncWikiLinks();

  const {
    saveChanges,
    cancelPendingSave,
    lastSaved: autoSaveLastSaved,
    isSyncingLinks,
  } = useEditorAutoSave({
    pageId: currentPageId,
    debounceMs: 500,
    shouldBlockSave,
    onSave: async (updates) => {
      if (!currentPageId) return false;
      const thumbnailUrl = extractFirstImage(updates.content) || undefined;
      const result = await updatePageMutation.mutateAsync({
        pageId: currentPageId,
        updates: { ...updates, thumbnailUrl },
      });
      return !result.skipped;
    },
    onSaveContentOnly: async (content) => {
      if (!currentPageId) return false;
      const thumbnailUrl = extractFirstImage(content) || undefined;
      const result = await updatePageMutation.mutateAsync({
        pageId: currentPageId,
        updates: { content, thumbnailUrl },
      });
      return !result.skipped;
    },
    syncWikiLinks: syncLinks,
    syncTags,
    onSaveSuccess: () => {
      updateLastSaved(Date.now());
      if (currentPageId && userId) {
        queryClient.invalidateQueries({
          queryKey: [...pageKeys.all, "linkedPages", userId, currentPageId],
        });
      }
    },
  });

  return { saveChanges, cancelPendingSave, lastSaved: autoSaveLastSaved, isSyncingLinks };
}
