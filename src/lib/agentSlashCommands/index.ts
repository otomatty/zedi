/**
 * Agent slash commands (Tiptap `/` + Claude Code sidecar, Issue #460).
 * エージェントスラッシュコマンド（Issue #460）。
 */

export type {
  AgentSlashCommandId,
  AgentSlashPromptCaptures,
  SlashAgentInsertPosition,
} from "./types";
export {
  registerSlashAgentCommandHook,
  getSlashAgentCommandHook,
  type SlashAgentCommandHook,
  type SlashAgentCommandHookContext,
} from "./hook";
export { readSlashAgentInsertPosition, writeSlashAgentInsertPosition } from "./insertPosition";
export {
  AGENT_SLASH_PREFIXES,
  extractArgsAfterPrefix,
  matchAgentSlashByQuery,
  resolveArgsForSelectedAgent,
  shouldOfferPathCompletion,
  PATH_COMPLETABLE_AGENT_IDS,
} from "./parseAgentSlashQuery";
export { executeAgentSlashCommand } from "./executeAgentSlashCommand";
