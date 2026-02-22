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
  isSyncingLinks: boolean;
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
  const pendingRef = useRef<{
    title: string;
    content: string;
    contentOnly: boolean;
  } | null>(null);
  const [lastSaved, setLastSaved] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncingLinks, setIsSyncingLinks] = useState(false);

  // アンマウント時に未実行の保存があれば即実行（/home 戻りでタイトルが消えるのを防ぐ）
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
        const pending = pendingRef.current;
        if (pending && pageId) {
          const syncWikiLinksFromContent = async (contentToSync: string) => {
            const wikiLinks = extractWikiLinksFromContent(contentToSync);
            if (wikiLinks.length > 0) {
              await syncWikiLinks(pageId, wikiLinks);
            }
          };
          const saveAction = pending.contentOnly
            ? () => onSaveContentOnly(pending.content)
            : () => onSave({ title: pending.title, content: pending.content });
          void (async () => {
            try {
              await saveAction();
            } catch (e) {
              console.error("Auto-save flush on unmount failed:", e);
            }
            try {
              await syncWikiLinksFromContent(pending.content);
            } catch {
              // Ignore sync errors during unmount flush
            }
          })();
        }
      }
    };
  }, [pageId, onSave, onSaveContentOnly, syncWikiLinks]);

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
        setIsSyncingLinks(true);
        try {
          const didSave = await saveAction();
          try {
            await syncWikiLinksFromContent(newContent);
          } finally {
            setIsSyncingLinks(false);
          }
          if (didSave) {
            setLastSaved(Date.now());
            onSaveSuccess?.();
          }
        } catch (error) {
          console.error("Auto-save failed:", error);
          setIsSyncingLinks(false);
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
        pendingRef.current = { title: newTitle, content: newContent, contentOnly: true };
        saveTimeoutRef.current = setTimeout(() => {
          saveTimeoutRef.current = null;
          pendingRef.current = null;
          void runSave(() => onSaveContentOnly(newContent));
        }, debounceMs);
        return;
      }

      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      pendingRef.current = { title: newTitle, content: newContent, contentOnly: false };
      saveTimeoutRef.current = setTimeout(() => {
        saveTimeoutRef.current = null;
        pendingRef.current = null;
        void runSave(() => onSave({ title: newTitle, content: newContent }));
      }, debounceMs);
    },
    [pageId, debounceMs, shouldBlockSave, onSave, onSaveContentOnly, syncWikiLinks, onSaveSuccess]
  );

  return {
    saveChanges,
    lastSaved,
    isSaving,
    isSyncingLinks,
  };
}
