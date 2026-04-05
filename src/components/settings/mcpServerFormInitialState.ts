/**
 * MCP サーバーフォームの初期スナップショット（Issue #463）。
 * Initial snapshot for MCP server form fields (Issue #463).
 */

import type { McpServerConfig, McpServerTransport } from "@/types/mcp";

/** Form field snapshot for MCP server dialog. / MCP サーバー用フォームのスナップショット */
export interface McpFormStateSnapshot {
  name: string;
  transport: McpServerTransport;
  command: string;
  args: string;
  envVars: Array<{ key: string; value: string }>;
  url: string;
  headers: Array<{ key: string; value: string }>;
}

function transportFromConfig(initialConfig: McpServerConfig | undefined): McpServerTransport {
  if (initialConfig?.type === "http" || initialConfig?.type === "sse") return initialConfig.type;
  return "stdio";
}

function stdioPartFromConfig(
  initialConfig: McpServerConfig | undefined,
): Pick<McpFormStateSnapshot, "command" | "args" | "envVars"> {
  const isStdio = initialConfig?.type === "stdio" || !initialConfig?.type;
  if (!isStdio) {
    return { command: "", args: "", envVars: [] };
  }
  const command = (initialConfig as { command?: string })?.command ?? "";
  const args = ((initialConfig as { args?: string[] })?.args ?? []).join(" ");
  const envVars = Object.entries(
    (initialConfig as { env?: Record<string, string> })?.env ?? {},
  ).map(([key, value]) => ({ key, value }));
  return { command, args, envVars };
}

function remotePartFromConfig(
  initialConfig: McpServerConfig | undefined,
): Pick<McpFormStateSnapshot, "url" | "headers"> {
  if (initialConfig?.type !== "http" && initialConfig?.type !== "sse") {
    return { url: "", headers: [] };
  }
  return {
    url: initialConfig.url,
    headers: Object.entries(initialConfig.headers ?? {}).map(([key, value]) => ({ key, value })),
  };
}

/**
 * initialName / initialConfig からフォーム初期値を構築する。
 * Builds form initial values from optional name and config.
 */
export function getMcpFormInitialSnapshot(
  initialName: string | undefined,
  initialConfig: McpServerConfig | undefined,
): McpFormStateSnapshot {
  const name = initialName ?? "";
  const transport = transportFromConfig(initialConfig);
  const stdio = stdioPartFromConfig(initialConfig);
  const remote = remotePartFromConfig(initialConfig);
  return {
    name,
    transport,
    command: stdio.command,
    args: stdio.args,
    envVars: stdio.envVars,
    url: remote.url,
    headers: remote.headers,
  };
}
