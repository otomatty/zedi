import React, { createContext, useCallback, useContext } from "react";
import { useNavigate } from "react-router-dom";
import { useGlobalSearch } from "@/hooks/useGlobalSearch";
import type { GlobalSearchResultItem } from "@/hooks/useGlobalSearch";
import type { PageSummary } from "@/types/page";

interface GlobalSearchContextValue {
  query: string;
  setQuery: (value: string) => void;
  searchResults: GlobalSearchResultItem[];
  recentPages: PageSummary[];
  hasQuery: boolean;
  isOpen: boolean;
  open: () => void;
  close: () => void;
  handleSelect: (pageId: string, noteId?: string) => void;
}

const GlobalSearchContext = createContext<GlobalSearchContextValue | null>(null);

export function GlobalSearchProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const {
    query,
    setQuery,
    isOpen,
    open,
    close,
    searchResults,
    recentPages,
    hasQuery,
  } = useGlobalSearch();

  const handleSelect = useCallback(
    (pageId: string, noteId?: string) => {
      if (noteId) {
        navigate(`/note/${noteId}/page/${pageId}`);
      } else {
        navigate(`/page/${pageId}`);
      }
      close();
    },
    [navigate, close]
  );

  const value: GlobalSearchContextValue = {
    query,
    setQuery,
    searchResults,
    recentPages,
    hasQuery,
    isOpen,
    open,
    close,
    handleSelect,
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
