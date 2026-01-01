import { useState, useMemo, useCallback } from "react";
import { usePages } from "./usePageQueries";
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
 */
export function useGlobalSearch() {
  const { data: pages = [] } = usePages();
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  // Debounce query for performance
  const debouncedQuery = useDebouncedValue(query, 100);

  // Search results
  const searchResults = useMemo(() => {
    return searchPages(pages, debouncedQuery);
  }, [pages, debouncedQuery]);

  // Recent pages (last 5 updated)
  const recentPages = useMemo(() => {
    return pages
      .filter((p) => !p.isDeleted)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 5);
  }, [pages]);

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
