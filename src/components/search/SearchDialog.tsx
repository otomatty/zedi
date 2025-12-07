// Global Search Dialog Component (Omni-bar)
// Activated by Cmd+K (Mac) or Ctrl+P (Windows/Linux)

import { Component, Show, For, createEffect } from "solid-js";
import { Dialog } from "@kobalte/core/dialog";
import { useGlobalSearch, SearchResult } from "../../hooks/useGlobalSearch";
import "./SearchDialog.css";

interface SearchDialogProps {
  onSelectCard?: (cardId: string) => void;
}

const SearchDialog: Component<SearchDialogProps> = (props) => {
  const {
    isOpen,
    query,
    results,
    isLoading,
    selectedIndex,
    search,
    close,
    moveSelection,
    getSelectedResult,
    setSelectedIndex,
  } = useGlobalSearch();

  let inputRef: HTMLInputElement | undefined;

  // Focus input when dialog opens
  createEffect(() => {
    if (isOpen() && inputRef) {
      setTimeout(() => inputRef?.focus(), 0);
    }
  });

  const handleKeyDown = (e: KeyboardEvent) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        moveSelection("down");
        break;
      case "ArrowUp":
        e.preventDefault();
        moveSelection("up");
        break;
      case "Enter":
        e.preventDefault();
        const selected = getSelectedResult();
        if (selected) {
          handleSelect(selected);
        }
        break;
      case "Escape":
        close();
        break;
    }
  };

  const handleSelect = (result: SearchResult) => {
    if (props.onSelectCard) {
      props.onSelectCard(result.card_id);
    }
    close();
  };

  const renderHighlightedSnippet = (snippet: string, highlights: { start: number; end: number }[]) => {
    if (!highlights.length) {
      return snippet;
    }

    // Sort highlights by start position
    const sorted = [...highlights].sort((a, b) => a.start - b.start);
    const parts: (string | { text: string; highlight: boolean })[] = [];
    let lastEnd = 0;

    for (const { start, end } of sorted) {
      if (start > lastEnd) {
        parts.push(snippet.slice(lastEnd, start));
      }
      parts.push({ text: snippet.slice(start, end), highlight: true });
      lastEnd = end;
    }

    if (lastEnd < snippet.length) {
      parts.push(snippet.slice(lastEnd));
    }

    return (
      <>
        <For each={parts}>
          {(part) =>
            typeof part === "string" ? (
              part
            ) : (
              <mark class="search-highlight">{part.text}</mark>
            )
          }
        </For>
      </>
    );
  };

  return (
    <Dialog open={isOpen()} onOpenChange={(open) => !open && close()}>
      <Dialog.Portal>
        <Dialog.Overlay class="search-dialog-overlay" />
        <Dialog.Content class="search-dialog-content" onKeyDown={handleKeyDown}>
          <div class="search-input-container">
            <svg
              class="search-icon"
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
              ref={inputRef}
              type="text"
              class="search-input"
              placeholder="Search cards..."
              value={query()}
              onInput={(e) => search(e.currentTarget.value)}
            />
            <Show when={isLoading()}>
              <div class="search-spinner" />
            </Show>
          </div>

          <Show when={query().trim()}>
            <div class="search-results">
              <Show
                when={results().length > 0}
                fallback={
                  <div class="search-no-results">
                    {isLoading() ? "Searching..." : "No results found"}
                  </div>
                }
              >
                <For each={results()}>
                  {(result, index) => (
                    <button
                      class="search-result-item"
                      classList={{ selected: index() === selectedIndex() }}
                      onClick={() => handleSelect(result)}
                      onMouseEnter={() => setSelectedIndex(index())}
                    >
                      <div class="search-result-title">{result.title || "Untitled"}</div>
                      <div class="search-result-snippet">
                        {renderHighlightedSnippet(result.snippet, result.highlights)}
                      </div>
                    </button>
                  )}
                </For>
              </Show>
            </div>
          </Show>

          <div class="search-footer">
            <span class="search-hint">
              <kbd>↑</kbd> <kbd>↓</kbd> to navigate
            </span>
            <span class="search-hint">
              <kbd>Enter</kbd> to select
            </span>
            <span class="search-hint">
              <kbd>Esc</kbd> to close
            </span>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog>
  );
};

export default SearchDialog;
