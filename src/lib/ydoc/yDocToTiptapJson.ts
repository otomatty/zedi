/**
 * Y.Doc → TipTap JSON (ProseMirror Doc) 変換ユーティリティ
 * Utility to convert Y.Doc XML fragments into TipTap-compatible ProseMirror JSON.
 */
import * as Y from "yjs";

/**
 * Content removed together with the desktop app may still be in old snapshots; previews
 * convert it to web nodes so the editor can render them.
 * デスクトップ版とともに削除した内容は古いスナップショットに残っている場合があるため、
 * プレビューでは Web 版のノードに変換する。
 */
const FILE_REFERENCE_MARK = /^fileReference(--.+)?$/;

const stringAttr = (el: Y.XmlElement, name: string): string => {
  const value = el.getAttribute(name) as unknown;
  return typeof value === "string" ? value : "";
};

const plainTextOf = (el: Y.XmlElement): string =>
  el
    .toArray()
    .map((child) =>
      child instanceof Y.XmlText
        ? (child.toDelta() as Array<{ insert?: unknown }>)
            .map((op) => (typeof op.insert === "string" ? op.insert : ""))
            .join("")
        : "",
    )
    .join("");

const textBlock = (type: string, text: string, attrs?: Record<string, unknown>) => ({
  type,
  ...(attrs ? { attrs } : {}),
  ...(text ? { content: [{ type: "text", text }] } : {}),
});

/** Web-schema nodes for a removed desktop-only node, or null for any other node. */
function desktopOnlyReplacement(el: Y.XmlElement): Record<string, unknown>[] | null {
  if (el.nodeName === "executableCodeBlock") {
    const output = [
      stringAttr(el, "stdout"),
      stringAttr(el, "stderr"),
      stringAttr(el, "errorMessage"),
    ]
      .filter((part) => part !== "")
      .join("\n");
    const code = textBlock("codeBlock", plainTextOf(el), {
      language: stringAttr(el, "language") || "bash",
    });
    return output ? [code, textBlock("codeBlock", output, { language: "text" })] : [code];
  }
  if (el.nodeName === "mcpResource") {
    const label = ["MCP:", stringAttr(el, "server"), stringAttr(el, "resource")]
      .filter(Boolean)
      .join(" ");
    const content = stringAttr(el, "resolvedContent");
    const paragraph = textBlock("paragraph", label);
    return content
      ? [paragraph, textBlock("codeBlock", content, { language: "text" })]
      : [paragraph];
  }
  return null;
}

/** Block nodes for a child element (a removed node may become two blocks). */
function blockNodesOf(child: Y.XmlElement | Y.AbstractType<unknown>): Record<string, unknown>[] {
  if (child instanceof Y.XmlElement) {
    const replacement = desktopOnlyReplacement(child);
    if (replacement) return replacement;
  }
  const node = yXmlElementToJson(child);
  return node ? [node] : [];
}

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
      children.push(...blockNodesOf(child));
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
        children.push(...blockNodesOf(child));
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
        .filter(([type, v]) => v && !FILE_REFERENCE_MARK.test(type))
        .map(([type, attrs]) => {
          if (typeof attrs === "boolean") return { type };
          return { type, attrs };
        });
    }
    return mark;
  });
}
