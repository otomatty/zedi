import { useState, useMemo } from "react";
import { useSearchPages, useSearchSharedNotes } from "./usePageQueries";
import { useDebouncedValue } from "./useDebouncedValue";
import { extractPlainText } from "@/lib/contentUtils";
import {
  type MatchType,
  parseSearchQuery,
  determineMatchType,
  extractSmartSnippet,
  highlightKeywords,
  calculateEnhancedScore,
} from "@/lib/searchUtils";
import type { Page } from "@/types/page";
import type { SearchSharedResponse } from "@/lib/api/types";

type SharedResultRow = SearchSharedResponse["results"][number];

/**
 *
 */
export interface SearchResult {
  page: Page;
  matchedText: string;
  highlightedText: string;
  matchType: MatchType;
  score: number;
}

/** Unified item for global search (personal + shared). C3-8. */
export interface GlobalSearchResultItem {
  pageId: string;
  /** 共有ノート結果で設定される。Set for shared-note results; navigate to /notes/:noteId/:pageId. */
  noteId?: string;
  title: string;
  highlightedText: string;
  matchType: MatchType;
  sourceUrl?: string;
}

/**
 * Search pages by query with multiple keyword support
 * Exported for testing
 */
export function searchPages(pages: Page[], query: string): SearchResult[] {
  if (!query.trim()) return [];

  // スペースで分割して複数キーワードに対応
  const keywords = parseSearchQuery(query);

  if (keywords.length === 0) return [];

  return pages
    .filter((page) => {
      if (page.isDeleted) return false;

      const title = page.title.toLowerCase();
      const content = extractPlainText(page.content).toLowerCase();

      // すべてのキーワードがタイトルまたはコンテンツに含まれる（AND検索）
      return keywords.every(
        (keyword) =>
          title.includes(keyword.toLowerCase()) || content.includes(keyword.toLowerCase()),
      );
    })
    .map((page) => {
      const content = extractPlainText(page.content);

      // マッチタイプを判定
      const matchType = determineMatchType(page.title, content, keywords, query);

      // スコア計算
      const score = calculateEnhancedScore(page, keywords, matchType);

      // スマートスニペット生成
      const matchedText = extractSmartSnippet(content, keywords);
      const highlightedText = highlightKeywords(matchedText, keywords);

      return { page, matchedText, highlightedText, matchType, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
}

/**
 * 個人ページ (IDB) と shared 検索結果 (API) を統合してグローバル検索結果に
 * 整形する pure 関数。`useGlobalSearch` がメモ化して呼ぶが、振る舞いを
 * 単独でテストできるようエクスポートする (Issue #718 Phase 5-4)。
 *
 * Pure helper that fuses personal-IDB results and the shared API response
 * into the unified `GlobalSearchResultItem` list rendered in the search UI.
 * Exported so the dedup behavior can be tested without spinning up React
 * Query (Issue #718 Phase 5-4).
 *
 * **Dedup contract**: shared rows with `note_id === null` are personal pages
 * that the server's `scope=shared` SQL still returns; they overlap with the
 * IDB-backed personal results, so this function drops them. Only note-native
 * rows (`note_id !== null`) survive on the shared side.
 *
 * **重複排除の契約**: shared レスポンスには `scope=shared` の SQL 仕様で
 * `note_id IS NULL` の個人ページも含まれるが、IDB 由来の personal 結果と
 * 重複するため落とす。shared 側に残るのはノートネイティブのみ。
 */
export function buildGlobalSearchResults(
  personalPages: Page[],
  sharedRows: SharedResultRow[],
  query: string,
  keywords: string[],
  limit = 10,
): GlobalSearchResultItem[] {
  if (query.trim().length < 3 || keywords.length === 0) return [];

  const personal: Array<GlobalSearchResultItem & { score: number }> = personalPages
    .filter((page) => !page.isDeleted)
    .map((page) => {
      const content = extractPlainText(page.content);
      const matchType = determineMatchType(page.title, content, keywords, query);
      const score = calculateEnhancedScore(page, keywords, matchType);
      const matchedText = extractSmartSnippet(content, keywords);
      const highlightedText = highlightKeywords(matchedText, keywords);
      return {
        pageId: page.id,
        title: page.title || "無題のページ",
        highlightedText,
        matchType,
        sourceUrl: page.sourceUrl,
        score,
      };
    })
    .sort((a, b) => b.score - a.score);

  const shared: Array<GlobalSearchResultItem & { score: number }> = sharedRows
    .filter((r) => r.note_id !== null)
    .map((r) => {
      const preview = r.content_preview ?? "";
      const highlightedText = highlightKeywords(preview, keywords);
      return {
        pageId: r.id,
        noteId: r.note_id ?? undefined,
        title: r.title ?? "無題のページ",
        highlightedText: highlightedText || "（共有ノート）",
        matchType: "content" as MatchType,
        sourceUrl: r.source_url ?? undefined,
        score: 0,
      };
    });

  return [...personal, ...shared]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ score: _s, ...item }) => item);
}

/**
 * Hook for global search functionality (C3-8: personal + shared merged).
 *
 * - Personal: StorageAdapter.searchPages via useSearchPages().
 * - Shared: apiClient.searchSharedNotes via useSearchSharedNotes().
 * - Merge / dedup is delegated to {@link buildGlobalSearchResults}.
 */
export function useGlobalSearch() {
  const [query, setQuery] = useState("");

  const debouncedQuery = useDebouncedValue(query, 150);

  const { data: serverSearchResults = [] } = useSearchPages(debouncedQuery);
  const { data: sharedResponse } = useSearchSharedNotes(debouncedQuery);
  const sharedResults = sharedResponse?.results ?? [];

  const keywords = useMemo(() => parseSearchQuery(debouncedQuery), [debouncedQuery]);

  const searchResults = useMemo(
    (): GlobalSearchResultItem[] =>
      buildGlobalSearchResults(serverSearchResults, sharedResults, debouncedQuery, keywords),
    [serverSearchResults, sharedResults, debouncedQuery, keywords],
  );

  return {
    query,
    setQuery,
    searchResults,
    hasQuery: query.trim().length >= 3,
  };
}
