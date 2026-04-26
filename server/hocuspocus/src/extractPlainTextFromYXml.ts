import * as Y from "yjs";

/**
 * TipTap / ProseMirror のマーク相当で、Y.Xml 上に子要素として現れるインライン名。
 * 兄弟インライン間では改行ではなくスペースを挟み、プレビュー用テキストの不自然な改行を防ぐ。
 *
 * Mark-like XmlElement names in the Y.Xml tree; use a space (not a newline) between
 * inline siblings so plain-text extraction does not split words (e.g. `Hello world!`).
 */
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

/**
 * インライン要素かどうかを nodeName で判定する。
 * Determine whether an XmlElement is inline-only (no trailing newline after its subtree).
 */
function isInlineXmlElement(node: Y.XmlElement): boolean {
  return INLINE_XML_ELEMENT_NAMES.has(node.nodeName);
}

/**
 * Y.Doc の XmlFragment（または XmlElement 根）からプレーンテキストを再帰的に抽出する。
 * `Y.XmlText.toString()` / `toJSON()` は `<bold>` 等の HTML タグを返すため、
 * `toDelta()` を使い `insert` 文字列のみを連結する。
 *
 * Recursively extract plain text from a Y.XmlFragment or Y.XmlElement subtree.
 * Uses `toDelta()` instead of `toString()` / `toJSON()` because the latter
 * returns HTML-like tags (`<bold>`, `<italic>`, etc.) for formatted text.
 */
export function extractTextFromYXml(node: Y.XmlFragment | Y.XmlElement): string {
  let text = "";

  for (let i = 0; i < node.length; i++) {
    const child = node.get(i);
    if (child instanceof Y.XmlText) {
      // toDelta() を使い書式属性なしの純粋なテキストのみを抽出する。
      // Use toDelta() to extract pure text without formatting attributes.
      for (const op of child.toDelta()) {
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
 * プレビュー文字列の最大長（DB の content_preview と一致させる）。
 * Max length for content preview (aligned with `pages.content_preview`).
 */
export const CONTENT_PREVIEW_MAX_LENGTH = 120;

/**
 * プレーンテキストからコンテンツプレビュー（先頭120文字）を生成する。
 * Generate content preview (first 120 chars) from plain text.
 */
export function buildContentPreview(text: string): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  if (trimmed.length <= CONTENT_PREVIEW_MAX_LENGTH) return trimmed;
  const headLength = Math.max(0, CONTENT_PREVIEW_MAX_LENGTH - 3);
  return `${trimmed.slice(0, headLength).trim()}...`;
}
