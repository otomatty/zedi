import { useState, useRef, useEffect, useCallback } from "react";
import { Search, FileText, Link as LinkIcon, ArrowRight } from "lucide-react";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { useGlobalSearchContext } from "@/contexts/GlobalSearchContext";
import { useGlobalSearchShortcut } from "@/hooks/useGlobalSearchShortcut";
import { cn } from "@/lib/utils";

const PLACEHOLDER = "ページを検索...";
const EMPTY_MESSAGE = "ページが見つかりません";
const SHORTCUT_HINT = "⌘K";
/** フッター「すべて表示」のインデックス（候補リストの末尾+1） */
const FOOTER_INDEX = -2;

export function HeaderSearchBar() {
  const {
    query,
    setQuery,
    searchResults,
    hasQuery,
    handleSelect,
    handleSearchSubmit,
  } = useGlobalSearchContext();

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1); // -1 = 未選択
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const footerRef = useRef<HTMLButtonElement>(null);

  // ⌘K でヘッダー検索バーにフォーカス
  const handleShortcutFocus = useCallback(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);
  useGlobalSearchShortcut(handleShortcutFocus);

  const showResults = hasQuery && searchResults.length > 0;
  const showEmpty = hasQuery && searchResults.length === 0;
  const hasContent = showResults || showEmpty;

  // 候補数（フッター込みの最大インデックス計算用）
  const itemCount = showResults ? searchResults.length : 0;
  // hasQuery のときフッターがある → 総アイテム数 = itemCount + 1
  const totalItems = hasQuery ? itemCount + 1 : itemCount;

  // hasQuery (3文字以上) になったらドロップダウンを開く
  useEffect(() => {
    if (hasQuery) {
      setDropdownOpen(true);
    }
  }, [hasQuery]);

  // query が変わったら activeIndex をリセット
  useEffect(() => {
    setActiveIndex(-1);
  }, [query]);

  // activeIndex が変わったら対応する要素を scrollIntoView
  useEffect(() => {
    if (activeIndex === -1) return;
    if (activeIndex === itemCount) {
      // フッター
      footerRef.current?.scrollIntoView({ block: "nearest" });
    } else {
      const items = listRef.current?.querySelectorAll("[role='option']");
      items?.[activeIndex]?.scrollIntoView({ block: "nearest" });
    }
  }, [activeIndex, itemCount]);

  const closeDropdown = () => {
    setDropdownOpen(false);
    setActiveIndex(-1);
  };

  const onSelectItem = (pageId: string, noteId?: string) => {
    handleSelect(pageId, noteId);
    closeDropdown();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!dropdownOpen || totalItems === 0) {
      // ドロップダウンが閉じているか候補なし
      if (e.key === "Enter") {
        e.preventDefault();
        handleSearchSubmit();
      }
      if (e.key === "Escape") {
        inputRef.current?.blur();
      }
      return;
    }

    switch (e.key) {
      case "ArrowDown": {
        e.preventDefault();
        setActiveIndex((prev) => {
          const next = prev + 1;
          return next >= totalItems ? 0 : next; // 末尾→先頭に循環
        });
        break;
      }
      case "ArrowUp": {
        e.preventDefault();
        setActiveIndex((prev) => {
          const next = prev - 1;
          return next < 0 ? totalItems - 1 : next; // 先頭→末尾に循環
        });
        break;
      }
      case "Enter": {
        e.preventDefault();
        if (activeIndex === -1 || activeIndex === itemCount) {
          // 未選択 or フッター → 検索結果ページへ
          closeDropdown();
          handleSearchSubmit();
        } else if (activeIndex >= 0 && activeIndex < itemCount) {
          // 候補を選択
          const item = searchResults[activeIndex];
          if (item) {
            onSelectItem(item.pageId, item.noteId);
          }
        }
        break;
      }
      case "Escape": {
        e.preventDefault();
        closeDropdown();
        inputRef.current?.blur();
        break;
      }
    }
  };

  // aria-activedescendant 用の ID を生成
  const getOptionId = (index: number) =>
    index === itemCount ? "header-search-footer" : `header-search-option-${index}`;

  const activeDescendant =
    activeIndex >= 0 ? getOptionId(activeIndex) : undefined;

  return (
    <Popover open={dropdownOpen} onOpenChange={setDropdownOpen}>
      <PopoverAnchor asChild>
        <div className="relative flex min-w-0 flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 shrink-0 text-muted-foreground pointer-events-none" />
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
            onKeyDown={onKeyDown}
            className={cn(
              "h-10 w-full pl-10 pr-3 sm:pr-16 rounded-md bg-muted/50 border-muted-foreground/20",
              "placeholder:text-muted-foreground text-sm"
            )}
          />
          <span
            className="absolute right-3.5 top-1/2 -translate-y-1/2 hidden sm:inline-flex items-center rounded border border-border bg-muted/80 px-2 py-1 text-xs text-muted-foreground pointer-events-none"
            aria-hidden
          >
            {SHORTCUT_HINT}
          </span>
        </div>
      </PopoverAnchor>
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
            3文字以上で検索、Enter で検索結果を表示
          </div>
        )}

        {showEmpty && (
          <div className="py-6 text-center text-sm text-muted-foreground">
            {EMPTY_MESSAGE}
          </div>
        )}

        {showResults && (
          <div className="py-2 overflow-y-auto">
            <p className="px-3 py-1.5 text-xs font-medium text-muted-foreground">
              候補 ({searchResults.length}件)
            </p>
            <ul ref={listRef} className="list-none" role="group" aria-label="検索候補">
              {searchResults.map(({ pageId, noteId, title, sourceUrl }, index) => (
                <li key={noteId ? `shared-${noteId}-${pageId}` : `personal-${pageId}`}>
                  <button
                    id={getOptionId(index)}
                    type="button"
                    role="option"
                    aria-selected={activeIndex === index}
                    className={cn(
                      "flex items-center gap-2 w-full px-3 py-2 text-left text-sm outline-none",
                      activeIndex === index
                        ? "bg-accent text-accent-foreground"
                        : "hover:bg-muted"
                    )}
                    onClick={() => onSelectItem(pageId, noteId)}
                    onMouseEnter={() => setActiveIndex(index)}
                  >
                    {sourceUrl ? (
                      <LinkIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                    <span className="font-medium truncate flex-1">
                      {title}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Enter で検索結果ページへのフッター */}
        {hasQuery && (
          <button
            ref={footerRef}
            id="header-search-footer"
            type="button"
            role="option"
            aria-selected={activeIndex === itemCount}
            className={cn(
              "flex items-center justify-between w-full px-3 py-2.5 text-sm outline-none",
              "border-t border-border text-muted-foreground",
              activeIndex === itemCount
                ? "bg-accent text-accent-foreground"
                : "hover:bg-muted"
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
    </Popover>
  );
}
