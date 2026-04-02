/**
 * Payload shapes for Tauri events emitted by the Claude Code sidecar bridge.
 * Claude Code sidecar ブリッジが発行する Tauri イベントのペイロード形。
 */

/** Emitted as {@link CLAUDE_STREAM_CHUNK_EVENT}. / {@link CLAUDE_STREAM_CHUNK_EVENT} として発行される。 */
export interface ClaudeStreamChunkPayload {
  type: "stream-chunk";
  id: string;
  content: string;
}

/** Emitted as {@link CLAUDE_STREAM_COMPLETE_EVENT}. / {@link CLAUDE_STREAM_COMPLETE_EVENT} として発行される。 */
export interface ClaudeStreamCompletePayload {
  type: "stream-complete";
  id: string;
  result: { content: string };
}

/** Emitted as {@link CLAUDE_ERROR_EVENT}. / {@link CLAUDE_ERROR_EVENT} として発行される。 */
export interface ClaudeErrorPayload {
  type?: string;
  id: string;
  error: string;
  code?: string;
  exitCode?: number | null;
  signal?: number | null;
}

/** Result of {@link claudeStatus} (sidecar `status-response`). / {@link claudeStatus} の結果（sidecar `status-response`）。 */
export interface ClaudeStatusResult {
  type: "status-response";
  correlationId: string;
  status: "idle" | "processing";
  activeQueryIds: string[];
}

/** Result of {@link checkClaudeInstallation} (sidecar `installation-status`). / {@link checkClaudeInstallation} の結果（sidecar `installation-status`）。 */
export interface ClaudeInstallationResult {
  type: "installation-status";
  correlationId: string;
  installed: boolean;
  version?: string;
}

/** Tauri event name for streaming assistant text chunks. / ストリーミングアシスタントテキストチャンク用の Tauri イベント名。 */
export const CLAUDE_STREAM_CHUNK_EVENT = "claude-stream-chunk" as const;

/** Tauri event name when a query finishes successfully. / クエリ正常完了時の Tauri イベント名。 */
export const CLAUDE_STREAM_COMPLETE_EVENT = "claude-stream-complete" as const;

/** Tauri event name for errors (sidecar, SDK, or process). / エラー（sidecar, SDK, プロセス）用の Tauri イベント名。 */
export const CLAUDE_ERROR_EVENT = "claude-error" as const;
