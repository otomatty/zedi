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
 *
 */
export function usePageEditorAutoSaveWithMutation({
  currentPageId,
  shouldBlockSave,
  updateLastSaved,
}: UsePageEditorAutoSaveWithMutationOptions) {
  /**
   *
   */
  const queryClient = useQueryClient();
  /**
   *
   */
  const { userId } = useRepository();
  /**
   *
   */
  const updatePageMutation = useUpdatePage();
  /**
   *
   */
  const { syncLinks, syncTags } = useSyncWikiLinks();

  /**
   *
   */
  const {
    saveChanges,
    lastSaved: autoSaveLastSaved,
    isSyncingLinks,
  } = useEditorAutoSave({
    pageId: currentPageId,
    debounceMs: 500,
    shouldBlockSave,
    onSave: async (updates) => {
      if (!currentPageId) return false;
      /**
       *
       */
      const thumbnailUrl = extractFirstImage(updates.content) || undefined;
      /**
       *
       */
      const result = await updatePageMutation.mutateAsync({
        pageId: currentPageId,
        updates: { ...updates, thumbnailUrl },
      });
      return !result.skipped;
    },
    onSaveContentOnly: async (content) => {
      if (!currentPageId) return false;
      /**
       *
       */
      const thumbnailUrl = extractFirstImage(content) || undefined;
      /**
       *
       */
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

  return { saveChanges, lastSaved: autoSaveLastSaved, isSyncingLinks };
}
