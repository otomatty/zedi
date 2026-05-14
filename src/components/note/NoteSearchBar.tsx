import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Input } from "@zedi/ui";
import { Search, X, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useInfiniteNoteSearch } from "@/hooks/useNoteQueries";

/**
 * `NoteSearchBar` の props。
 *
 * Props for {@link NoteSearchBar}.
 */
export interface NoteSearchBarProps {
  /** 検索対象ノートの ID。`pages.note_id = noteId` のページに限定される。 */
  noteId: string;
  /**
   * 入力 debounce のミリ秒。デフォルト 250ms。テストで 0 を渡すと即時実行
   * になり、debounce 待ちなしで挙動を確認できる。
   *
   * Debounce window in milliseconds; pass 0 in tests to skip the wait.
   */
  debounceMs?: number;
}

/**
 * 入力値を一定 ms 待ってから返す debounce フック。`setTimeout` ベースなので
 * `value` が短時間で変わっても、最後の値だけが反映される。`delayMs <= 0` の
 * ときは内部 state に格納せず引数の `value` をそのまま返し、effect 内での
 * 同期 setState による cascade re-render を回避する（lint: react-you-might-not-need-an-effect）。
 *
 * `useDebouncedValue` so the search input does not fire a request on every
 * keystroke. When `delayMs` is 0 (test path), bypass state altogether and
 * return the current value directly — avoids the "synchronous setState in
 * effect" cascade-render lint warning while keeping the test ergonomics.
 */
function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    if (delayMs <= 0) return;
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return delayMs <= 0 ? value : debounced;
}

/**
 * 巨大ノートでもスクロール一覧に頼らず目的のページへ辿り着けるよう、ノート
 * 詳細画面に常設するノートスコープ全文検索バー（issue #860 Phase 5）。
 * `useInfiniteNoteSearch` 経由で `GET /api/notes/:noteId/search` を叩き、
 * 結果をリンク一覧として描画する。空クエリ時は何も描画しない（通常の
 * `PageGrid` のレイアウトを邪魔しないため）。
 *
 * Note-scoped full-text search bar shown above the page grid (issue #860
 * Phase 5). Backed by `useInfiniteNoteSearch` against
 * `GET /api/notes/:noteId/search`. Renders nothing for an empty query so
 * the bar does not push the regular `PageGrid` down — only the input
 * stays visible.
 *
 * UX:
 * - Input is debounced (default 250ms) before issuing requests.
 * - Last result shows a "Show more" button when `hasNextPage` is true,
 *   following the rest of the codebase's "click-to-load" pattern instead
 *   of intersection-observer auto-fetch (matches `PageGrid` ergonomics
 *   for tail-loading).
 * - Each result links to `/notes/:noteId/:pageId` so navigation lands on
 *   the canonical note-page route.
 */
export function NoteSearchBar({ noteId, debounceMs = 250 }: NoteSearchBarProps): React.JSX.Element {
  const { t } = useTranslation();
  const [input, setInput] = useState("");
  const debounced = useDebouncedValue(input, debounceMs);
  const trimmed = debounced.trim();
  const inputRef = useRef<HTMLInputElement>(null);

  const { results, isLoading, isFetching, hasNextPage, isFetchingNextPage, fetchNextPage, error } =
    useInfiniteNoteSearch(noteId, trimmed, { enabled: trimmed.length > 0 });

  const showResults = trimmed.length > 0;

  // 入力欄の右側に出すクリアボタン: クエリと結果一覧を一気に消すため、
  // input を空にしてフォーカスを戻す。
  // Clear button: blanks the input and refocuses so the user can type again
  // without an extra click.
  const handleClear = () => {
    setInput("");
    inputRef.current?.focus();
  };

  // results は `useInfiniteNoteSearch` の flattened 配列。React Query の
  // 同一参照保証で再レンダーは抑えられるが、念のため key 用に id を memo 化。
  // `results` is the flattened infinite-query array. Memoize for keys
  // even though React Query keeps a stable reference.
  const ids = useMemo(() => results.map((r) => r.id), [results]);

  return (
    <div className="w-full">
      <div className="relative">
        <Search
          aria-hidden="true"
          className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2"
        />
        <Input
          ref={inputRef}
          type="search"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t("notes.search.placeholder")}
          aria-label={t("notes.search.ariaLabel")}
          className="pr-10 pl-9"
        />
        {input.length > 0 && (
          <button
            type="button"
            onClick={handleClear}
            aria-label={t("notes.search.clear")}
            className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2 rounded-sm p-1 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {showResults && (
        // gemini-code-assist review on PR #868: 検索結果は select 系の listbox
        // ではなく、ナビゲーション用リンクの一覧。`role="listbox"` / `role="option"`
        // を外し、`aria-label` を実際のリスト (`<ul>`) に載せ替えることで、
        // スクリーンリーダーが「選択ウィジェット」ではなく「リンクのリスト」と
        // して読み上げるようにする。空状態 / ローディング / 「もっと見る」など
        // リスト要素を内包しない補助 UI も同じコンテナに置くため、外側の
        // `<div>` は無 role のスタイリングコンテナのまま残す。
        //
        // PR #868 review (gemini-code-assist): search results are navigation
        // links, not a `listbox` selection widget. Drop `role="listbox"` /
        // `role="option"` and move `aria-label` onto the real `<ul>` so
        // screen readers announce a list of links instead of a select-like
        // widget. The outer `<div>` stays role-less because it also hosts
        // the loading / empty / load-more affordances around the list.
        <div className="border-border bg-card mt-3 max-h-[60vh] overflow-y-auto rounded-md border">
          {error && (
            <p className="text-destructive p-3 text-sm" role="alert">
              {t("notes.search.error")}
            </p>
          )}
          {!error && isLoading && (
            <div className="text-muted-foreground flex items-center gap-2 p-3 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>{t("notes.search.loading")}</span>
            </div>
          )}
          {!error && !isLoading && results.length === 0 && (
            <p className="text-muted-foreground p-3 text-sm">
              {t("notes.search.noResults", { query: trimmed })}
            </p>
          )}
          {!error && results.length > 0 && (
            <ul aria-label={t("notes.search.resultsLabel")} className="divide-border divide-y">
              {results.map((row, idx) => (
                <li key={ids[idx]}>
                  <Link
                    to={`/notes/${noteId}/${row.id}`}
                    className="hover:bg-muted block px-3 py-2 transition-colors"
                  >
                    <div className="text-foreground truncate text-sm font-medium">
                      {row.title?.trim() || t("notes.search.untitled")}
                    </div>
                    {row.content_preview && (
                      <div className="text-muted-foreground mt-0.5 line-clamp-2 text-xs">
                        {row.content_preview}
                      </div>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {!error && hasNextPage && (
            <div className="border-border border-t p-2">
              <button
                type="button"
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
                className="text-primary hover:bg-muted w-full rounded-sm px-2 py-1.5 text-sm transition-colors disabled:opacity-50"
              >
                {isFetchingNextPage ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    {t("notes.search.loadingMore")}
                  </span>
                ) : (
                  t("notes.search.loadMore")
                )}
              </button>
            </div>
          )}
          {!error && !hasNextPage && results.length > 0 && isFetching && !isLoading && (
            <div className="text-muted-foreground border-border border-t p-2 text-center text-xs">
              {t("notes.search.refreshing")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
