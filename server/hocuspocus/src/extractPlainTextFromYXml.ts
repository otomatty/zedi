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
 * Recursively extract plain text from a Y.XmlFragment or Y.XmlElement subtree.
 */
export function extractTextFromYXml(node: Y.XmlFragment | Y.XmlElement): string {
  let text = "";

  for (let i = 0; i < node.length; i++) {
    const child = node.get(i);
    if (child instanceof Y.XmlText) {
      text += child.toString();
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
  return trimmed.slice(0, CONTENT_PREVIEW_MAX_LENGTH).trim() + "...";
}
