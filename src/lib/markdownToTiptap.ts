/**
 * Markdown → Tiptap JSON 変換の共通モジュール。
 * wikiGenerator と aiChatActionHelpers の両方で利用。
 *
 * 見出しの方針:
 * - `# X` は **本文の見出しに変換しない**（ページの h1 はタイトル input が担うため、`# X` を
 *   書いた行はそのまま `# X` というテキストの paragraph として残す）。これにより、
 *   `markdownExport.ts` の `"#".repeat(level)` と round-trip が対称になる。
 * - `## / ### / #### / #####` → Tiptap level 2/3/4/5 にそれぞれ対応する。
 *
 * Heading policy:
 * - `# X` is **not** converted into a body heading; the page h1 lives in the title field, so
 *   any line starting with `# ` is preserved verbatim as a `# X` paragraph. This keeps the
 *   import side symmetric with `markdownExport.ts`'s `"#".repeat(level)` output.
 * - `## / ### / #### / #####` map to Tiptap heading levels 2/3/4/5 respectively.
 */

import { parseInlineContent, type TiptapTextNode } from "./markdownToTiptapHelpers";

type TiptapBlockNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: Array<TiptapBlockNode | TiptapTextNode>;
};

/**
 * Markdown 文字列を Tiptap JSON（`doc`）へ変換し、文字列化して返す。
 * Convert a Markdown string to a Tiptap `doc` JSON and return its serialized form.
 *
 * @param markdown - 入力 Markdown / Source Markdown text.
 * @returns Tiptap doc JSON を `JSON.stringify` した文字列 / Serialized Tiptap doc JSON.
 */
export function convertMarkdownToTiptapContent(markdown: string): string {
  const normalized = markdown.replace(/\r\n?/g, "\n");
  const lines = normalized.endsWith("\n")
    ? normalized.slice(0, -1).split("\n")
    : normalized.split("\n");
  const doc: { type: "doc"; content: TiptapBlockNode[] } = {
    type: "doc",
    content: [],
  };

  for (const line of lines) {
    if (line.trim() === "") {
      doc.content.push({ type: "paragraph" });
      continue;
    }

    if (line.startsWith("##### ")) {
      doc.content.push({
        type: "heading",
        attrs: { level: 5 },
        content: parseInlineContent(line.slice(6)),
      });
      continue;
    }

    if (line.startsWith("#### ")) {
      doc.content.push({
        type: "heading",
        attrs: { level: 4 },
        content: parseInlineContent(line.slice(5)),
      });
      continue;
    }

    if (line.startsWith("### ")) {
      doc.content.push({
        type: "heading",
        attrs: { level: 3 },
        content: parseInlineContent(line.slice(4)),
      });
      continue;
    }

    if (line.startsWith("## ")) {
      doc.content.push({
        type: "heading",
        attrs: { level: 2 },
        content: parseInlineContent(line.slice(3)),
      });
      continue;
    }

    // `# X` は本文 h1 として変換しない: ページのタイトル input が h1 を担うため、
    // 該当行はそのまま `# X` というテキストを含む paragraph として残し、後段の
    // 既定パラグラフ分岐に委ねる。
    // `# X` is intentionally NOT converted into a body heading; the page title field is the
    // canonical h1, so the line falls through to the default paragraph branch and survives
    // verbatim as a `# X` text paragraph.

    if (line.startsWith("- ") || line.startsWith("* ")) {
      const listItem: TiptapBlockNode = {
        type: "listItem",
        content: [
          {
            type: "paragraph",
            content: parseInlineContent(line.slice(2)),
          },
        ],
      };

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
