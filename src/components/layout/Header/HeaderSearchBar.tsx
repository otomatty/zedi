import { useState, useRef, useEffect, useCallback } from "react";
import { Search } from "lucide-react";
import { Popover, PopoverAnchor } from "@zedi/ui";
import { Input } from "@zedi/ui";
import { useGlobalSearchContext } from "@/contexts/GlobalSearchContext";
import { useGlobalSearchShortcut } from "@/hooks/useGlobalSearchShortcut";
import { HeaderSearchDropdownContent } from "./HeaderSearchDropdownContent";
import { cn } from "@zedi/ui";

const PLACEHOLDER = "ページを検索...";
const SHORTCUT_HINT = "⌘K";

interface SearchKeyDownParams {
  dropdownOpen: boolean;
  totalItems: number;
  activeIndex: number;
  itemCount: number;
  searchResults: Array<{ pageId: string; noteId?: string }>;
  setActiveIndex: (value: number | ((prev: number) => number)) => void;
  closeDropdown: () => void;
  onSelectItem: (pageId: string, noteId?: string) => void;
  handleSearchSubmit: () => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
}

function handleSearchKeyDown(
  e: React.KeyboardEvent<HTMLInputElement>,
  params: SearchKeyDownParams,
): void {
  const {
    dropdownOpen,
    totalItems,
    activeIndex,
    itemCount,
    searchResults,
    setActiveIndex,
    closeDropdown,
    onSelectItem,
    handleSearchSubmit,
    inputRef,
  } = params;

  if (!dropdownOpen || totalItems === 0) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSearchSubmit();
    }
    if (e.key === "Escape") inputRef.current?.blur();
    return;
  }

  switch (e.key) {
    case "ArrowDown":
      e.preventDefault();
      setActiveIndex((prev) => (prev + 1 >= totalItems ? 0 : prev + 1));
      break;
    case "ArrowUp":
      e.preventDefault();
      setActiveIndex((prev) => (prev - 1 < 0 ? totalItems - 1 : prev - 1));
      break;
    case "Enter": {
      e.preventDefault();
      if (activeIndex === -1 || activeIndex === itemCount) {
        closeDropdown();
        handleSearchSubmit();
      } else if (activeIndex >= 0 && activeIndex < itemCount) {
        const item = searchResults[activeIndex];
        if (item) onSelectItem(item.pageId, item.noteId);
      }
      break;
    }
    case "Escape":
      e.preventDefault();
      closeDropdown();
      inputRef.current?.blur();
      break;
  }
}

/**
 *
 */
export function HeaderSearchBar() {
  /**
   *
   */
  const { query, setQuery, searchResults, hasQuery, handleSelect, handleSearchSubmit } =
    useGlobalSearchContext();

  /**
   *
   */
  const [dropdownOpen, setDropdownOpen] = useState(false);
  /**
   *
   */
  const [activeIndex, setActiveIndex] = useState(-1);
  /**
   *
   */
  const inputRef = useRef<HTMLInputElement>(null);
  /**
   *
   */
  const listRef = useRef<HTMLUListElement>(null);
  /**
   *
   */
  const footerRef = useRef<HTMLButtonElement>(null);

  /**
   *
   */
  const handleShortcutFocus = useCallback(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);
  useGlobalSearchShortcut(handleShortcutFocus);

  /**
   *
   */
  const showResults = hasQuery && searchResults.length > 0;
  /**
   *
   */
  const showEmpty = hasQuery && searchResults.length === 0;
  /**
   *
   */
  const hasContent = showResults || showEmpty;
  /**
   *
   */
  const itemCount = showResults ? searchResults.length : 0;
  /**
   *
   */
  const totalItems = hasQuery ? itemCount + 1 : itemCount;

  useEffect(() => {
    if (hasQuery) queueMicrotask(() => setDropdownOpen(true));
  }, [hasQuery]);

  useEffect(() => {
    queueMicrotask(() => setActiveIndex(-1));
  }, [query]);

  useEffect(() => {
    if (activeIndex === -1) return;
    if (activeIndex === itemCount) {
      footerRef.current?.scrollIntoView({ block: "nearest" });
    } else {
      /**
       *
       */
      const items = listRef.current?.querySelectorAll("[role='option']");
      items?.[activeIndex]?.scrollIntoView({ block: "nearest" });
    }
  }, [activeIndex, itemCount]);

  /**
   *
   */
  const closeDropdown = useCallback(() => {
    setDropdownOpen(false);
    setActiveIndex(-1);
  }, []);

  /**
   *
   */
  const onSelectItem = useCallback(
    (pageId: string, noteId?: string) => {
      handleSelect(pageId, noteId);
      closeDropdown();
    },
    [handleSelect, closeDropdown],
  );

  /**
   *
   */
  const getOptionId = useCallback(
    (index: number) =>
      index === itemCount ? "header-search-footer" : `header-search-option-${index}`,
    [itemCount],
  );

  /**
   *
   */
  const activeDescendant = activeIndex >= 0 ? getOptionId(activeIndex) : undefined;

  return (
    <Popover open={dropdownOpen} onOpenChange={setDropdownOpen}>
      <PopoverAnchor asChild>
        <div className="relative flex w-full min-w-0 flex-1">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-4 h-6 w-6 shrink-0 -translate-y-1/2" />
          <Input
            ref={inputRef}
            type="search"
            role="combobox"
            aria-expanded={dropdownOpen}
            aria-autocomplete="list"
            aria-controls="header-search-list"
            aria-activedescendant={activeDescendant}
            id="header-search-input"
            placeholder={PLACEHOLDER}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) =>
              handleSearchKeyDown(e, {
                dropdownOpen,
                totalItems,
                activeIndex,
                itemCount,
                searchResults,
                setActiveIndex,
                closeDropdown,
                onSelectItem,
                handleSearchSubmit,
                inputRef,
              })
            }
            className={cn(
              "border-muted-foreground/20 bg-muted/50 h-12 w-full rounded-md pr-3 pl-12 sm:pr-20",
              "placeholder:text-muted-foreground text-base",
            )}
          />
          <span
            className="border-border bg-muted/80 text-muted-foreground pointer-events-none absolute top-1/2 right-4 hidden -translate-y-1/2 items-center rounded border px-2.5 py-1 text-sm sm:inline-flex"
            aria-hidden
          >
            {SHORTCUT_HINT}
          </span>
        </div>
      </PopoverAnchor>
      <HeaderSearchDropdownContent
        hasContent={hasContent}
        showEmpty={showEmpty}
        showResults={showResults}
        searchResults={searchResults}
        itemCount={itemCount}
        activeIndex={activeIndex}
        query={query}
        hasQuery={hasQuery}
        listRef={listRef}
        footerRef={footerRef}
        getOptionId={getOptionId}
        onSelectItem={onSelectItem}
        setActiveIndex={setActiveIndex}
        closeDropdown={closeDropdown}
        handleSearchSubmit={handleSearchSubmit}
      />
    </Popover>
  );
}
