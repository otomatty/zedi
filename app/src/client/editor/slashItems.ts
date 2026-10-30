/** A command offered by the `/` slash menu. */
export interface SlashItem {
  id: "heading1" | "heading2" | "bulletList" | "codeBlock" | "blockquote" | "divider";
  title: string;
  keywords: string[];
}

/** All slash commands in display order. */
export const SLASH_ITEMS: readonly SlashItem[] = [
  { id: "heading1", title: "見出し 1", keywords: ["h1", "heading"] },
  { id: "heading2", title: "見出し 2", keywords: ["h2", "heading"] },
  { id: "bulletList", title: "箇条書き", keywords: ["list", "bullet", "ul"] },
  { id: "codeBlock", title: "コードブロック", keywords: ["code", "pre"] },
  { id: "blockquote", title: "引用", keywords: ["quote", "blockquote"] },
  { id: "divider", title: "区切り線", keywords: ["hr", "divider"] },
];

/**
 * Filters slash commands by title or keyword (case-insensitive, prefix on keywords).
 * タイトルの部分一致またはキーワードの前方一致で絞り込む。
 */
export function filterSlashItems(query: string): SlashItem[] {
  const needle = query.trim().toLowerCase();
  if (needle === "") return [...SLASH_ITEMS];
  return SLASH_ITEMS.filter(
    (item) =>
      item.title.toLowerCase().includes(needle) || item.keywords.some((k) => k.startsWith(needle)),
  );
}
