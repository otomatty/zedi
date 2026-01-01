import React from "react";
import { useNavigate } from "react-router-dom";
import { FileText, Link as LinkIcon } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";
import { useGlobalSearch } from "@/hooks/useGlobalSearch";
import { useGlobalSearchShortcut } from "@/hooks/useGlobalSearchShortcut";
import { formatTimeAgo } from "@/lib/dateUtils";

export function GlobalSearch() {
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

  // Register keyboard shortcut
  useGlobalSearchShortcut(open);

  const handleSelect = (pageId: string) => {
    navigate(`/page/${pageId}`);
    close();
  };

  return (
    <CommandDialog open={isOpen} onOpenChange={(open) => !open && close()}>
      <CommandInput
        placeholder="ページを検索..."
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>ページが見つかりません</CommandEmpty>

        {/* Recent Pages (shown when no query) */}
        {!hasQuery && recentPages.length > 0 && (
          <CommandGroup heading="最近のページ">
            {recentPages.map((page) => (
              <CommandItem
                key={page.id}
                value={`recent-${page.id}`}
                onSelect={() => handleSelect(page.id)}
                className="flex items-center justify-between"
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
                <span className="text-xs text-muted-foreground shrink-0 ml-2">
                  {formatTimeAgo(page.updatedAt)}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {/* Search Results */}
        {hasQuery && searchResults.length > 0 && (
          <CommandGroup heading={`検索結果 (${searchResults.length}件)`}>
            {searchResults.map(({ page, matchedText }) => (
              <CommandItem
                key={page.id}
                value={`search-${page.id}-${page.title}`}
                onSelect={() => handleSelect(page.id)}
                className="flex flex-col items-start gap-1 py-3"
              >
                <div className="flex items-center gap-2 w-full">
                  {page.sourceUrl ? (
                    <LinkIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className="font-medium truncate flex-1">
                    {page.title || "無題のページ"}
                  </span>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {formatTimeAgo(page.updatedAt)}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground line-clamp-1 pl-6 w-full">
                  {matchedText}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>

      {/* Keyboard shortcut hint */}
      <div className="flex items-center justify-center gap-4 border-t px-4 py-2 text-xs text-muted-foreground">
        <span>↑↓ で移動</span>
        <span>Enter で開く</span>
        <span>Esc で閉じる</span>
      </div>
    </CommandDialog>
  );
}

export default GlobalSearch;
