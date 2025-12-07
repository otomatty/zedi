// Global search hook - handles Cmd+K / Ctrl+P shortcut
import { createSignal, onMount, onCleanup } from "solid-js";
import { invoke } from "@tauri-apps/api/core";

export interface SearchResult {
  card_id: string;
  title: string;
  snippet: string;
  highlights: { start: number; end: number }[];
  score: number;
}

export function useGlobalSearch() {
  const [isOpen, setIsOpen] = createSignal(false);
  const [query, setQuery] = createSignal("");
  const [results, setResults] = createSignal<SearchResult[]>([]);
  const [isLoading, setIsLoading] = createSignal(false);
  const [selectedIndex, setSelectedIndex] = createSignal(0);

  // Handle keyboard shortcut
  const handleKeyDown = (e: KeyboardEvent) => {
    // Cmd+K (Mac) or Ctrl+P (Windows/Linux)
    if ((e.metaKey && e.key === "k") || (e.ctrlKey && e.key === "p")) {
      e.preventDefault();
      setIsOpen(true);
    }

    // Escape to close
    if (e.key === "Escape" && isOpen()) {
      setIsOpen(false);
      setQuery("");
      setResults([]);
    }
  };

  onMount(() => {
    document.addEventListener("keydown", handleKeyDown);
  });

  onCleanup(() => {
    document.removeEventListener("keydown", handleKeyDown);
  });

  // Search function with debounce
  let searchTimeout: number | undefined;

  const search = async (searchQuery: string) => {
    setQuery(searchQuery);
    setSelectedIndex(0);

    if (!searchQuery.trim()) {
      setResults([]);
      return;
    }

    // Debounce search
    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }

    searchTimeout = window.setTimeout(async () => {
      setIsLoading(true);
      try {
        const searchResults = await invoke<SearchResult[]>("search_cards", {
          query: searchQuery,
          limit: 10,
        });
        setResults(searchResults);
      } catch (error) {
        console.error("Search error:", error);
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    }, 150);
  };

  const open = () => setIsOpen(true);
  const close = () => {
    setIsOpen(false);
    setQuery("");
    setResults([]);
    setSelectedIndex(0);
  };

  const moveSelection = (direction: "up" | "down") => {
    const currentResults = results();
    if (currentResults.length === 0) return;

    const current = selectedIndex();
    if (direction === "up") {
      setSelectedIndex(current > 0 ? current - 1 : currentResults.length - 1);
    } else {
      setSelectedIndex(current < currentResults.length - 1 ? current + 1 : 0);
    }
  };

  const getSelectedResult = () => {
    const currentResults = results();
    const index = selectedIndex();
    return currentResults[index] || null;
  };

  return {
    isOpen,
    query,
    results,
    isLoading,
    selectedIndex,
    search,
    open,
    close,
    moveSelection,
    getSelectedResult,
    setSelectedIndex,
  };
}
