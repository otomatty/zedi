import { forwardRef, useEffect, useImperativeHandle, useState, useCallback } from "react";
import { cn } from "@zedi/ui";
import { FileText, Plus } from "lucide-react";

/**
 * WikiLink サジェストに表示する 1 アイテム。`exists=true` は既存ページ、
 * `exists=false` は「このタイトルで新規作成」オプションを示す。
 * One item rendered in the WikiLink suggestion dropdown; `exists=false` marks
 * the "create new" option.
 */
export interface SuggestionItem {
  id: string;
  title: string;
  exists: boolean;
}

/**
 * `WikiLinkSuggestion` が候補リストの組み立てに使う最小ページ情報。
 * Minimal page shape consumed by `WikiLinkSuggestion`.
 */
export interface WikiLinkSuggestionPage {
  id: string;
  title: string;
  isDeleted?: boolean;
}

/**
 * `WikiLinkSuggestion` の props。本コンポーネントは
 *
 * - 本文中の `[[` サジェスト（`WikiLinkSuggestionLayer`、絶対配置）
 * - FAB 横のリンク入力バー（#924 §2、固定配置）
 *
 * の両方で再利用するため、マウント位置（fixed / absolute）や
 * Editor / ProseMirror の range などの呼び出し元コンテキストには一切
 * 依存しない。確定処理（範囲置換 / リンク挿入 / 入力バークリア）は
 * すべて `onSelect` の呼び出し側に委ねる。
 *
 * Props for `WikiLinkSuggestion`. Kept deliberately free of editor /
 * range / positioning concerns so the same component can back both the
 * in-body `[[` suggestion (absolutely positioned over the editor) and
 * the FAB-adjacent input bar (#924 §2, fixed near the keyboard). The
 * host owns mounting + post-select side effects (range replacement,
 * link insertion, clearing the input bar). See issue #925.
 */
interface WikiLinkSuggestionProps {
  /**
   * 現在の入力クエリ。`[[` サジェストの場合は `[[` の後ろのテキスト、入力バー
   * の場合は入力欄の値をそのまま渡す。
   * Current input query — the text after `[[` for the in-body popup, or
   * the input bar value verbatim.
   */
  query: string;
  /**
   * 候補行 / 「新規作成」行が確定したときに呼ばれる。`item.exists` で既存
   * ページか新規作成かを判別する。
   * Invoked when an existing or create-new row is confirmed; `item.exists`
   * distinguishes the two branches.
   */
  onSelect: (item: SuggestionItem) => void;
  /**
   * Escape などでサジェストを閉じたいときに呼ばれる。クローズ後の挙動は
   * 呼び出し側に任せる（プラグイン状態のリセット、入力バーのフォーカス制御等）。
   * Fired when the popup should close. Host decides what closing means
   * (plugin meta reset for the editor host; input-bar blur for the bar).
   */
  onClose: () => void;
  /**
   * サジェスト候補として渡されるページ一覧。呼び出し側で WikiLink のスコープ
   * （個人ページ / 同じノート内のページ）に合わせて絞り込んで渡す。
   * Issue #713 Phase 4。
   *
   * Candidate pages supplied by the caller. The caller is responsible for
   * scoping (personal-only vs. same-note) so this component can stay a pure
   * presentation layer. See issue #713 Phase 4.
   */
  pages: WikiLinkSuggestionPage[];
}

/**
 * `onKeyDown` が `true` を返すと呼び出し元は既定のキーハンドラを抑止する。
 * Imperative handle exposing `onKeyDown`; returning `true` tells the caller
 * to suppress the default key handling.
 */
export interface WikiLinkSuggestionHandle {
  onKeyDown: (event: KeyboardEvent) => boolean;
}

/**
 * WikiLink サジェストポップアップ。`pages` で受け取った候補のうちクエリに
 * マッチするものを最大 5 件表示し、完全一致が無ければ「新規作成」項目も出す。
 * Issue #713 Phase 4（スコープは呼び出し側で事前に絞る）。
 *
 * WikiLink suggestion popup. Renders up to five candidates matching the
 * query and, when there is no exact match, a "create new" option. Scope
 * filtering (personal vs. same-note) is expected to happen in the caller
 * before pages are passed in (see issue #713 Phase 4).
 */
export const WikiLinkSuggestion = forwardRef<WikiLinkSuggestionHandle, WikiLinkSuggestionProps>(
  ({ query, onSelect, onClose, pages }, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0);

    // Get matching pages
    const getItems = useCallback((): SuggestionItem[] => {
      const normalizedQuery = query.toLowerCase().trim();

      // Get existing pages that match
      const matchingPages = pages
        .filter((p) => !p.isDeleted && p.title.toLowerCase().includes(normalizedQuery))
        .slice(0, 5)
        .map((p) => ({
          id: p.id,
          title: p.title || "無題のページ",
          exists: true,
        }));

      // If query doesn't match any existing page exactly, add create option
      const exactMatch = pages.find(
        (p) => !p.isDeleted && p.title.toLowerCase() === normalizedQuery,
      );

      const items: SuggestionItem[] = [...matchingPages];

      if (query.trim() && !exactMatch) {
        items.push({
          id: "create-new",
          title: query.trim(),
          exists: false,
        });
      }

      return items;
    }, [query, pages]);

    const items = getItems();

    // Reset selection when items change
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
        data-testid="wiki-link-suggestion"
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
                <FileText className="text-muted-foreground h-4 w-4 shrink-0" />
              ) : (
                <Plus className="text-primary h-4 w-4 shrink-0" />
              )}
              <span className="truncate">
                {item.exists ? item.title : `"${item.title}" を作成`}
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  },
);

WikiLinkSuggestion.displayName = "WikiLinkSuggestion";
