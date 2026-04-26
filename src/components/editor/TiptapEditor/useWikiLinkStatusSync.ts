import { useEffect, useMemo, useRef } from "react";
import { Editor } from "@tiptap/react";
import { extractWikiLinksFromContent, getUniqueWikiLinkTitles } from "@/lib/wikiLinkUtils";
import { useWikiLinkExistsChecker } from "@/hooks/usePageQueries";
import { useNotePages } from "@/hooks/useNoteQueries";

interface UseWikiLinkStatusSyncOptions {
  editor: Editor | null;
  content: string;
  pageId: string | undefined;
  onChange: (content: string) => void;
  /** true の間は同期をスキップ（Wiki生成中のリンクスタイルちらつき防止） */
  skipSync?: boolean;
  /**
   * 編集中ページの noteId。`null`（既定）は個人ページ、文字列値なら
   * ノートネイティブページ。存在確認のスコープを切り替えるために使う。
   * Issue #713 Phase 4。
   *
   * Owning note ID of the page being edited. `null` (default) scopes
   * existence checks to personal pages; a string scopes them to the given
   * note's pages (fetched via `useNotePages`). See issue #713 Phase 4.
   */
  pageNoteId?: string | null;
}

/**
 * WikiLinkの存在確認ステータスを同期するフック
 *
 * 以下のタイミングでWikiLinkのexists/referenced属性を更新する:
 * 1. ページ読み込み時（pageIdの変更）
 * 2. WikiLinkの数が増加した時（Wiki生成後など）
 *
 * `pageNoteId` が指定された場合は、`useNotePages` から取得したノート配下の
 * ページ一覧を存在判定の候補にする（Issue #713 Phase 4）。これにより、
 * ノートネイティブページ内で同じノートの WikiLink が「存在しない」と
 * 誤判定されて壊れた表示に倒れる問題を防ぐ。
 *
 * When `pageNoteId` is provided, note-scoped existence checks use the
 * `useNotePages(pageNoteId)` result instead of personal-only IndexedDB
 * summaries. This keeps same-note WikiLinks rendering as existing after
 * subsequent sync passes (issue #713 Phase 4).
 */
export function useWikiLinkStatusSync({
  editor,
  content,
  pageId,
  onChange,
  skipSync = false,
  pageNoteId = null,
}: UseWikiLinkStatusSyncOptions): void {
  const notePagesQuery = useNotePages(pageNoteId ?? "", undefined, Boolean(pageNoteId));
  const { checkExistence } = useWikiLinkExistsChecker({
    pageNoteId,
    notePages: pageNoteId ? notePagesQuery.data : undefined,
  });
  // editor の content 変更で頻繁に再レンダーされるため、map+sort+join の O(n log n)
  // をメモ化して打鍵時のコストを抑える。`notePagesQuery.data` の参照が変わったときのみ
  // 再計算される（React Query は同一データなら参照を保つ）。
  // Memoize the signature so keystroke-driven re-renders don't repeat the
  // O(n log n) map/sort/join over the note's page list. React Query keeps a
  // stable reference for unchanged data, so this only re-computes on real changes.
  const notePagesData = notePagesQuery.data;
  const pageScopeSignature = useMemo(() => {
    if (pageNoteId === null) return "personal";
    if (notePagesData === undefined) return `note:${pageNoteId}:loading`;
    return `note:${pageNoteId}:${notePagesData
      .map((page) => `${page.id}:${page.title.trim().toLowerCase()}`)
      .sort()
      .join("|")}`;
  }, [pageNoteId, notePagesData]);

  // 最後にチェックした状態を追跡
  const lastCheckedRef = useRef<{
    pageId: string | null;
    wikiLinkCount: number;
    pageScopeSignature: string | null;
  }>({ pageId: null, wikiLinkCount: 0, pageScopeSignature: null });

  useEffect(() => {
    if (skipSync || !editor || !content || !pageId) {
      return;
    }

    // 現在のWikiLink数を取得
    const currentWikiLinks = extractWikiLinksFromContent(content);
    const currentCount = currentWikiLinks.length;

    // チェックが必要かどうかを判定
    const isNewPage = lastCheckedRef.current.pageId !== pageId;
    const hasMoreWikiLinks = currentCount > lastCheckedRef.current.wikiLinkCount;
    const hasScopeChanged = lastCheckedRef.current.pageScopeSignature !== pageScopeSignature;

    // ページ/リンク数/解決スコープのいずれも変わらないときだけスキップする。
    // Re-run when the resolution scope changes, even if the page id and count stay the same.
    if (!isNewPage && !hasMoreWikiLinks && !hasScopeChanged) {
      return;
    }

    const updateWikiLinkStatus = async () => {
      if (currentWikiLinks.length === 0) {
        lastCheckedRef.current = { pageId, wikiLinkCount: 0, pageScopeSignature };
        return;
      }

      // ユニークなタイトルリストを取得
      const titles = getUniqueWikiLinkTitles(currentWikiLinks);

      // ページの存在確認と参照状態を一括チェック
      const { pageTitles, referencedTitles, pageTitleToId } = await checkExistence(titles, pageId);

      // チェック準備ができていない場合はスキップ（次回再試行）
      if (pageTitles.size === 0 && titles.length > 0) {
        return;
      }

      // エディター内のWikiLinkマークを検索して更新が必要なものを収集
      const updates = collectWikiLinkUpdates(editor, pageTitles, referencedTitles, pageTitleToId);

      // チェック完了を記録
      lastCheckedRef.current = { pageId, wikiLinkCount: currentCount, pageScopeSignature };

      // 更新を適用
      if (updates.length > 0) {
        applyWikiLinkUpdates(editor, updates);

        // 変更を永続化
        const json = JSON.stringify(editor.getJSON());
        onChange(json);
      }
    };

    // コンテンツ反映を待ってから実行
    const timer = setTimeout(updateWikiLinkStatus, 150);
    return () => clearTimeout(timer);
  }, [skipSync, editor, content, checkExistence, pageId, onChange, pageScopeSignature]);
}

// --- ヘルパー関数 ---

interface WikiLinkUpdate {
  from: number;
  to: number;
  exists: boolean;
  referenced: boolean;
  /**
   * 解決済みターゲットページの id。`null` のままにしておくと、後段で
   * `updateAttributes` の payload から外して既存値を保持する（属性を消さない）。
   *
   * Resolved target page id. When `null`, the value is omitted from the
   * `updateAttributes` payload so an existing `targetId` is preserved
   * (we never blank out a previously-resolved id).
   */
  targetId: string | null;
}

/**
 * 更新が必要なWikiLinkを収集する
 */
function collectWikiLinkUpdates(
  editor: Editor,
  pageTitles: Set<string>,
  referencedTitles: Set<string>,
  pageTitleToId: Map<string, string>,
): WikiLinkUpdate[] {
  const updates: WikiLinkUpdate[] = [];
  const { doc } = editor.state;

  doc.descendants((node, pos) => {
    if (!node.isText || node.marks.length === 0) return;

    node.marks.forEach((mark) => {
      if (mark.type.name !== "wikiLink") return;

      const normalizedTitle = (mark.attrs.title as string).toLowerCase().trim();
      const newExists = pageTitles.has(normalizedTitle);
      const newReferenced = referencedTitles.has(normalizedTitle);
      // 解決済みなら id を埋める (issue #737)。未解決時は `null` を返すと
      // 適用フェーズで属性ペイロードから外し、既存の `targetId` を温存する。
      // Populate `targetId` when the link resolves (issue #737). A `null`
      // means "don't touch" — the apply step skips the field so a previously
      // populated id is preserved through transient unresolved states.
      const resolvedId = newExists ? (pageTitleToId.get(normalizedTitle) ?? null) : null;
      const currentTargetId = typeof mark.attrs.targetId === "string" ? mark.attrs.targetId : null;
      const targetIdChanged = resolvedId !== null && resolvedId !== currentTargetId;

      // ステータスが変わった場合のみ更新対象に追加
      if (
        mark.attrs.exists !== newExists ||
        mark.attrs.referenced !== newReferenced ||
        targetIdChanged
      ) {
        updates.push({
          from: pos,
          to: pos + node.nodeSize,
          exists: newExists,
          referenced: newReferenced,
          targetId: targetIdChanged ? resolvedId : null,
        });
      }
    });
  });

  return updates;
}

/**
 * WikiLinkの更新を適用する
 */
function applyWikiLinkUpdates(editor: Editor, updates: WikiLinkUpdate[]): void {
  // 位置がずれないよう逆順で適用
  for (const update of updates.reverse()) {
    const attrs: Record<string, unknown> = {
      exists: update.exists,
      referenced: update.referenced,
    };
    // `targetId` を渡すのは「新しく解決された」ときだけ。`null` のまま
    // 上書きすると、解決状態が一時的に外れた瞬間に id を失ってしまう。
    // Only include `targetId` when we actually resolved a new id; passing
    // `null` would clobber a previously-resolved id during transient
    // unresolved windows (e.g. note-page list still loading).
    if (update.targetId !== null) {
      attrs.targetId = update.targetId;
    }
    editor
      .chain()
      .setTextSelection({ from: update.from, to: update.to })
      .extendMarkRange("wikiLink")
      .updateAttributes("wikiLink", attrs)
      .run();
  }
}
