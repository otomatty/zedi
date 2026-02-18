import React, { createContext, useCallback, useContext } from "react";
import { useNavigate } from "react-router-dom";
import { useGlobalSearch } from "@/hooks/useGlobalSearch";
import type { GlobalSearchResultItem } from "@/hooks/useGlobalSearch";

interface GlobalSearchContextValue {
  query: string;
  setQuery: (value: string) => void;
  searchResults: GlobalSearchResultItem[];
  hasQuery: boolean;
  handleSelect: (pageId: string, noteId?: string) => void;
  /** Enterキーで検索結果ページへ遷移 */
  handleSearchSubmit: () => void;
  /** ⌘K でヘッダー検索バーにフォーカス */
  focusSearchInput: () => void;
}

const GlobalSearchContext = createContext<GlobalSearchContextValue | null>(null);

export function GlobalSearchProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const {
    query,
    setQuery,
    searchResults,
    hasQuery,
  } = useGlobalSearch();

  const handleSelect = useCallback(
    (pageId: string, noteId?: string) => {
      if (noteId) {
        navigate(`/note/${noteId}/page/${pageId}`);
      } else {
        navigate(`/page/${pageId}`);
      }
    },
    [navigate]
  );

  const handleSearchSubmit = useCallback(() => {
    const q = query.trim();
    if (q) {
      navigate(`/search?q=${encodeURIComponent(q)}`);
    }
  }, [query, navigate]);

  const focusSearchInput = useCallback(() => {
    const el = document.getElementById("header-search-input") as HTMLInputElement | null;
    if (el) {
      el.focus();
      el.select();
    }
  }, []);

  const value: GlobalSearchContextValue = {
    query,
    setQuery,
    searchResults,
    hasQuery,
    handleSelect,
    handleSearchSubmit,
    focusSearchInput,
  };

  return (
    <GlobalSearchContext.Provider value={value}>
      {children}
    </GlobalSearchContext.Provider>
  );
}

export function useGlobalSearchContext(): GlobalSearchContextValue {
  const ctx = useContext(GlobalSearchContext);
  if (!ctx) {
    throw new Error("useGlobalSearchContext must be used within GlobalSearchProvider");
  }
  return ctx;
}

export function useGlobalSearchContextOptional(): GlobalSearchContextValue | null {
  return useContext(GlobalSearchContext);
}
