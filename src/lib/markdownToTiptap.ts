/**
 * Markdown → Tiptap JSON 変換の共通モジュール。
 * wikiGenerator と aiChatActionHelpers の両方で利用。
 * 見出し: `#/##/###` は body 上で level 2/3/4（h1 はページタイトル用で本文外）に対応する
 * / Headings: map `#/##/###` to Tiptap levels 2/3/4; the page h1 is the title field, not the doc
 */

import { parseInlineContent, type TiptapTextNode } from "./markdownToTiptapHelpers";

type TiptapBlockNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: Array<TiptapBlockNode | TiptapTextNode>;
};

/**
 *
 */
export function convertMarkdownToTiptapContent(markdown: string): string {
  /**
   *
   */
  const normalized = markdown.replace(/\r\n?/g, "\n");
  /**
   *
   */
  const lines = normalized.endsWith("\n")
    ? normalized.slice(0, -1).split("\n")
    : normalized.split("\n");
  /**
   *
   */
  const doc: { type: "doc"; content: TiptapBlockNode[] } = {
    type: "doc",
    content: [],
  };

  for (/**
   *
   */
  const line of lines) {
    if (line.trim() === "") {
      doc.content.push({ type: "paragraph" });
      continue;
    }

    if (line.startsWith("### ")) {
      doc.content.push({
        type: "heading",
        attrs: { level: 4 },
        content: parseInlineContent(line.slice(4)),
      });
      continue;
    }

    if (line.startsWith("## ")) {
      doc.content.push({
        type: "heading",
        attrs: { level: 3 },
        content: parseInlineContent(line.slice(3)),
      });
      continue;
    }

    if (line.startsWith("# ")) {
      doc.content.push({
        type: "heading",
        attrs: { level: 2 },
        content: parseInlineContent(line.slice(2)),
      });
      continue;
    }

    if (line.startsWith("- ") || line.startsWith("* ")) {
      /**
       *
       */
      const listItem: TiptapBlockNode = {
        type: "listItem",
        content: [
          {
            type: "paragraph",
            content: parseInlineContent(line.slice(2)),
          },
        ],
      };

      /**
       *
       */
      const lastNode = doc.content[doc.content.length - 1];
      if (lastNode?.type === "bulletList") {
        if (!lastNode.content) lastNode.content = [];
        lastNode.content.push(listItem);
      } else {
        doc.content.push({
          type: "bulletList",
          content: [listItem],
        });
      }
      continue;
    }

    doc.content.push({
      type: "paragraph",
      content: parseInlineContent(line),
    });
  }

  return JSON.stringify(doc);
}
