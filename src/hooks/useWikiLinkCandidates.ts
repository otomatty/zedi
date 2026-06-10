import { useMemo } from "react";
import { usePagesSummary } from "@/hooks/usePageQueries";
import { useNoteTitleIndex } from "@/hooks/useNoteQueries";
import type { PageSummary } from "@/types/page";

/**
 * WikiLink のサジェスト・タイトル検索に使う候補ページのスコープ。
 * Scope of candidate pages used by WikiLink suggestion / title lookups.
 *
 * - `pageNoteId === null` → ローカル（IndexedDB＝デフォルトノート）のページのみ
 * - `pageNoteId !== null` → そのノートに所属するページのみ
 *
 * ノートを跨いだ参照は v1 では非対応（Issue #713 Phase 4 / #1020）。
 */
export interface WikiLinkCandidatesResult {
  pages: Array<Pick<PageSummary, "id" | "title" | "isDeleted">>;
  isLoading: boolean;
}

/**
 * 現在編集中のページ所属に基づく WikiLink 候補を返す。
 * 呼び出し側は `WikiLinkSuggestion` や `getPageByTitle` などスコープを尊重
 * したい処理で利用する。
 *
 * Returns WikiLink candidate pages scoped to the current editor context
 * (the local default-note set when `pageNoteId === null`, same-note pages
 * otherwise). See issues #713 Phase 4 / #1020.
 */
export function useWikiLinkCandidates(
  pageNoteId: string | null | undefined,
): WikiLinkCandidatesResult {
  const noteId = pageNoteId ?? null;
  // ノートスコープではローカル（IndexedDB）ページを取りに行かない（不要な
  // アクセスを避ける）。`enabled` は react-query で queryFn を抑止する。
  // In note scope, skip the local pages lookup to avoid unnecessary
  // IndexedDB access; `enabled` suppresses the react-query queryFn.
  const personal = usePagesSummary({ enabled: noteId === null });
  // issue #860 Phase 6: ノートスコープではタイトル文字列だけ使うため、
  // `useNoteTitleIndex` の最小 payload で十分（preview / thumbnail を取らない）。
  //
  // Issue #860 Phase 6: in note scope only the titles are read, so the
  // `useNoteTitleIndex` minimal payload is enough — no preview / thumbnail
  // needs to be transferred for the suggestion UI.
  const noteTitles = useNoteTitleIndex(noteId ?? "", { enabled: Boolean(noteId) });

  return useMemo<WikiLinkCandidatesResult>(() => {
    if (noteId) {
      const data = noteTitles.data ?? [];
      return {
        pages: data.map((p) => ({ id: p.id, title: p.title, isDeleted: p.isDeleted })),
        isLoading: noteTitles.isLoading,
      };
    }
    const data = personal.data ?? [];
    return {
      pages: data.map((p) => ({ id: p.id, title: p.title, isDeleted: p.isDeleted })),
      isLoading: personal.isLoading,
    };
  }, [noteId, personal.data, personal.isLoading, noteTitles.data, noteTitles.isLoading]);
}
