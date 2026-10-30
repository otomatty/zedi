import type { PageListItem } from "../../shared/types";

/**
 * Offline fallback for search: matches the pages already loaded on this device by title and
 * preview (the server's full-text index is not available offline).
 * 検索のオフライン代替。端末に読み込み済みのページをタイトルとプレビューで照合する。
 */
export function searchLoadedPages(
  pages: readonly PageListItem[],
  query: string,
  limit = 20,
): PageListItem[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const seen = new Set<string>();
  const hits: PageListItem[] = [];
  for (const page of pages) {
    if (hits.length >= limit) break;
    if (seen.has(page.id)) continue;
    if (!`${page.title}\n${page.preview}`.toLowerCase().includes(needle)) continue;
    seen.add(page.id);
    hits.push(page);
  }
  return hits;
}
