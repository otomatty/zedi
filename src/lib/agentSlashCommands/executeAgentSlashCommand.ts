/**
 * Runs one agent slash command via Claude Code and inserts the result.
 * Claude Code 経由でエージェントスラッシュを 1 回実行し、結果を挿入する。
 */

import type { Editor } from "@tiptap/core";
import { runClaudeQueryToCompletion } from "@/lib/claudeCode/runQueryToCompletion";
import {
  buildAgentSlashPrompt,
  getAgentSlashClaudeOptions,
  getEditorPlainText,
  getEditorSelectionText,
} from "./buildAgentSlashPrompt";
import { getSlashAgentCommandHook } from "./hook";
import { insertSlashAgentMarkdownAt } from "./insertSlashAgentMarkdown";
import { readSlashAgentInsertPosition } from "./insertPosition";
import type { AgentSlashCommandId } from "./types";
import { AGENT_SLASH_PREFIXES, resolveArgsForSelectedAgent } from "./parseAgentSlashQuery";

/**
 * Executes the agent command and inserts Markdown; returns error message or null on success.
 * エージェントコマンドを実行して Markdown を挿入する。成功時は null、失敗時はエラー文言。
 */
export async function executeAgentSlashCommand(options: {
  commandId: AgentSlashCommandId;
  query: string;
  editor: Editor;
  range: { from: number; to: number };
  signal?: AbortSignal;
}): Promise<string | null> {
  const { commandId, query, editor, range, signal } = options;

  const meta = AGENT_SLASH_PREFIXES.find((p) => p.id === commandId);
  const prefix = meta?.prefix ?? "";
  const args = resolveArgsForSelectedAgent(prefix, meta?.aliases, query);

  const insertAt = range.from;
  const selectionText = getEditorSelectionText(editor);
  const plainText = getEditorPlainText(editor);

  const hook = getSlashAgentCommandHook();
  if (hook) {
    const hooked = await hook({ commandId, args, query, editor });
    if (hooked) {
      editor.chain().focus().deleteRange(range).run();
      insertSlashAgentMarkdownAt(editor, insertAt, hooked.markdown, readSlashAgentInsertPosition());
      return null;
    }
  }

  editor.chain().focus().deleteRange(range).run();

  const prompt = buildAgentSlashPrompt(commandId, args, editor, { selectionText, plainText });
  const claudeOpts = getAgentSlashClaudeOptions(commandId);
  const result = await runClaudeQueryToCompletion(prompt, claudeOpts, signal);

  if (!result.ok) {
    editor
      .chain()
      .focus()
      .insertContentAt(insertAt, {
        type: "paragraph",
        content: [{ type: "text", text: `Claude Code: ${result.error}` }],
      })
      .run();
    return result.error;
  }

  insertSlashAgentMarkdownAt(editor, insertAt, result.content, readSlashAgentInsertPosition());
  return null;
}
