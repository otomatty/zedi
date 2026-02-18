import React, { useState, useRef, useEffect } from "react";
import { Search, FileText, Link as LinkIcon } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { useGlobalSearchContext } from "@/contexts/GlobalSearchContext";
import { formatTimeAgo } from "@/lib/dateUtils";
import { MatchTypeBadge } from "@/components/search/MatchTypeBadge";
import { HighlightedSnippet } from "@/components/search/HighlightedSnippet";
import { cn } from "@/lib/utils";

const PLACEHOLDER = "ページを検索...";
const EMPTY_MESSAGE = "ページが見つかりません";
const SHORTCUT_HINT = "⌘K";

export function HeaderSearchBar() {
  const {
    query,
    setQuery,
    searchResults,
    recentPages,
    hasQuery,
    handleSelect,
  } = useGlobalSearchContext();

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const showRecent = !hasQuery && recentPages.length > 0;
  const showResults = hasQuery && searchResults.length > 0;
  const showEmpty = hasQuery && searchResults.length === 0;
  const hasContent = showRecent || showResults || showEmpty;

  useEffect(() => {
    if (!dropdownOpen) return;
    // Keep dropdown open when query or results change while user is interacting
  }, [dropdownOpen, query, searchResults.length, recentPages.length]);

  const openDropdown = () => setDropdownOpen(true);
  const closeDropdown = () => setDropdownOpen(false);

  const onSelectItem = (pageId: string, noteId?: string) => {
    handleSelect(pageId, noteId);
    setDropdownOpen(false);
  };

  return (
    <Popover open={dropdownOpen} onOpenChange={setDropdownOpen}>
      <PopoverTrigger asChild>
        <div className="relative flex min-w-0 flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 shrink-0 text-muted-foreground pointer-events-none" />
          <Input
            ref={inputRef}
            type="search"
            role="combobox"
            aria-expanded={dropdownOpen}
            aria-autocomplete="list"
            aria-controls="header-search-list"
            id="header-search-input"
            placeholder={PLACEHOLDER}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={openDropdown}
            className={cn(
              "h-9 w-full pl-9 pr-16 rounded-md bg-muted/50 border-muted-foreground/20",
              "placeholder:text-muted-foreground text-sm"
            )}
          />
          <span
            className="absolute right-3 top-1/2 -translate-y-1/2 hidden sm:inline-flex items-center rounded border border-border bg-muted/80 px-1.5 py-0.5 text-[10px] text-muted-foreground pointer-events-none"
            aria-hidden
          >
            {SHORTCUT_HINT}
          </span>
        </div>
      </PopoverTrigger>
      <PopoverContent
        id="header-search-list"
        role="listbox"
        align="start"
        sideOffset={4}
        className={cn(
          "w-[var(--radix-popover-trigger-width)] min-w-[280px] max-w-[400px] p-0",
          "max-h-[min(70vh,400px)] overflow-hidden flex flex-col"
        )}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {!hasContent && (
          <div className="py-6 text-center text-sm text-muted-foreground">
            検索するか、⌘K で詳細を開く
          </div>
        )}

        {showEmpty && (
          <div className="py-6 text-center text-sm text-muted-foreground">
            {EMPTY_MESSAGE}
          </div>
        )}

        {showRecent && (
          <div className="py-2">
            <p className="px-3 py-1.5 text-xs font-medium text-muted-foreground">
              最近のページ
            </p>
            <ul className="list-none" role="group" aria-label="最近のページ">
              {recentPages.map((page) => (
                <li key={page.id}>
                  <button
                    type="button"
                    role="option"
                    className={cn(
                      "flex items-center justify-between gap-2 w-full px-3 py-2 text-left text-sm",
                      "hover:bg-muted focus:bg-muted outline-none"
                    )}
                    onClick={() => onSelectItem(page.id)}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {page.sourceUrl ? (
                        <LinkIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                      ) : (
                        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                      <span className="truncate">
                        {page.title || "無題のページ"}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {formatTimeAgo(page.updatedAt)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {showResults && (
          <div className="py-2 overflow-y-auto">
            <p className="px-3 py-1.5 text-xs font-medium text-muted-foreground">
              検索結果 ({searchResults.length}件)
            </p>
            <ul className="list-none" role="group" aria-label="検索結果">
              {searchResults.map(({ pageId, noteId, title, highlightedText, matchType, sourceUrl }) => (
                <li key={noteId ? `shared-${noteId}-${pageId}` : `personal-${pageId}`}>
                  <button
                    type="button"
                    role="option"
                    className={cn(
                      "flex flex-col items-start gap-1 w-full px-3 py-2.5 text-left text-sm",
                      "hover:bg-muted focus:bg-muted outline-none"
                    )}
                    onClick={() => onSelectItem(pageId, noteId)}
                  >
                    <div className="flex items-center gap-2 w-full">
                      {sourceUrl ? (
                        <LinkIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                      ) : (
                        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                      <span className="font-medium truncate flex-1">
                        {title}
                      </span>
                      <MatchTypeBadge type={matchType} />
                    </div>
                    <div className="pl-6 w-full">
                      <HighlightedSnippet text={highlightedText} />
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
