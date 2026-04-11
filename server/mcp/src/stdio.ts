#!/usr/bin/env node
/**
 * Zedi MCP — stdio エントリーポイント
 *
 * 環境変数:
 *   ZEDI_API_URL    Zedi REST API のベース URL (default: https://api.zedi.app)
 *   ZEDI_MCP_TOKEN  MCP JWT (必須)
 *
 * 設定ファイル ($XDG_CONFIG_HOME/zedi/mcp.json or APPDATA env path) からも読み込める。
 * 環境変数の方が優先される。
 *
 * Stdio entry point for the Zedi MCP server. Reads token + base URL from env or config file.
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer } from "./server.js";
import { HttpZediClient } from "./client/httpClient.js";
import { loadMcpClientConfig } from "./config.js";

const DEFAULT_API_URL = "https://api.zedi.app";

async function main() {
  const cfg = loadMcpClientConfig();
  const apiUrl = process.env.ZEDI_API_URL ?? cfg?.apiUrl ?? DEFAULT_API_URL;
  const token = process.env.ZEDI_MCP_TOKEN ?? cfg?.token;

  if (!token) {
    // stdio プロトコルを壊さないよう必ず stderr に出す。
    // Errors must go to stderr so we don't corrupt the JSON-RPC stdout stream.
    console.error(
      "[zedi-mcp] No token configured. Set ZEDI_MCP_TOKEN env var or run 'zedi-mcp-cli login'.",
    );
    process.exit(1);
  }

  const client = new HttpZediClient({ baseUrl: apiUrl, token });
  const server = createMcpServer(client);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`[zedi-mcp] stdio server connected (api=${apiUrl})`);
}

main().catch((err) => {
  console.error("[zedi-mcp] fatal:", err);
  process.exit(1);
});
