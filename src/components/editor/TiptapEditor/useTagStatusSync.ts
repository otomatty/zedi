import { useEffect, useMemo, useRef } from "react";
import { Editor } from "@tiptap/react";
import { extractTagsFromContent, getUniqueTagNames } from "@/lib/tagUtils";
import { useWikiLinkExistsChecker } from "@/hooks/usePageQueries";
import { useNotePages } from "@/hooks/useNoteQueries";

interface UseTagStatusSyncOptions {
  editor: Editor | null;
  content: string;
  pageId: string | undefined;
  onChange: (content: string) => void;
  /** true の間は同期をスキップ（生成中のちらつき防止）。 / Skip while true. */
  skipSync?: boolean;
  /**
   * 編集中ページの noteId。`null`（既定）は個人ページ、文字列値なら
   * ノートネイティブページ。存在確認のスコープを切り替える（Issue #713 Phase 4）。
   *
   * Owning note ID; `null` (default) scopes existence checks to personal
   * pages, a string scopes to the given note's pages.
   */
  pageNoteId?: string | null;
}

/**
 * Tag (`#name`) Mark 用の `exists` / `referenced` 属性同期フック
 * (issue #725 Phase 1)。`useWikiLinkStatusSync` と同じ契約で動き、判定ロジック
 * （`useWikiLinkExistsChecker`）もそのまま流用する。`name` は WikiLink の
 * `title` と同じ名前空間で解決する。
 *
 * Keep tag marks' `exists` / `referenced` attributes in sync with the page
 * graph. Mirrors `useWikiLinkStatusSync` but targets `tag` marks and reads
 * `attrs.name` instead of `attrs.title`. The resolution namespace is shared
 * with WikiLinks, since tags are essentially page references by title.
 */
export function useTagStatusSync({
  editor,
  content,
  pageId,
  onChange,
  skipSync = false,
  pageNoteId = null,
}: UseTagStatusSyncOptions): void {
  const notePagesQuery = useNotePages(pageNoteId ?? "", undefined, Boolean(pageNoteId));
  const { checkExistence } = useWikiLinkExistsChecker({
    pageNoteId,
    notePages: pageNoteId ? notePagesQuery.data : undefined,
  });

  const notePagesData = notePagesQuery.data;
  const pageScopeSignature = useMemo(() => {
    if (pageNoteId === null) return "personal";
    if (notePagesData === undefined) return `note:${pageNoteId}:loading`;
    return `note:${pageNoteId}:${notePagesData
      .map((page) => `${page.id}:${page.title.trim().toLowerCase()}`)
      .sort()
      .join("|")}`;
  }, [pageNoteId, notePagesData]);

  const lastCheckedRef = useRef<{
    pageId: string | null;
    tagCount: number;
    pageScopeSignature: string | null;
  }>({ pageId: null, tagCount: 0, pageScopeSignature: null });

  useEffect(() => {
    if (skipSync || !editor || !content || !pageId) {
      return;
    }

    const currentTags = extractTagsFromContent(content);
    const currentCount = currentTags.length;

    const isNewPage = lastCheckedRef.current.pageId !== pageId;
    const hasMoreTags = currentCount > lastCheckedRef.current.tagCount;
    const hasScopeChanged = lastCheckedRef.current.pageScopeSignature !== pageScopeSignature;

    if (!isNewPage && !hasMoreTags && !hasScopeChanged) {
      return;
    }

    const updateTagStatus = async () => {
      if (currentTags.length === 0) {
        lastCheckedRef.current = { pageId, tagCount: 0, pageScopeSignature };
        return;
      }

      const names = getUniqueTagNames(currentTags);
      const { pageTitles, referencedTitles } = await checkExistence(names, pageId);

      if (pageTitles.size === 0 && names.length > 0) {
        return;
      }

      const updates = collectTagUpdates(editor, pageTitles, referencedTitles);

      lastCheckedRef.current = { pageId, tagCount: currentCount, pageScopeSignature };

      if (updates.length > 0) {
        applyTagUpdates(editor, updates);
        const json = JSON.stringify(editor.getJSON());
        onChange(json);
      }
    };

    const timer = setTimeout(updateTagStatus, 150);
    return () => clearTimeout(timer);
  }, [skipSync, editor, content, checkExistence, pageId, onChange, pageScopeSignature]);
}

interface TagUpdate {
  from: number;
  to: number;
  exists: boolean;
  referenced: boolean;
}

/**
 * 更新が必要な tag Mark を収集する。
 * Collect tag marks whose `exists` / `referenced` would change.
 */
function collectTagUpdates(
  editor: Editor,
  pageTitles: Set<string>,
  referencedTitles: Set<string>,
): TagUpdate[] {
  const updates: TagUpdate[] = [];
  const { doc } = editor.state;

  doc.descendants((node, pos) => {
    if (!node.isText || node.marks.length === 0) return;

    node.marks.forEach((mark) => {
      if (mark.type.name !== "tag") return;

      const rawName = mark.attrs.name;
      if (typeof rawName !== "string") return;
      const normalized = rawName.toLowerCase().trim();
      const newExists = pageTitles.has(normalized);
      const newReferenced = referencedTitles.has(normalized);

      if (mark.attrs.exists !== newExists || mark.attrs.referenced !== newReferenced) {
        updates.push({
          from: pos,
          to: pos + node.nodeSize,
          exists: newExists,
          referenced: newReferenced,
        });
      }
    });
  });

  return updates;
}

/**
 * tag Mark の属性更新を適用する。
 * Apply `exists` / `referenced` attribute updates to tag marks in the editor.
 */
function applyTagUpdates(editor: Editor, updates: TagUpdate[]): void {
  for (const update of updates.reverse()) {
    editor
      .chain()
      .setTextSelection({ from: update.from, to: update.to })
      .extendMarkRange("tag")
      .updateAttributes("tag", {
        exists: update.exists,
        referenced: update.referenced,
      })
      .run();
  }
}
