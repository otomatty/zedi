import { useState, useMemo, useCallback } from "react";
import { usePages } from "./usePageQueries";
import { useDebouncedValue } from "./useDebouncedValue";
import { extractPlainText } from "@/lib/contentUtils";
import type { Page } from "@/types/page";

export interface SearchResult {
  page: Page;
  matchedText: string;
  score: number;
}

/**
 * Extract a context-aware snippet around the matched keyword
 */
function extractMatchedSnippet(
  text: string,
  query: string,
  contextLength: number = 40
): string {
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const index = lowerText.indexOf(lowerQuery);

  if (index === -1) {
    // No match found, return start of text
    return (
      text.slice(0, contextLength * 2) +
      (text.length > contextLength * 2 ? "..." : "")
    );
  }

  const start = Math.max(0, index - contextLength);
  const end = Math.min(text.length, index + query.length + contextLength);

  let snippet = text.slice(start, end);

  // Add ellipsis if we're not at the start/end
  if (start > 0) snippet = "..." + snippet;
  if (end < text.length) snippet = snippet + "...";

  return snippet;
}

/**
 * Calculate relevance score for a search result
 */
function calculateScore(page: Page, query: string): number {
  const normalizedQuery = query.toLowerCase().trim();
  let score = 0;

  // Title match (higher weight)
  const titleLower = page.title.toLowerCase();
  if (titleLower === normalizedQuery) {
    score += 100; // Exact title match
  } else if (titleLower.startsWith(normalizedQuery)) {
    score += 50; // Title starts with query
  } else if (titleLower.includes(normalizedQuery)) {
    score += 30; // Title contains query
  }

  // Content match
  const content = extractPlainText(page.content).toLowerCase();
  if (content.includes(normalizedQuery)) {
    score += 20;
    // Bonus for multiple occurrences
    const occurrences = (content.match(new RegExp(normalizedQuery, "g")) || [])
      .length;
    score += Math.min(occurrences, 5) * 2;
  }

  // Recency bonus (newer pages score higher)
  const ageInDays = (Date.now() - page.updatedAt) / (1000 * 60 * 60 * 24);
  score += Math.max(0, 10 - Math.floor(ageInDays));

  return score;
}

/**
 * Search pages by query
 */
function searchPages(pages: Page[], query: string): SearchResult[] {
  if (!query.trim()) return [];

  const normalizedQuery = query.toLowerCase().trim();

  return pages
    .filter((page) => {
      if (page.isDeleted) return false;

      const titleMatch = page.title.toLowerCase().includes(normalizedQuery);
      const content = extractPlainText(page.content);
      const contentMatch = content.toLowerCase().includes(normalizedQuery);

      return titleMatch || contentMatch;
    })
    .map((page) => {
      const content = extractPlainText(page.content);
      const score = calculateScore(page, query);
      const matchedText = extractMatchedSnippet(content, query);

      return { page, matchedText, score };
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
