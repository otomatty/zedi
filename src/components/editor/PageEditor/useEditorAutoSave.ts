import { useCallback, useRef, useEffect, useState } from "react";
import { extractWikiLinksFromContent } from "@/lib/wikiLinkUtils";
import { extractTagsFromContent, getUniqueTagNames } from "@/lib/tagUtils";

interface UseEditorAutoSaveOptions {
  pageId: string | null;
  debounceMs?: number;
  shouldBlockSave?: boolean;
  onSave: (updates: { title?: string; content: string }) => boolean | Promise<boolean>;
  onSaveContentOnly: (content: string) => boolean | Promise<boolean>;
  syncWikiLinks: (pageId: string, wikiLinks: Array<{ title: string }>) => Promise<void>;
  /**
   * オプショナル: タグ (`#name`) マークを `link_type='tag'` バケットに同期する
   * コールバック (issue #725 Phase 1)。未指定ならタグ同期はスキップする（旧コード
   * パス互換）。呼び出し側は `useSyncWikiLinks().syncTags` を渡す想定。
   *
   * Optional callback to sync tag marks into the `link_type='tag'` bucket
   * (issue #725 Phase 1). Omit to skip tag sync (legacy behavior). Callers
   * typically pass `useSyncWikiLinks().syncTags`.
   */
  syncTags?: (pageId: string, tags: Array<{ name: string }>) => Promise<void>;
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
  syncTags,
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
          const syncGraphFromContent = async (contentToSync: string) => {
            const wikiLinks = extractWikiLinksFromContent(contentToSync);
            // issue #725 Phase 1: wiki と tag は独立バケットなので、content に
            // 片方のマークしかなくても両方の同期を（空配列で）呼んで stale を掃除
            // したいところだが、unmount 時フラッシュは best-effort に留めるため
            // 存在する分だけ同期する（コスト最小）。
            // Best-effort on unmount: only sync buckets that actually have
            // marks. Stale cleanup for absent types happens on the next
            // full save when the editor remounts.
            if (wikiLinks.length > 0) {
              await syncWikiLinks(pageId, wikiLinks);
            }
            if (syncTags) {
              const tags = extractTagsFromContent(contentToSync);
              if (tags.length > 0) {
                const uniqueNames = getUniqueTagNames(tags);
                await syncTags(
                  pageId,
                  uniqueNames.map((name) => ({ name })),
                );
              }
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
              await syncGraphFromContent(pending.content);
            } catch {
              // Ignore sync errors during unmount flush
            }
          })();
        }
      }
    };
  }, [pageId, onSave, onSaveContentOnly, syncWikiLinks, syncTags]);

  const saveChanges = useCallback(
    (newTitle: string, newContent: string, forceBlockTitle = false) => {
      if (!pageId) return;

      /**
       * Extract WikiLinks + tags from the editor content and sync each to its
       * dedicated `link_type` bucket. Tag sync is only wired when `syncTags`
       * is provided (issue #725 Phase 1). To keep the wire traffic minimal,
       * we skip the call when the content carries no marks of that type —
       * existing behavior for WikiLinks, now mirrored for tags.
       *
       * WikiLink とタグを Tiptap コンテンツから抽出し、それぞれ独立の
       * `link_type` バケットへ同期する。タグ同期は `syncTags` が与えられた
       * ときだけ（issue #725 Phase 1）。どちらも Mark が無ければ呼ばないのは
       * 既存の WikiLink 仕様と同じ方針。
       */
      const syncGraphFromContent = async (contentToSync: string) => {
        const wikiLinks = extractWikiLinksFromContent(contentToSync);
        if (wikiLinks.length > 0) {
          await syncWikiLinks(pageId, wikiLinks);
        }
        if (syncTags) {
          const tags = extractTagsFromContent(contentToSync);
          if (tags.length > 0) {
            const uniqueNames = getUniqueTagNames(tags);
            await syncTags(
              pageId,
              uniqueNames.map((name) => ({ name })),
            );
          }
        }
      };

      const runSave = async (saveAction: () => boolean | Promise<boolean>) => {
        setIsSaving(true);
        setIsSyncingLinks(true);
        try {
          const didSave = await saveAction();
          try {
            await syncGraphFromContent(newContent);
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
    [
      pageId,
      debounceMs,
      shouldBlockSave,
      onSave,
      onSaveContentOnly,
      syncWikiLinks,
      syncTags,
      onSaveSuccess,
    ],
  );

  return {
    saveChanges,
    lastSaved,
    isSaving,
    isSyncingLinks,
  };
}
