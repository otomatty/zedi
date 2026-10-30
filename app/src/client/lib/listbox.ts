/** An option shown in a listbox / command palette. */
export interface ListItem {
  id: string;
  label: string;
}

/**
 * Case-insensitive filter that ranks prefix matches before substring matches.
 * 大文字小文字を区別せず絞り込み、前方一致を部分一致より先に並べる。
 */
export function filterItems<T extends ListItem>(
  items: readonly T[],
  query: string,
  limit = 50,
): T[] {
  const needle = query.trim().toLowerCase();
  if (needle === "") return items.slice(0, limit);
  const prefix: T[] = [];
  const contains: T[] = [];
  for (const item of items) {
    const label = item.label.toLowerCase();
    if (label.startsWith(needle)) prefix.push(item);
    else if (label.includes(needle)) contains.push(item);
  }
  return [...prefix, ...contains].slice(0, limit);
}

/**
 * Moves the active index by `delta`, wrapping at both ends (-1 when the list is empty).
 * アクティブ位置を `delta` だけ動かし、両端で折り返す（空なら -1）。
 */
export function moveActive(index: number, delta: number, length: number): number {
  if (length === 0) return -1;
  return (((index + delta) % length) + length) % length;
}
