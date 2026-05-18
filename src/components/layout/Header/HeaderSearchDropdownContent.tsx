import { FileText, Link as LinkIcon, ArrowRight, BookOpen } from "lucide-react";
import { PopoverContent } from "@zedi/ui";
import { cn } from "@zedi/ui";
import type { GlobalSearchResultItem } from "@/hooks/useGlobalSearch";

const EMPTY_MESSAGE = "ページが見つかりません";

/**
 *
 */
export interface HeaderSearchDropdownContentProps {
  hasContent: boolean;
  showEmpty: boolean;
  showResults: boolean;
  searchResults: GlobalSearchResultItem[];
  itemCount: number;
  activeIndex: number;
  query: string;
  hasQuery: boolean;
  listRef: React.RefObject<HTMLUListElement | null>;
  footerRef: React.RefObject<HTMLButtonElement | null>;
  getOptionId: (index: number) => string;
  onSelectItem: (item: GlobalSearchResultItem) => void;
  setActiveIndex: (value: number | ((prev: number) => number)) => void;
  closeDropdown: () => void;
  handleSearchSubmit: () => void;
}

/**
 * Issue #864 でグローバル検索結果に PDF ハイライト型 (`kind="pdf_highlight"`) が
 * 加わったので、`key` と `aria-label` をアイテム種別ごとに分岐して安定化させる。
 * 既存ノートページ / 個人ページの key 形式は維持し、追加分だけ別 prefix にする。
 *
 * Issue #864 introduced `kind="pdf_highlight"` rows; the React `key` and the
 * accessible label branch on `kind` so the existing page-row keys stay stable
 * and the new highlight rows get a distinct, collision-free namespace.
 */
function getResultKey(item: GlobalSearchResultItem): string {
  if (item.kind === "pdf_highlight") {
    return `pdf-${item.sourceId}-${item.highlightId}`;
  }
  return item.noteId ? `shared-${item.noteId}-${item.pageId}` : `personal-${item.pageId}`;
}

/**
 *
 */
export function HeaderSearchDropdownContent({
  hasContent,
  showEmpty,
  showResults,
  searchResults,
  itemCount,
  activeIndex,
  query,
  hasQuery,
  listRef,
  footerRef,
  getOptionId,
  onSelectItem,
  setActiveIndex,
  closeDropdown,
  handleSearchSubmit,
}: HeaderSearchDropdownContentProps) {
  return (
    <PopoverContent
      id="header-search-list"
      role="listbox"
      align="start"
      sideOffset={4}
      className={cn(
        "w-[var(--radix-popover-trigger-width)] max-w-[400px] min-w-[280px] p-0",
        "flex max-h-[min(70vh,400px)] flex-col overflow-hidden",
      )}
      onOpenAutoFocus={(e) => e.preventDefault()}
    >
      {!hasContent && (
        <div className="text-muted-foreground py-6 text-center text-sm">
          3文字以上で検索、Enter で検索結果を表示
        </div>
      )}

      {showEmpty && (
        <div className="text-muted-foreground py-6 text-center text-sm">{EMPTY_MESSAGE}</div>
      )}

      {showResults && (
        <div className="overflow-y-auto py-2">
          <p className="text-muted-foreground px-3 py-1.5 text-xs font-medium">
            候補 ({searchResults.length}件)
          </p>
          <ul ref={listRef} className="list-none" role="group" aria-label="検索候補">
            {searchResults.map((item, index) => {
              const isPdf = item.kind === "pdf_highlight";
              return (
                <li key={getResultKey(item)} role="none">
                  <button
                    id={getOptionId(index)}
                    type="button"
                    role="option"
                    aria-selected={activeIndex === index}
                    className={cn(
                      "flex w-full items-center gap-2 px-3 py-2 text-left text-sm outline-none",
                      activeIndex === index ? "bg-accent text-accent-foreground" : "hover:bg-muted",
                    )}
                    onClick={() => onSelectItem(item)}
                    onMouseEnter={() => setActiveIndex(index)}
                  >
                    {isPdf ? (
                      <BookOpen className="text-muted-foreground h-4 w-4 shrink-0" />
                    ) : item.kind === "page" && item.sourceUrl ? (
                      <LinkIcon className="text-muted-foreground h-4 w-4 shrink-0" />
                    ) : (
                      <FileText className="text-muted-foreground h-4 w-4 shrink-0" />
                    )}
                    <span className="flex-1 truncate font-medium">{item.title}</span>
                    {isPdf && (
                      <span className="text-muted-foreground shrink-0 text-[10px]">PDF</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {hasQuery && (
        <button
          ref={footerRef}
          id="header-search-footer"
          type="button"
          role="option"
          aria-selected={activeIndex === itemCount}
          className={cn(
            "flex w-full items-center justify-between px-3 py-2.5 text-sm outline-none",
            "border-border text-muted-foreground border-t",
            activeIndex === itemCount ? "bg-accent text-accent-foreground" : "hover:bg-muted",
          )}
          onClick={() => {
            closeDropdown();
            handleSearchSubmit();
          }}
          onMouseEnter={() => setActiveIndex(itemCount)}
        >
          <span>「{query.trim()}」の検索結果をすべて表示</span>
          <ArrowRight className="h-3.5 w-3.5 shrink-0" />
        </button>
      )}
    </PopoverContent>
  );
}
