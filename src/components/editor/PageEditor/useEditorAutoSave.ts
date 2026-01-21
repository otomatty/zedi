import { useCallback, useRef, useEffect, useState } from "react";
import { extractWikiLinksFromContent } from "@/lib/wikiLinkUtils";

interface UseEditorAutoSaveOptions {
  pageId: string | null;
  debounceMs?: number;
  shouldBlockSave?: boolean;
  onSave: (updates: { title?: string; content: string }) => boolean | Promise<boolean>;
  onSaveContentOnly: (content: string) => boolean | Promise<boolean>;
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

      const runSave = async (saveAction: () => boolean | Promise<boolean>) => {
        setIsSaving(true);
        try {
          const didSave = await saveAction();
          if (didSave) {
            setLastSaved(Date.now());
            onSaveSuccess?.();
          }
        } catch (error) {
          console.error("Auto-save failed:", error);
        }
        try {
          await syncWikiLinksFromContent(newContent);
        } finally {
          setIsSaving(false);
        }
      };

      // タイトル重複時は保存をブロック
      if (forceBlockTitle || shouldBlockSave) {
        // コンテンツのみ保存（タイトルは元のまま）
        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current);
        }
        saveTimeoutRef.current = setTimeout(() => {
          void runSave(() => onSaveContentOnly(newContent));
        }, debounceMs);
        return;
      }

      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      saveTimeoutRef.current = setTimeout(() => {
        void runSave(() => onSave({ title: newTitle, content: newContent }));
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
