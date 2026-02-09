import { useState, useMemo, useCallback } from "react";
import {
  usePagesSummary,
  useSearchPages,
  useSearchSharedNotes,
} from "./usePageQueries";
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
import type { Page, PageSummary } from "@/types/page";

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
  /** Set for shared-note results; navigate to /note/:noteId/page/:pageId */
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
          title.includes(keyword.toLowerCase()) ||
          content.includes(keyword.toLowerCase())
      );
    })
    .map((page) => {
      const content = extractPlainText(page.content);

      // マッチタイプを判定
      const matchType = determineMatchType(
        page.title,
        content,
        keywords,
        query
      );

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
 * Hook for global search functionality (C3-8: personal + shared merged).
 *
 * - Personal: StorageAdapter.searchPages via useSearchPages().
 * - Shared: apiClient.searchSharedNotes via useSearchSharedNotes().
 * - Results are merged, sorted by score, and capped.
 */
export function useGlobalSearch() {
  const { data: pageSummaries = [] } = usePagesSummary();
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  const debouncedQuery = useDebouncedValue(query, 150);

  const { data: serverSearchResults = [] } = useSearchPages(debouncedQuery);
  const { data: sharedResponse } = useSearchSharedNotes(debouncedQuery);
  const sharedResults = sharedResponse?.results ?? [];

  const keywords = useMemo(
    () => parseSearchQuery(debouncedQuery),
    [debouncedQuery]
  );

  const searchResults = useMemo((): GlobalSearchResultItem[] => {
    if (!debouncedQuery.trim() || keywords.length === 0) return [];

    const personal: Array<GlobalSearchResultItem & { score: number }> =
      serverSearchResults
        .filter((page) => !page.isDeleted)
        .map((page) => {
          const content = extractPlainText(page.content);
          const matchType = determineMatchType(
            page.title,
            content,
            keywords,
            debouncedQuery
          );
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

    const shared: Array<GlobalSearchResultItem & { score: number }> =
      sharedResults.map((r) => {
        const preview = r.content_preview ?? "";
        const highlightedText = highlightKeywords(preview, keywords);
        return {
          pageId: r.id,
          noteId: r.note_id,
          title: r.title ?? "無題のページ",
          highlightedText: highlightedText || "（共有ノート）",
          matchType: "content" as MatchType,
          sourceUrl: r.source_url ?? undefined,
          score: 0,
        };
      });

    return [...personal, ...shared]
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map(({ score: _s, ...item }) => item);
  }, [serverSearchResults, sharedResults, debouncedQuery, keywords]);

  // OPTIMIZED: Recent pages from summary (no content, much less data)
  const recentPages = useMemo((): PageSummary[] => {
    return pageSummaries
      .filter((p) => !p.isDeleted)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 5);
  }, [pageSummaries]);

  const open = useCallback(() => setIsOpen(true), []);

  const close = useCallback(() => {
    setIsOpen(false);
    setQuery("");
  }, []);

  const toggle = useCallback(() => {
    if (isOpen) {
      close();
    } else {
      open();
    }
  }, [isOpen, open, close]);

  return {
    query,
    setQuery,
    isOpen,
    open,
    close,
    toggle,
    searchResults,
    recentPages,
    hasQuery: query.trim().length > 0,
  };
}
