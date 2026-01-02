import { useCallback, useRef, useEffect, useState } from "react";
import { extractWikiLinksFromContent } from "@/lib/wikiLinkUtils";

interface UseEditorAutoSaveOptions {
  pageId: string | null;
  debounceMs?: number;
  shouldBlockSave?: boolean;
  onSave: (updates: { title?: string; content: string }) => void;
  onSaveContentOnly: (content: string) => void;
  syncWikiLinks: (pageId: string, wikiLinks: Array<{ title: string }>) => Promise<void>;
  onSaveSuccess?: () => void;
}

interface UseEditorAutoSaveReturn {
  saveChanges: (title: string, content: string, forceBlockTitle?: boolean) => void;
  lastSaved: number | null;
  isSaving: boolean;
}

/**
 * Hook to handle auto-save with debouncing and WikiLink synchronization
 */
export function useEditorAutoSave({
  pageId,
  debounceMs = 500,
  shouldBlockSave = false,
  onSave,
  onSaveContentOnly,
  syncWikiLinks,
  onSaveSuccess,
}: UseEditorAutoSaveOptions): UseEditorAutoSaveReturn {
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [lastSaved, setLastSaved] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  const saveChanges = useCallback(
    (newTitle: string, newContent: string, forceBlockTitle = false) => {
      if (!pageId) return;

      // WikiLinkを抽出して同期する関数
      const syncWikiLinksFromContent = async (contentToSync: string) => {
        const wikiLinks = extractWikiLinksFromContent(contentToSync);
        if (wikiLinks.length > 0) {
          await syncWikiLinks(pageId, wikiLinks);
        }
      };

      // タイトル重複時は保存をブロック
      if (forceBlockTitle || shouldBlockSave) {
        // コンテンツのみ保存（タイトルは元のまま）
        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current);
        }
        saveTimeoutRef.current = setTimeout(() => {
          setIsSaving(true);
          onSaveContentOnly(newContent);
          setLastSaved(Date.now());
          onSaveSuccess?.();
          // WikiLink同期（非同期だがawaitしない）
          syncWikiLinksFromContent(newContent).finally(() => {
            setIsSaving(false);
          });
        }, debounceMs);
        return;
      }

      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      saveTimeoutRef.current = setTimeout(() => {
        setIsSaving(true);
        onSave({ title: newTitle, content: newContent });
        setLastSaved(Date.now());
        onSaveSuccess?.();
        // WikiLink同期（非同期だがawaitしない）
        syncWikiLinksFromContent(newContent).finally(() => {
          setIsSaving(false);
        });
      }, debounceMs);
    },
    [pageId, debounceMs, shouldBlockSave, onSave, onSaveContentOnly, syncWikiLinks, onSaveSuccess]
  );

  return {
    saveChanges,
    lastSaved,
    isSaving,
  };
}
