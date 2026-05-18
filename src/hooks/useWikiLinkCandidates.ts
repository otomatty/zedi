import { useMemo } from "react";
import { usePagesSummary } from "@/hooks/usePageQueries";
import { useNoteTitleIndex } from "@/hooks/useNoteQueries";
import type { PageSummary } from "@/types/page";

/**
 * WikiLink のサジェスト・タイトル検索に使う候補ページのスコープ。
 * Scope of candidate pages used by WikiLink suggestion / title lookups.
 *
 * - `pageNoteId === null` → 個人ページのみ（`note_id IS NULL`）
 * - `pageNoteId !== null` → そのノートに所属するページのみ
 *
 * ノートを跨いだ参照、ノート↔個人を跨いだ参照は v1 では非対応
 * （Issue #713 Phase 4）。
 */
export interface WikiLinkCandidatesResult {
  pages: Array<Pick<PageSummary, "id" | "title" | "isDeleted">>;
  isLoading: boolean;
}

/**
 * 現在編集中のページ所属（個人 or ノート）に基づく WikiLink 候補を返す。
 * 呼び出し側は `WikiLinkSuggestion` や `getPageByTitle` などスコープを尊重
 * したい処理で利用する。
 *
 * Returns WikiLink candidate pages scoped to the current editor context
 * (personal pages when `pageNoteId === null`, same-note pages otherwise).
 * See issue #713 Phase 4.
 */
export function useWikiLinkCandidates(
  pageNoteId: string | null | undefined,
): WikiLinkCandidatesResult {
  const noteId = pageNoteId ?? null;
  // ノートスコープでは個人ページを取りに行かない（IndexedDB への不要な
  // アクセスを避ける）。`enabled` は react-query で queryFn を抑止する。
  // In note scope, skip the personal pages lookup to avoid unnecessary
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
