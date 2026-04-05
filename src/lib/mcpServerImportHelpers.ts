/**
 * Claude Code / MCP 設定ファイルからのインポート用ヘルパー。
 * Helpers for importing MCP config from Claude Code config files.
 */

import type { McpServerConfig } from "@/types/mcp";

/**
 * 任意の値を文字列キー・文字列値の Record に正規化する（インポート JSON 用）。
 * Normalizes unknown values to string key/value records (imported JSON).
 */
function normalizeStringRecord(raw: unknown): Record<string, string> | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    out[String(k)] = String(v);
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * HTTP / SSE の headers を正規化する。
 * Normalizes HTTP/SSE header objects.
 */
function normalizeHeaders(raw: unknown): Record<string, string> | undefined {
  return normalizeStringRecord(raw);
}

/**
 * Claude Code 設定ファイルからインポートした生データを McpServerConfig に正規化する。
 * Normalizes raw imported data from Claude Code config into McpServerConfig.
 */
export function normalizeImportedConfig(raw: Record<string, unknown>): McpServerConfig {
  if (raw.type === "http" && typeof raw.url === "string") {
    return {
      type: "http",
      url: raw.url,
      headers: normalizeHeaders(raw.headers),
    };
  }
  if (raw.type === "sse" && typeof raw.url === "string") {
    return {
      type: "sse",
      url: raw.url,
      headers: normalizeHeaders(raw.headers),
    };
  }
  return {
    type: "stdio",
    command: typeof raw.command === "string" ? raw.command : "",
    args: Array.isArray(raw.args) ? (raw.args as string[]).map(String) : undefined,
    env: normalizeStringRecord(raw.env),
  };
}

/**
 * Returns whether a normalized config has the minimum fields required to run.
 * 正規化済み設定に実行に必要な最低限のフィールドがあるかを返す。
 */
export function isValidMcpServerConfig(config: McpServerConfig): boolean {
  if (config.type === "stdio") {
    return config.command.trim().length > 0;
  }
  return config.url.trim().length > 0;
}
