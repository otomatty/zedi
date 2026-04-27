/**
 * Inserts Markdown from agent slash commands into the Tiptap editor.
 * エージェントスラッシュの Markdown を Tiptap に挿入する。
 */

import type { Editor } from "@tiptap/core";
import { convertMarkdownToTiptapContent } from "@/lib/markdownToTiptap";
import type { SlashAgentInsertPosition } from "./types";

/**
 * Inserts Markdown at `insertAt` after the `/...` range was already removed.
 * `/...` 削除後の位置 `insertAt` に Markdown を挿入する。
 */
export function insertSlashAgentMarkdownAt(
  editor: Editor,
  insertAt: number,
  markdown: string,
  position: SlashAgentInsertPosition,
): void {
  const normalized = markdown.trim() || "(empty result)";
  let content: unknown[];
  try {
    // AI（エージェント）出力経路なので、先頭の `# Title` 行を落とす（issue #784）。
    // ページタイトル input と重複した literal paragraph を本文に残さないため。
    // AI (agent) output path: strip a leading `# Title` line so it does not duplicate the
    // page-title input as a literal paragraph in the body (issue #784).
    const docJson = JSON.parse(
      convertMarkdownToTiptapContent(normalized, { dropLeadingH1: true }),
    ) as {
      content?: unknown[];
    };
    content = Array.isArray(docJson.content) ? docJson.content : [];
  } catch {
    content = [
      {
        type: "paragraph",
        content: [{ type: "text", text: normalized }],
      },
    ];
  }

  if (position === "end") {
    const end = editor.state.doc.content.size;
    editor.chain().focus().insertContentAt(end, content).run();
    return;
  }

  editor.chain().focus().insertContentAt(insertAt, content).run();
}
