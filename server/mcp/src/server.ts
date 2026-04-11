/**
 * Zedi MCP サーバーファクトリ
 *
 * `createMcpServer(client)` で MCP の `McpServer` インスタンスを生成し、
 * Zedi のすべてのツールを登録した状態で返す。トランスポート (stdio / HTTP) は
 * 呼び出し側で `server.connect(transport)` する。
 *
 * Factory that builds a Zedi McpServer instance with all tools registered.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ZediClient } from "./client/ZediClient.js";
import { registerAllTools } from "./tools/index.js";

/** Server metadata advertised to MCP clients. / クライアントに公開するサーバーメタ情報 */
export const ZEDI_MCP_SERVER_INFO = {
  name: "zedi-mcp-server",
  version: "0.1.0",
} as const;

/**
 * 渡された `ZediClient` に対して MCP サーバーを生成し、すべてのツールを登録して返す。
 * Creates a Zedi MCP server bound to the given client and registers all tools.
 */
export function createMcpServer(client: ZediClient): McpServer {
  const server = new McpServer(ZEDI_MCP_SERVER_INFO, {
    capabilities: {
      tools: {},
    },
  });
  registerAllTools(server, client);
  return server;
}
