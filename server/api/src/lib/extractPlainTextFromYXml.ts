/**
 * Y.Doc / Y.Xml からプレーンテキストおよびコンテンツプレビューを抽出する
 * ユーティリティ。`server/hocuspocus/src/extractPlainTextFromYXml.ts` と
 * 同等の実装を意図的に複製している。
 *
 * Plain-text / preview extraction from Y.Doc trees. Intentionally mirrors
 * `server/hocuspocus/src/extractPlainTextFromYXml.ts` so the API server can
 * derive content text when it rewrites a Y.Doc server-side (issue #726).
 *
 * ⚠️ 変更時は Hocuspocus 側の同名ファイルも合わせて更新すること。両者は
 *    Bun workspace が分かれているため共有パッケージにはなっていない（CLAUDE.md
 *    参照）。
 * ⚠️ When editing, keep the Hocuspocus copy in sync — the two servers live
 *    in separate Bun projects and do not share a package (see CLAUDE.md).
 */

import * as Y from "yjs";

const INLINE_XML_ELEMENT_NAMES = new Set<string>([
  "bold",
  "italic",
  "strike",
  "code",
  "link",
  "underline",
  "highlight",
  "subscript",
  "superscript",
  "textStyle",
]);

function isInlineXmlElement(node: Y.XmlElement): boolean {
  return INLINE_XML_ELEMENT_NAMES.has(node.nodeName);
}

/**
 * Y.Doc の XmlFragment（または XmlElement 根）からプレーンテキストを再帰的に抽出する。
 * Recursively extract plain text from a Y.XmlFragment or Y.XmlElement subtree.
 */
export function extractTextFromYXml(node: Y.XmlFragment | Y.XmlElement): string {
  let text = "";

  // `node.get(i)` は O(i) なのでインデックスループは全体で O(N^2)。
  // `toArray()` は一度だけ O(N) で配列化できる（PR #736 レビュー参照）。
  // `node.get(i)` is O(i); iterating by index is O(N^2) total. `toArray()`
  // does a single O(N) pass — see PR #736 review comments.
  for (const child of node.toArray() as Array<Y.XmlElement | Y.XmlText>) {
    if (child instanceof Y.XmlText) {
      for (const op of child.toDelta() as Array<{ insert: unknown }>) {
        if (typeof op.insert === "string") {
          text += op.insert;
        }
      }
    } else if (child instanceof Y.XmlElement) {
      const inner = extractTextFromYXml(child);
      const suffix = isInlineXmlElement(child) ? " " : "\n";
      text += inner + suffix;
    }
  }
  return text;
}

/**
 * プレビュー文字列の最大長（`pages.content_preview` と一致）。
 * Max length for content preview (aligned with `pages.content_preview`).
 */
export const CONTENT_PREVIEW_MAX_LENGTH = 120;

/**
 * プレーンテキストからコンテンツプレビューを生成する。
 * Generate a content preview (first 120 chars) from plain text.
 */
export function buildContentPreview(text: string): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  if (trimmed.length <= CONTENT_PREVIEW_MAX_LENGTH) return trimmed;
  return trimmed.slice(0, CONTENT_PREVIEW_MAX_LENGTH).trim() + "...";
}
