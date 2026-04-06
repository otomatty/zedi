/**
 * Optional hook for custom slash agent commands (future extension).
 * 将来拡張用のカスタムスラッシュエージェントコマンド用フック。
 */

import type { Editor } from "@tiptap/core";
import type { AgentSlashCommandId } from "./types";

/**
 * Context passed to {@link SlashAgentCommandHook}.
 * {@link SlashAgentCommandHook} に渡すコンテキスト。
 */
export interface SlashAgentCommandHookContext {
  /** Matched agent command id. / 一致したエージェントコマンド ID */
  commandId: AgentSlashCommandId;
  /** Text after the command prefix (trimmed). / コマンド接頭辞以降のテキスト */
  args: string;
  /** Full query after `/` (trimmed). / `/` 以降のクエリ全文 */
  query: string;
  editor: Editor;
}

/**
 * Return markdown to insert, or `null` to fall back to the built-in Claude prompt.
 * 挿入する Markdown を返す。`null` なら既定の Claude プロンプトにフォールバック。
 */
export type SlashAgentCommandHookResult = { markdown: string } | null;

/**
 * Custom handler invoked before the built-in Claude Code execution.
 * 組み込み Claude Code 実行の前に呼ばれるカスタムハンドラ。
 */
export type SlashAgentCommandHook = (
  ctx: SlashAgentCommandHookContext,
) => Promise<SlashAgentCommandHookResult> | SlashAgentCommandHookResult;

let registeredHook: SlashAgentCommandHook | null = null;

/**
 * Registers or clears the global hook (e.g. from a plugin layer).
 * グローバルフックを登録または解除する（プラグイン層などから）。
 */
export function registerSlashAgentCommandHook(hook: SlashAgentCommandHook | null): void {
  registeredHook = hook;
}

/**
 * Returns the current hook, if any.
 * 登録済みフックがあれば返す。
 */
export function getSlashAgentCommandHook(): SlashAgentCommandHook | null {
  return registeredHook;
}
