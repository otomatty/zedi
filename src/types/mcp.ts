/**
 * MCP (Model Context Protocol) 関連の型定義（Issue #463）。
 * MCP-related type definitions (Issue #463).
 *
 * SDK の McpStdioServerConfig / McpSSEServerConfig / McpHttpServerConfig に対応する
 * シリアライズ可能な設定型を定義する。
 * Defines serializable config types matching SDK's Mcp*ServerConfig.
 */

/**
 * MCP サーバーのトランスポート種別。
 * Transport type for an MCP server.
 */
export type McpServerTransport = "stdio" | "http" | "sse";

/**
 * stdio トランスポート設定。
 * stdio transport configuration.
 */
export interface McpStdioConfig {
  type: "stdio";
  /** 実行するコマンド / Command to execute */
  command: string;
  /** コマンド引数 / Command arguments */
  args?: string[];
  /** 環境変数 / Environment variables */
  env?: Record<string, string>;
}

/**
 * HTTP (streamable) トランスポート設定。
 * HTTP (streamable) transport configuration.
 */
export interface McpHttpConfig {
  type: "http";
  /** サーバー URL / Server URL */
  url: string;
  /** HTTP ヘッダー / HTTP headers */
  headers?: Record<string, string>;
}

/**
 * SSE (Server-Sent Events) トランスポート設定。
 * SSE (Server-Sent Events) transport configuration.
 */
export interface McpSseConfig {
  type: "sse";
  /** サーバー URL / Server URL */
  url: string;
  /** HTTP ヘッダー / HTTP headers */
  headers?: Record<string, string>;
}

/**
 * MCP サーバー設定の共用体。SDK の McpServerConfigForProcessTransport に対応。
 * Union of MCP server configs. Maps to SDK's McpServerConfigForProcessTransport.
 */
export type McpServerConfig = McpStdioConfig | McpHttpConfig | McpSseConfig;

/**
 * MCP サーバーの接続ステータス。SDK の McpServerStatus.status に対応。
 * Connection status of an MCP server. Maps to SDK's McpServerStatus.status.
 */
export type McpConnectionStatus =
  | "connected"
  | "failed"
  | "needs-auth"
  | "pending"
  | "disabled"
  | "unknown";

/**
 * MCP サーバーが提供するツール情報。
 * Tool information provided by an MCP server.
 */
export interface McpServerTool {
  name: string;
  description?: string;
}

/**
 * ストアで管理する MCP サーバーエントリ（設定 + ランタイム状態）。
 * MCP server entry managed in the store (config + runtime state).
 */
export interface McpServerEntry {
  /** 一意なサーバー名（SDK に渡すキー） / Unique server name (key passed to SDK) */
  name: string;
  /** トランスポート設定 / Transport configuration */
  config: McpServerConfig;
  /** 有効/無効フラグ / Enabled/disabled flag */
  enabled: boolean;
  /** 最新の接続ステータス / Latest connection status */
  status: McpConnectionStatus;
  /** エラーメッセージ（status が failed 時） / Error message when status is failed */
  error?: string;
  /** サーバーが提供するツール一覧 / Tools provided by the server */
  tools?: McpServerTool[];
}

/**
 * SDK の query() options.mcpServers に渡す形式へ変換するための Record 型。
 * Record type for conversion to SDK's query() options.mcpServers format.
 */
export type McpServersRecord = Record<string, McpServerConfig>;

/**
 * SDK から返る MCP サーバーステータス情報。
 * MCP server status info returned from the SDK.
 */
export interface McpServerStatusInfo {
  name: string;
  status: McpConnectionStatus;
  error?: string;
  tools?: McpServerTool[];
}
