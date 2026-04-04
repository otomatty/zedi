/**
 * Agent slash command kinds (Tiptap `/` menu, Claude Code sidecar).
 * エージェント用スラッシュコマンド種別（Tiptap `/` メニュー・Claude Code）。
 */

/**
 * Stable ids for i18n keys and registry lookups.
 * i18n キーとレジストリ参照用の安定 ID。
 */
export type AgentSlashCommandId =
  | "agent-analyze"
  | "agent-git-summary"
  | "agent-run"
  | "agent-research"
  | "agent-review"
  | "agent-test"
  | "agent-explain"
  | "agent-summarize";

/**
 * Where to insert the model output into the note.
 * モデル出力をノートのどこに挿入するか。
 */
export type SlashAgentInsertPosition = "cursor" | "end";

/**
 * Text captured before deleting the `/…` range (selection / full note).
 * `/…` 削除前に取ったテキスト（選択／ノート全文）。
 */
export interface AgentSlashPromptCaptures {
  selectionText?: string;
  plainText?: string;
}
