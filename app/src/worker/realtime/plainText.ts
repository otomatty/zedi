import * as Y from "yjs";

function inlineText(node: Y.XmlElement | Y.XmlText): string {
  if (node instanceof Y.XmlText) {
    return (node.toDelta() as { insert: unknown }[])
      .map((op) => (typeof op.insert === "string" ? op.insert : ""))
      .join("");
  }
  if (node.nodeName === "wikiLink") return `[[${String(node.getAttribute("title") ?? "")}]]`;
  if (node.nodeName === "hardBreak") return "\n";
  return node
    .toArray()
    .map((child) => inlineText(child as Y.XmlElement | Y.XmlText))
    .join("");
}

function isTextBlock(element: Y.XmlElement): boolean {
  return element
    .toArray()
    .some(
      (child) =>
        child instanceof Y.XmlText ||
        (child instanceof Y.XmlElement && child.nodeName === "wikiLink"),
    );
}

function collectBlocks(nodes: readonly unknown[], out: string[]): void {
  for (const node of nodes) {
    if (node instanceof Y.XmlText) out.push(inlineText(node));
    else if (node instanceof Y.XmlElement) {
      if (isTextBlock(node)) out.push(inlineText(node));
      else collectBlocks(node.toArray(), out);
    }
  }
}

/**
 * Plain text of a Tiptap/y-prosemirror document: one line per text block, marks dropped,
 * WikiLinks rendered as `[[title]]`. Used to keep D1's search index in sync.
 * Tiptap 文書のプレーンテキスト（ブロックごとに 1 行）。D1 の検索索引の更新に使う。
 */
export function extractPlainText(doc: Y.Doc, field = "default"): string {
  const blocks: string[] = [];
  collectBlocks(doc.getXmlFragment(field).toArray(), blocks);
  return blocks.filter((b) => b.trim() !== "").join("\n");
}

/**
 * Single-line preview: whitespace collapsed, truncated to `max` characters with an ellipsis.
 * 1 行プレビュー。空白を詰め、`max` 文字を超えたら省略記号で切る。
 */
export function toPreview(text: string, max = 120): string {
  const collapsed = text.replace(/\s+/gu, " ").trim();
  const chars = [...collapsed];
  return chars.length > max ? `${chars.slice(0, max - 1).join("")}…` : collapsed;
}
