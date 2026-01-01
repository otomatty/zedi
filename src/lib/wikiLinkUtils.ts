/**
 * WikiLink関連のユーティリティ関数
 * ページ内のWikiLinkの解析と状態更新を行う
 */

export interface WikiLinkInfo {
  title: string;
  exists: boolean;
  referenced: boolean;
}

/**
 * Tiptap JSONコンテンツからWikiLinkを抽出する
 */
export function extractWikiLinksFromContent(content: string): WikiLinkInfo[] {
  if (!content) return [];

  try {
    const parsed = JSON.parse(content);
    const wikiLinks: WikiLinkInfo[] = [];

    const traverse = (node: unknown) => {
      if (!node || typeof node !== "object") return;

      const n = node as Record<string, unknown>;

      // Check marks for wikiLink
      if (Array.isArray(n.marks)) {
        for (const mark of n.marks) {
          if (
            mark &&
            typeof mark === "object" &&
            (mark as Record<string, unknown>).type === "wikiLink"
          ) {
            const attrs = (mark as Record<string, unknown>).attrs as
              | Record<string, unknown>
              | undefined;
            if (attrs?.title) {
              wikiLinks.push({
                title: attrs.title as string,
                exists: Boolean(attrs.exists),
                referenced: Boolean(attrs.referenced),
              });
            }
          }
        }
      }

      // Traverse children
      if (Array.isArray(n.content)) {
        for (const child of n.content) {
          traverse(child);
        }
      }
    };

    traverse(parsed);
    return wikiLinks;
  } catch {
    return [];
  }
}

/**
 * Tiptap JSONコンテンツ内のWikiLinkの属性を更新する
 * @param content 元のTiptap JSONコンテンツ
 * @param pageTitles 存在するページのタイトルセット（小文字正規化済み）
 * @param referencedTitles 他ページから参照されているリンクテキストのセット（小文字正規化済み）
 * @returns 更新されたコンテンツと変更があったかどうか
 */
export function updateWikiLinkAttributes(
  content: string,
  pageTitles: Set<string>,
  referencedTitles: Set<string>
): { content: string; hasChanges: boolean } {
  if (!content) return { content, hasChanges: false };

  try {
    const parsed = JSON.parse(content);
    let hasChanges = false;

    const traverse = (node: unknown): unknown => {
      if (!node || typeof node !== "object") return node;

      const n = { ...(node as Record<string, unknown>) };

      // Check marks for wikiLink
      if (Array.isArray(n.marks)) {
        n.marks = n.marks.map((mark) => {
          if (
            mark &&
            typeof mark === "object" &&
            (mark as Record<string, unknown>).type === "wikiLink"
          ) {
            const attrs = (mark as Record<string, unknown>).attrs as
              | Record<string, unknown>
              | undefined;
            if (attrs?.title) {
              const normalizedTitle = (attrs.title as string)
                .toLowerCase()
                .trim();
              const newExists = pageTitles.has(normalizedTitle);
              const newReferenced = referencedTitles.has(normalizedTitle);

              // 状態が変わった場合のみ更新
              if (
                attrs.exists !== newExists ||
                attrs.referenced !== newReferenced
              ) {
                hasChanges = true;
                return {
                  ...mark,
                  attrs: {
                    ...attrs,
                    exists: newExists,
                    referenced: newReferenced,
                  },
                };
              }
            }
          }
          return mark;
        });
      }

      // Traverse children
      if (Array.isArray(n.content)) {
        n.content = n.content.map(traverse);
      }

      return n;
    };

    const updated = traverse(parsed);
    return {
      content: JSON.stringify(updated),
      hasChanges,
    };
  } catch {
    return { content, hasChanges: false };
  }
}

/**
 * WikiLinkのタイトルリストから重複を除いてユニークなリストを返す
 */
export function getUniqueWikiLinkTitles(wikiLinks: WikiLinkInfo[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const link of wikiLinks) {
    const normalized = link.title.toLowerCase().trim();
    if (!seen.has(normalized)) {
      seen.add(normalized);
      result.push(link.title);
    }
  }

  return result;
}
