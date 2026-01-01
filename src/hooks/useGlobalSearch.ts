import { useState, useMemo, useCallback } from "react";
import { usePagesSummary, useSearchPages } from "./usePageQueries";
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
 * Hook for global search functionality
 *
 * OPTIMIZED:
 * - Uses usePagesSummary() for recent pages display (no content, reduces Rows Read by ~95%)
 * - Uses useSearchPages() for server-side search (only fetches matching pages)
 */
export function useGlobalSearch() {
  // OPTIMIZED: Use summary for recent pages (no content needed)
  const { data: pageSummaries = [] } = usePagesSummary();
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  // Debounce query for performance
  const debouncedQuery = useDebouncedValue(query, 150);

  // OPTIMIZED: Use server-side search (only fetches matching pages with content)
  const { data: serverSearchResults = [] } = useSearchPages(debouncedQuery);

  // Process server search results with enhanced scoring and snippets
  const searchResults = useMemo(() => {
    if (!debouncedQuery.trim() || serverSearchResults.length === 0) return [];

    const keywords = parseSearchQuery(debouncedQuery);
    if (keywords.length === 0) return [];

    return serverSearchResults
      .filter((page) => !page.isDeleted)
      .map((page) => {
        const content = extractPlainText(page.content);

        // マッチタイプを判定
        const matchType = determineMatchType(
          page.title,
          content,
          keywords,
          debouncedQuery
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
  }, [serverSearchResults, debouncedQuery]);

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
