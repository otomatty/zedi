/**
 * MCP クライアント設定ファイルの読み込み
 *
 * stdio エントリポイントは環境変数 (`ZEDI_API_URL`, `ZEDI_MCP_TOKEN`) を最優先で参照し、
 * 未設定の場合はユーザーホームの設定ファイルを読み込む。
 *
 * - macOS / Linux: `$XDG_CONFIG_HOME/zedi/mcp.json` または `~/.config/zedi/mcp.json`
 * - Windows: `%APPDATA%\zedi\mcp.json`
 *
 * MCP client config file resolver — loads `apiUrl` / `token` from disk when env vars are unset.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

/** 設定ファイルの形 / Shape of the persisted MCP client config. */
export interface McpClientConfig {
  apiUrl: string;
  token: string;
}

/**
 * プラットフォーム別の設定ファイルパスを解決する。
 * Resolves the platform-specific MCP client config file path.
 */
export function resolveMcpClientConfigPath(env: NodeJS.ProcessEnv = process.env): string {
  if (process.platform === "win32") {
    const appData = env.APPDATA;
    if (appData) return join(appData, "zedi", "mcp.json");
    return join(homedir(), "AppData", "Roaming", "zedi", "mcp.json");
  }
  const xdg = env.XDG_CONFIG_HOME;
  if (xdg) return join(xdg, "zedi", "mcp.json");
  return join(homedir(), ".config", "zedi", "mcp.json");
}

/**
 * 設定ファイルを読み込む。存在しない・パース失敗時は null を返す。
 * Loads and parses the MCP client config file; returns null on missing file or parse error.
 */
export function loadMcpClientConfig(path?: string): McpClientConfig | null {
  const target = path ?? resolveMcpClientConfigPath();
  if (!existsSync(target)) return null;
  try {
    const raw = readFileSync(target, "utf-8");
    const parsed = JSON.parse(raw) as Partial<McpClientConfig>;
    if (typeof parsed.apiUrl !== "string" || typeof parsed.token !== "string") {
      return null;
    }
    return { apiUrl: parsed.apiUrl, token: parsed.token };
  } catch {
    return null;
  }
}
