/**
 * Runs one Claude Code sidecar query and returns the final assistant text.
 * Claude Code sidecar のクエリを 1 回実行し、最終アシスタントテキストを返す。
 *
 * Used by executable code blocks and similar flows that need a full result string.
 * 実行可能コードブロックなど、完全な結果文字列が必要なフローで使用する。
 *
 * Implemented via {@link streamClaudeQuery} without incremental callbacks.
 * {@link streamClaudeQuery} をチャンクコールバックなしで呼び出す実装。
 */

import type { ClaudeQueryOptions } from "./bridge";
import { streamClaudeQuery, type ClaudeQueryCompletionResult } from "./streamClaudeQuery";

export type { ClaudeQueryCompletionResult } from "./streamClaudeQuery";

/**
 * Sends `prompt` via the sidecar and resolves when the stream completes or errors.
 * `prompt` を sidecar 経由で送り、ストリーム完了またはエラーで解決する。
 */
export async function runClaudeQueryToCompletion(
  prompt: string,
  options?: ClaudeQueryOptions,
  signal?: AbortSignal,
): Promise<ClaudeQueryCompletionResult> {
  return streamClaudeQuery(prompt, options, signal, {});
}
