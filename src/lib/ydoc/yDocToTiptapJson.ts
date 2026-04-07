/**
 * Y.Doc → TipTap JSON (ProseMirror Doc) 変換ユーティリティ
 * Utility to convert Y.Doc XML fragments into TipTap-compatible ProseMirror JSON.
 */
import * as Y from "yjs";

/**
 * Y.XmlFragment を TipTap JSON (ProseMirror Doc) に変換する。
 * Converts a Y.XmlFragment into TipTap-compatible ProseMirror JSON.
 */
export function yXmlFragmentToTiptapJson(fragment: Y.XmlFragment): Record<string, unknown> {
  const children = [];
  for (let i = 0; i < fragment.length; i++) {
    const child = fragment.get(i);
    const node = yXmlElementToJson(child);
    if (node) children.push(node);
  }
  return { type: "doc", content: children.length > 0 ? children : [{ type: "paragraph" }] };
}

/**
 * Y.XmlElement / Y.XmlText を ProseMirror ノードに変換する。
 * Converts a Y.XmlElement or Y.XmlText into a ProseMirror node.
 */
export function yXmlElementToJson(
  element: Y.XmlElement | Y.XmlText | Y.AbstractType<unknown>,
): Record<string, unknown> | null {
  if (element instanceof Y.XmlText) {
    return textToJson(element);
  }
  if (element instanceof Y.XmlElement) {
    const nodeName = element.nodeName;
    const attrs = element.getAttributes();
    const children: Record<string, unknown>[] = [];

    for (let i = 0; i < element.length; i++) {
      const child = element.get(i);
      const node = yXmlElementToJson(child);
      if (node) children.push(node);
    }

    const result: Record<string, unknown> = { type: nodeName };
    if (Object.keys(attrs).length > 0) result.attrs = attrs;
    if (children.length > 0) result.content = children;
    return result;
  }
  return null;
}

/**
 * Y.XmlText をテキストノード（ProseMirror paragraph）に変換する。
 * Converts Y.XmlText into a ProseMirror text node (paragraph).
 */
export function textToJson(text: Y.XmlText): Record<string, unknown> | null {
  const delta = text.toDelta();
  if (!delta || delta.length === 0) return null;

  const content = delta.map((op: { insert?: string; attributes?: Record<string, unknown> }) => {
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

  return { type: "paragraph", content };
}
