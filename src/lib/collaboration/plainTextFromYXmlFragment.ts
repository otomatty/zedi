import * as Y from "yjs";

/**
 * TipTap / ProseMirror のマーク相当で、Y.Xml 上に子要素として現れるインライン名。
 * `server/hocuspocus/src/extractPlainTextFromYXml.ts` の `INLINE_XML_ELEMENT_NAMES` と同じ集合を保つこと。
 *
 * Mark-like XmlElement names; must stay aligned with
 * `server/hocuspocus/src/extractPlainTextFromYXml.ts` (`INLINE_XML_ELEMENT_NAMES`).
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
 * Determine whether an XmlElement is inline-only (trailing space after subtree, not newline).
 */
function isInlineXmlElement(node: Y.XmlElement): boolean {
  return INLINE_XML_ELEMENT_NAMES.has(node.nodeName);
}

/**
 * Y.Doc の XmlFragment（または XmlElement 根）からプレーンテキストを再帰的に抽出する。
 * `server/hocuspocus` の `extractTextFromYXml` と同じ走査・接尾辞ルール（インラインはスペース、ブロックは改行）。
 *
 * Recursively extract plain text matching `extractTextFromYXml` in `server/hocuspocus`.
 */
function extractTextFromYXml(node: Y.XmlFragment | Y.XmlElement): string {
  let text = "";

  for (let i = 0; i < node.length; i++) {
    const child = node.get(i);
    if (child instanceof Y.XmlText) {
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
 * ページの Y.Xml フラグメントからプレーンテキストを抽出する（クライアント側）。
 * `Y.XmlText.toString()` / `toJSON()` は書式を HTML 風タグで返すため使わず、`toDelta()` の
 * `insert` 文字列のみを集める。ブロック / インライン境界はサーバーと同じ `INLINE_XML_ELEMENT_NAMES` に依存する。
 *
 * Extract plain text from the page `Y.XmlFragment` on the client, aligned with the hocuspocus
 * `extractTextFromYXml` implementation for `content_text` / `content_preview` consistency.
 */
export function extractPlainTextFromYXmlFragment(fragment: Y.XmlFragment): string {
  return extractTextFromYXml(fragment).trim();
}
