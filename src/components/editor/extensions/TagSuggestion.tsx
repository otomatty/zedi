import { forwardRef, useEffect, useImperativeHandle, useState, useCallback } from "react";
import { Editor } from "@tiptap/core";
import { cn } from "@zedi/ui";
import { Hash, Plus } from "lucide-react";

/**
 * One suggestion item shown in the tag dropdown. `exists=false` marks the
 * "create new" option for a tag whose target page does not yet exist.
 *
 * タグサジェストの 1 アイテム。`exists=false` は対象ページ未作成の
 * 「新規作成」オプションを示す。
 */
export interface TagSuggestionItem {
  id: string;
  name: string;
  exists: boolean;
}

/**
 * Minimal page shape consumed by {@link TagSuggestion}. Tags resolve to pages
 * by title, so only `id`, `title`, and the soft-delete flag are needed.
 *
 * {@link TagSuggestion} が受け取る最小ページ情報。タグはページタイトルで
 * 解決されるため、`id` / `title` / 削除フラグのみで十分。
 */
export interface TagSuggestionPage {
  id: string;
  title: string;
  isDeleted?: boolean;
}

interface TagSuggestionProps {
  editor: Editor;
  query: string;
  range: { from: number; to: number };
  onSelect: (item: TagSuggestionItem) => void;
  onClose: () => void;
  /**
   * Candidate pages supplied by the caller. Scope filtering (personal-only
   * vs. same-note) is expected to happen in the caller so this component
   * can stay a pure presentation layer.
   *
   * 呼び出し側が渡す候補ページ。スコープ絞り込み（個人ページ・同一ノート）
   * は呼び出し側で事前に行い、ここは純粋な表示層に留める。
   */
  pages: TagSuggestionPage[];
}

/**
 * Imperative handle exposing `onKeyDown`; returning `true` tells the caller
 * to suppress the default key handling.
 *
 * `onKeyDown` が `true` を返すと呼び出し元は既定のキーハンドラを抑止する。
 */
export interface TagSuggestionHandle {
  onKeyDown: (event: KeyboardEvent) => boolean;
}

/**
 * Tag suggestion popup. Renders up to five candidates matching the query
 * and, when there is no exact match, a "create new" option. Scope filtering
 * (personal vs. same-note) happens in the caller before pages are passed in.
 *
 * タグサジェストポップアップ。最大 5 件の候補を表示し、完全一致が無ければ
 * 「新規作成」オプションを追加する。スコープ絞り込みは呼び出し側で行う。
 */
export const TagSuggestion = forwardRef<TagSuggestionHandle, TagSuggestionProps>(
  ({ query, onSelect, onClose, pages }, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0);

    const getItems = useCallback((): TagSuggestionItem[] => {
      const normalizedQuery = query.toLowerCase().trim();

      const matchingPages = pages
        .filter((p) => !p.isDeleted && p.title.toLowerCase().includes(normalizedQuery))
        .slice(0, 5)
        .map((p) => ({
          id: p.id,
          name: p.title || "無題のページ",
          exists: true,
        }));

      const exactMatch = pages.find(
        (p) => !p.isDeleted && p.title.toLowerCase() === normalizedQuery,
      );

      const items: TagSuggestionItem[] = [...matchingPages];

      if (query.trim() && !exactMatch) {
        items.push({
          id: "create-new",
          name: query.trim(),
          exists: false,
        });
      }

      return items;
    }, [query, pages]);

    const items = getItems();

    useEffect(() => {
      queueMicrotask(() => setSelectedIndex(0));
    }, [query]);

    const selectItem = useCallback(
      (index: number) => {
        const item = items[index];
        if (item) {
          onSelect(item);
        }
      },
      [items, onSelect],
    );

    useImperativeHandle(ref, () => ({
      onKeyDown: (event: KeyboardEvent) => {
        if (event.key === "ArrowUp") {
          setSelectedIndex((prev) => (prev <= 0 ? items.length - 1 : prev - 1));
          return true;
        }

        if (event.key === "ArrowDown") {
          setSelectedIndex((prev) => (prev >= items.length - 1 ? 0 : prev + 1));
          return true;
        }

        if (event.key === "Enter") {
          selectItem(selectedIndex);
          return true;
        }

        if (event.key === "Escape") {
          onClose();
          return true;
        }

        return false;
      },
    }));

    if (items.length === 0) {
      return null;
    }

    return (
      <div
        data-testid="tag-suggestion"
        className="shadow-elevated animate-fade-in border-border bg-popover max-w-[300px] min-w-[200px] overflow-hidden rounded-lg border"
      >
        <div className="p-1">
          {items.map((item, index) => (
            <button
              key={item.id}
              onClick={() => selectItem(index)}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors",
                index === selectedIndex ? "bg-accent text-accent-foreground" : "hover:bg-muted",
              )}
            >
              {item.exists ? (
                <Hash className="text-muted-foreground h-4 w-4 shrink-0" />
              ) : (
                <Plus className="text-primary h-4 w-4 shrink-0" />
              )}
              <span className="truncate">
                {item.exists ? `#${item.name}` : `"#${item.name}" を作成`}
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  },
);

TagSuggestion.displayName = "TagSuggestion";
