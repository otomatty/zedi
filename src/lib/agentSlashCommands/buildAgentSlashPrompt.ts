/**
 * Builds Claude Code prompts for agent slash commands (Issue #460).
 * Issue #460 向け Claude Code プロンプトを組み立てる。
 */

import type { Editor } from "@tiptap/core";
import type { AgentSlashCommandId, AgentSlashPromptCaptures } from "./types";
import {
  buildAnalyzePrompt,
  buildExplainPrompt,
  buildGitSummaryPrompt,
  buildResearchPrompt,
  buildReviewPrompt,
  buildRunPrompt,
  buildSummarizePrompt,
  buildTestPrompt,
} from "./buildAgentSlashPromptParts";

export type { AgentSlashPromptCaptures } from "./types";
export { getEditorPlainText, getEditorSelectionText } from "./agentSlashEditorText";

/**
 * Builds the user prompt for the given agent slash command.
 * エージェントスラッシュコマンド用のユーザープロンプトを組み立てる。
 */
export function buildAgentSlashPrompt(
  id: AgentSlashCommandId,
  args: string,
  editor: Editor,
  captures?: AgentSlashPromptCaptures,
): string {
  const trimmedArgs = args.trim();

  switch (id) {
    case "agent-analyze":
      return buildAnalyzePrompt(trimmedArgs);
    case "agent-git-summary":
      return buildGitSummaryPrompt();
    case "agent-run":
      return buildRunPrompt(trimmedArgs);
    case "agent-research":
      return buildResearchPrompt(trimmedArgs);
    case "agent-review":
      return buildReviewPrompt(trimmedArgs);
    case "agent-test":
      return buildTestPrompt(trimmedArgs);
    case "agent-explain":
      return buildExplainPrompt(editor, captures);
    case "agent-summarize":
      return buildSummarizePrompt(editor, captures);
    default: {
      const _exhaustive: never = id;
      return String(_exhaustive);
    }
  }
}

/**
 * Tool policy per command (narrow Bash when possible).
 * コマンドごとのツール方針（可能なら Bash のみに絞る）。
 */
export function getAgentSlashClaudeOptions(id: AgentSlashCommandId): {
  maxTurns: number;
  allowedTools?: string[];
} {
  switch (id) {
    case "agent-explain":
      return { maxTurns: 8, allowedTools: [] };
    case "agent-git-summary":
      return { maxTurns: 10, allowedTools: ["Bash"] };
    case "agent-run":
      return { maxTurns: 12, allowedTools: ["Bash"] };
    case "agent-test":
      return { maxTurns: 18, allowedTools: ["Bash", "Read"] };
    default:
      return { maxTurns: 20 };
  }
}
