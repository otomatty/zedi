import { useEffect, useState } from "hono/jsx/dom";
import type { PageListItem } from "../../shared/types";
import { useQuery } from "../lib/query";
import { CommandPalette } from "./CommandPalette";

/** Search results; `offline` marks a local match over pages this device has loaded. */
export interface SearchResult {
  items: PageListItem[];
  offline: boolean;
}

/** Debounces a fast-changing value (palette input) before it hits the search API. */
function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

/**
 * ⌘K page search. It owns the query, so closing the palette (which unmounts it) forgets the
 * previous search and reopening starts empty.
 * ⌘K のページ検索。入力を自分で持つため、閉じると前回の検索を忘れ、開き直すと空から始まる。
 */
export function SearchPalette(props: {
  search(query: string): Promise<SearchResult>;
  online: boolean;
  onSelect(page: { id: string }): void;
  onClose(): void;
}) {
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounced(query.trim(), 150);
  const results = useQuery({
    queryKey: ["search", debouncedQuery],
    queryFn: () => props.search(debouncedQuery),
    staleTime: 10_000,
  });
  const items = (results.data?.items ?? []).map((p) => ({ id: p.id, label: p.title }));

  return (
    <CommandPalette
      open
      items={items}
      filterLocally={false}
      placeholder={
        props.online
          ? "全文検索（3 文字以上は索引、2 文字以下は部分一致）"
          : "オフライン検索（読み込み済みページのタイトルと冒頭のみ）"
      }
      onQueryChange={setQuery}
      onClose={props.onClose}
      onSelect={props.onSelect}
    />
  );
}
