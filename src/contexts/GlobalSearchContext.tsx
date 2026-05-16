import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useGlobalSearch } from "@/hooks/useGlobalSearch";
import type { GlobalSearchResultItem } from "@/hooks/useGlobalSearch";

interface GlobalSearchContextValue {
  query: string;
  setQuery: (value: string) => void;
  searchResults: GlobalSearchResultItem[];
  hasQuery: boolean;
  /**
   * 検索結果アイテムを選択したときの遷移ロジック。
   * Navigation handler for a selected search result item.
   *
   * Issue #864:
   * - `kind="page"`: 従来どおり `/notes/:noteId/:pageId` または `/pages/:pageId`。
   * - `kind="pdf_highlight"`: 派生 Zedi ページがあればそちらへ、なければ
   *   `/sources/:sourceId/pdf#page=N` の PDF ビューア（後続 PR で実装）へ。
   *
   * - `kind="page"`: same as before — note-scoped or standalone page URL.
   * - `kind="pdf_highlight"`: route to the derived Zedi page if one exists,
   *   otherwise deep-link to the PDF viewer at `/sources/:sourceId/pdf#page=N`.
   *   The hash carries the page number so the viewer (built in a follow-up PR
   *   tracked by the parent issue otomatty/zedi#389) can scroll to it.
   */
  handleSelect: (item: GlobalSearchResultItem) => void;
  /** Enterキーで検索結果ページへ遷移 */
  handleSearchSubmit: () => void;
  /** ⌘K でヘッダー検索バーにフォーカス */
  focusSearchInput: () => void;
  /** グローバル検索ダイアログの開閉状態（GlobalSearch CommandDialog 用） */
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

const GlobalSearchContext = createContext<GlobalSearchContextValue | null>(null);

/**
 * Builds the navigation URL for a search result item. Exported pure helper so
 * URL composition (Issue #864 acceptance criteria) can be unit-tested without
 * spinning up React Router.
 *
 * 検索結果アイテムから遷移先 URL を組み立てる純関数。URL 組み立てロジックを
 * テストから直接呼べるよう export している（Issue #864 受け入れ基準）。
 */
export function resolveSearchResultUrl(item: GlobalSearchResultItem): string {
  if (item.kind === "page") {
    if (item.noteId) return `/notes/${item.noteId}/${item.pageId}`;
    return `/pages/${item.pageId}`;
  }
  // kind === "pdf_highlight"
  if (item.derivedPageId) return `/pages/${item.derivedPageId}`;
  return `/sources/${item.sourceId}/pdf#page=${item.pdfPage}`;
}

/**
 *
 */
export function GlobalSearchProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { query, setQuery, searchResults, hasQuery } = useGlobalSearch();
  const [isOpen, setOpen] = useState(false);
  const open = useCallback(() => setOpen(true), []);
  const close = useCallback(() => setOpen(false), []);

  const handleSelect = useCallback(
    (item: GlobalSearchResultItem) => {
      navigate(resolveSearchResultUrl(item));
    },
    [navigate],
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
    isOpen,
    open,
    close,
  };

  return <GlobalSearchContext.Provider value={value}>{children}</GlobalSearchContext.Provider>;
}

/**
 *
 */
export function useGlobalSearchContext(): GlobalSearchContextValue {
  const ctx = useContext(GlobalSearchContext);
  if (!ctx) {
    throw new Error("useGlobalSearchContext must be used within GlobalSearchProvider");
  }
  return ctx;
}

/**
 *
 */
export function useGlobalSearchContextOptional(): GlobalSearchContextValue | null {
  return useContext(GlobalSearchContext);
}
