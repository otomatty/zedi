/**
 * Y.Doc → TipTap JSON (ProseMirror Doc) 変換ユーティリティ
 * Utility to convert Y.Doc XML fragments into TipTap-compatible ProseMirror JSON.
 */
import * as Y from "yjs";

/**
 * Y.XmlFragment を TipTap JSON (ProseMirror Doc) に変換する。
 * Converts a Y.XmlFragment into TipTap-compatible ProseMirror JSON.
 *
 * ルート直下の XmlText は paragraph でラップする（フラグメントにブロックが必須なため）。
 * Top-level XmlText is wrapped in a paragraph (fragment must contain blocks).
 */
export function yXmlFragmentToTiptapJson(fragment: Y.XmlFragment): Record<string, unknown> {
  const children: Record<string, unknown>[] = [];
  for (let i = 0; i < fragment.length; i++) {
    const child = fragment.get(i);
    if (child instanceof Y.XmlText) {
      const inlines = textToInlineNodes(child);
      if (inlines.length > 0) {
        children.push({ type: "paragraph", content: inlines });
      }
    } else {
      const node = yXmlElementToJson(child);
      if (node) children.push(node);
    }
  }
  return { type: "doc", content: children.length > 0 ? children : [{ type: "paragraph" }] };
}

/**
 * Y.XmlElement / Y.XmlText を ProseMirror ノードに変換する。
 * Converts a Y.XmlElement or Y.XmlText into a ProseMirror node.
 *
 * XmlText がブロック要素の子の場合はインライン（text ノード）の配列として返すため、
 * 親の `content` にそのままマージする。ルート直下の XmlText は
 * `yXmlFragmentToTiptapJson` で paragraph に包む。
 */
export function yXmlElementToJson(
  element: Y.XmlElement | Y.XmlText | Y.AbstractType<unknown>,
): Record<string, unknown> | null {
  if (element instanceof Y.XmlText) {
    const inlines = textToInlineNodes(element);
    if (inlines.length === 0) return null;
    return { type: "paragraph", content: inlines };
  }
  if (element instanceof Y.XmlElement) {
    const nodeName = element.nodeName;
    const attrs = element.getAttributes();
    const children: Record<string, unknown>[] = [];

    for (let i = 0; i < element.length; i++) {
      const child = element.get(i);
      if (child instanceof Y.XmlText) {
        const inlines = textToInlineNodes(child);
        for (const inline of inlines) {
          children.push(inline);
        }
      } else {
        const node = yXmlElementToJson(child);
        if (node) children.push(node);
      }
    }

    const result: Record<string, unknown> = { type: nodeName };
    if (Object.keys(attrs).length > 0) result.attrs = attrs;
    if (children.length > 0) result.content = children;
    return result;
  }
  return null;
}

/**
 * Y.XmlText を ProseMirror インライン（text ノード）の配列に変換する。
 * Converts Y.XmlText to an array of ProseMirror inline (text) nodes.
 */
export function textToInlineNodes(text: Y.XmlText): Record<string, unknown>[] {
  const delta = text.toDelta();
  if (!delta || delta.length === 0) return [];

  return delta.map((op: { insert?: string; attributes?: Record<string, unknown> }) => {
    const mark: Record<string, unknown> = { type: "text", text: op.insert ?? "" };
    if (op.attributes) {
      mark.marks = Object.entries(op.attributes)
        .filter(([, v]) => v)
        .map(([type, attrs]) => {
          if (typeof attrs === "boolean") return { type };
          return { type, attrs };
        });
    }
    return mark;
  });
}

/**
 * @deprecated テスト互換用。通常は `textToInlineNodes` と親の paragraph を使う。
 * Test-only convenience: wraps inline nodes in a paragraph.
 */
export function textToJson(text: Y.XmlText): Record<string, unknown> | null {
  const inlines = textToInlineNodes(text);
  if (inlines.length === 0) return null;
  return { type: "paragraph", content: inlines };
}
