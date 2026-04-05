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

/** Emitted as {@link CLAUDE_TOOL_USE_START_EVENT}. / {@link CLAUDE_TOOL_USE_START_EVENT} として発行される。 */
export interface ClaudeToolUseStartPayload {
  type: "tool-use-start";
  id: string;
  toolName: string;
  toolInput: string;
}

/** Emitted as {@link CLAUDE_TOOL_USE_COMPLETE_EVENT}. / {@link CLAUDE_TOOL_USE_COMPLETE_EVENT} として発行される。 */
export interface ClaudeToolUseCompletePayload {
  type: "tool-use-complete";
  id: string;
  toolName: string;
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

/**
 * Result of {@link claudeListModels} (sidecar `models-list`).
 * {@link claudeListModels} の結果（sidecar `models-list`）。
 */
export interface ClaudeModelsListResult {
  type: "models-list";
  correlationId: string;
  models: ClaudeModelEntry[];
}

/**
 * SDK が返す個別モデル情報。
 * Individual model info returned by the SDK.
 */
export interface ClaudeModelEntry {
  value: string;
  displayName: string;
  description: string;
}

/**
 * MCP サーバーステータス情報（sidecar `mcp-status` イベント）。
 * MCP server status info from sidecar `mcp-status` event.
 */
export interface ClaudeMcpStatusPayload {
  type: "mcp-status";
  id: string;
  servers: Array<{
    name: string;
    status: string;
    error?: string;
    tools?: Array<{ name: string; description?: string }>;
  }>;
}

/** Tauri event name for streaming assistant text chunks. / ストリーミングアシスタントテキストチャンク用の Tauri イベント名。 */
export const CLAUDE_STREAM_CHUNK_EVENT = "claude-stream-chunk" as const;

/** Tauri event name when a query finishes successfully. / クエリ正常完了時の Tauri イベント名。 */
export const CLAUDE_STREAM_COMPLETE_EVENT = "claude-stream-complete" as const;

/** Tauri event name for errors (sidecar, SDK, or process). / エラー（sidecar, SDK, プロセス）用の Tauri イベント名。 */
export const CLAUDE_ERROR_EVENT = "claude-error" as const;

/** Tauri event name when a tool starts executing. / ツール実行開始時の Tauri イベント名。 */
export const CLAUDE_TOOL_USE_START_EVENT = "claude-tool-use-start" as const;

/** Tauri event name when a tool finishes executing. / ツール実行完了時の Tauri イベント名。 */
export const CLAUDE_TOOL_USE_COMPLETE_EVENT = "claude-tool-use-complete" as const;

/** Tauri event name for MCP server status updates. / MCP サーバーステータス更新の Tauri イベント名。 */
export const CLAUDE_MCP_STATUS_EVENT = "claude-mcp-status" as const;
