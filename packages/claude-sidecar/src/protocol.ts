/**
 * JSONL protocol between the Tauri host and this sidecar process.
 * Tauri ホストとこの sidecar プロセス間の JSONL プロトコル。
 *
 * Each line on stdin is one JSON request; each line on stdout is one JSON response.
 * stdin の 1 行が 1 リクエスト、stdout の 1 行が 1 レスポンス。
 */

/**
 * MCP サーバー設定（シリアライズ可能なトランスポート設定のみ）。
 * MCP server config (serializable process transports only).
 */
export type SidecarMcpServerConfig =
  | { type?: "stdio"; command: string; args?: string[]; env?: Record<string, string> }
  | { type: "http"; url: string; headers?: Record<string, string> }
  | { type: "sse"; url: string; headers?: Record<string, string> };

/** Inbound message from the host (one JSON object per line on stdin). */
export type SidecarRequest =
  | {
      type: "query";
      id: string;
      prompt: string;
      model?: string;
      cwd?: string;
      maxTurns?: number;
      allowedTools?: string[];
      /** Optional Claude session to resume (SDK `resume`). */
      resume?: string;
      /**
       * MCP サーバー設定。SDK の `options.mcpServers` に渡す。
       * MCP server configs passed to SDK's `options.mcpServers`.
       */
      mcpServers?: Record<string, SidecarMcpServerConfig>;
      correlationId?: string;
    }
  | { type: "abort"; id: string }
  | { type: "status"; correlationId: string }
  | { type: "check_installation"; correlationId: string }
  | { type: "list_models"; correlationId: string }
  | { type: "shutdown" };

/** Outbound message to the host (one JSON object per line on stdout). */
export type SidecarResponse =
  | { type: "stream-chunk"; id: string; content: string }
  | { type: "stream-complete"; id: string; result: { content: string } }
  | { type: "error"; id: string; error: string; code?: string }
  | {
      type: "tool-use-start";
      id: string;
      toolName: string;
      toolInput: string;
    }
  | {
      type: "tool-use-complete";
      id: string;
      toolName: string;
    }
  | {
      type: "status-response";
      correlationId: string;
      status: "idle" | "processing";
      activeQueryIds: string[];
    }
  | {
      type: "installation-status";
      correlationId: string;
      installed: boolean;
      version?: string;
    }
  | {
      type: "models-list";
      correlationId: string;
      models: Array<{ value: string; displayName: string; description: string }>;
    }
  | {
      type: "mcp-status";
      id: string;
      servers: Array<{
        name: string;
        status: string;
        error?: string;
        tools?: Array<{ name: string; description?: string }>;
      }>;
    }
  | { type: "shutdown-ack" };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

function isStringRecord(v: unknown): v is Record<string, string> {
  return isRecord(v) && Object.values(v).every((x) => typeof x === "string");
}

function requireString(obj: Record<string, unknown>, key: string): string {
  const v = obj[key];
  if (typeof v !== "string") {
    throw new Error(`invalid request: ${key} must be a string`);
  }
  return v;
}

/**
 * Validates one MCP server transport config. Untrusted callers can register
 * stdio servers (which the SDK spawns), so reject anything not matching the
 * serializable shapes in {@link SidecarMcpServerConfig}.
 * 1 件の MCP サーバー設定を検証する。stdio はプロセス起動につながるため、
 * 既定の形に合わないものは拒否する。
 */
function validateMcpServerConfig(name: string, v: unknown): SidecarMcpServerConfig {
  if (!isRecord(v)) {
    throw new Error(`invalid mcpServers[${name}]: not an object`);
  }
  const type = v.type;
  if (type === "http" || type === "sse") {
    if (typeof v.url !== "string") {
      throw new Error(`invalid mcpServers[${name}]: url must be a string`);
    }
    if (v.headers !== undefined && !isStringRecord(v.headers)) {
      throw new Error(`invalid mcpServers[${name}]: headers must be a string map`);
    }
    return v.headers !== undefined
      ? { type, url: v.url, headers: v.headers as Record<string, string> }
      : { type, url: v.url };
  }
  if (type !== undefined && type !== "stdio") {
    throw new Error(`invalid mcpServers[${name}]: unknown transport type`);
  }
  if (typeof v.command !== "string") {
    throw new Error(`invalid mcpServers[${name}]: command must be a string`);
  }
  if (v.args !== undefined && !isStringArray(v.args)) {
    throw new Error(`invalid mcpServers[${name}]: args must be a string array`);
  }
  if (v.env !== undefined && !isStringRecord(v.env)) {
    throw new Error(`invalid mcpServers[${name}]: env must be a string map`);
  }
  const config: SidecarMcpServerConfig = { command: v.command };
  if (v.type === "stdio") config.type = "stdio";
  if (v.args !== undefined) config.args = v.args as string[];
  if (v.env !== undefined) config.env = v.env as Record<string, string>;
  return config;
}

/**
 * Validates a `query` request, dropping unknown fields.
 * `query` リクエストを検証し、未知フィールドを破棄する。
 */
function validateQueryRequest(
  value: Record<string, unknown>,
): Extract<SidecarRequest, { type: "query" }> {
  const req: Extract<SidecarRequest, { type: "query" }> = {
    type: "query",
    id: requireString(value, "id"),
    prompt: requireString(value, "prompt"),
  };
  if (value.model !== undefined) req.model = requireString(value, "model");
  if (value.cwd !== undefined) req.cwd = requireString(value, "cwd");
  if (value.resume !== undefined) req.resume = requireString(value, "resume");
  if (value.correlationId !== undefined) req.correlationId = requireString(value, "correlationId");
  if (value.maxTurns !== undefined) {
    if (typeof value.maxTurns !== "number" || !Number.isFinite(value.maxTurns)) {
      throw new Error("invalid request: maxTurns must be a number");
    }
    req.maxTurns = value.maxTurns;
  }
  if (value.allowedTools !== undefined) {
    if (!isStringArray(value.allowedTools)) {
      throw new Error("invalid request: allowedTools must be a string array");
    }
    req.allowedTools = value.allowedTools;
  }
  if (value.mcpServers !== undefined) {
    if (!isRecord(value.mcpServers)) {
      throw new Error("invalid request: mcpServers must be an object");
    }
    const servers: Record<string, SidecarMcpServerConfig> = {};
    for (const [name, cfg] of Object.entries(value.mcpServers)) {
      servers[name] = validateMcpServerConfig(name, cfg);
    }
    req.mcpServers = servers;
  }
  return req;
}

/**
 * Parses and validates a single JSON line into {@link SidecarRequest}.
 * Unknown fields are dropped and malformed payloads are rejected so a
 * compromised/misbehaving host cannot smuggle unexpected data into the SDK.
 * 1 行を検証して {@link SidecarRequest} にする。未知フィールドは破棄し、
 * 不正なペイロードは拒否する。
 */
export function parseRequestLine(line: string): SidecarRequest {
  const trimmed = line.trim();
  if (!trimmed) {
    throw new Error("empty line");
  }
  const value: unknown = JSON.parse(trimmed);
  if (!isRecord(value) || typeof value.type !== "string") {
    throw new Error("invalid request: missing type");
  }

  switch (value.type) {
    case "query":
      return validateQueryRequest(value);
    case "abort":
      return { type: "abort", id: requireString(value, "id") };
    case "status":
      return { type: "status", correlationId: requireString(value, "correlationId") };
    case "check_installation":
      return { type: "check_installation", correlationId: requireString(value, "correlationId") };
    case "list_models":
      return { type: "list_models", correlationId: requireString(value, "correlationId") };
    case "shutdown":
      return { type: "shutdown" };
    default:
      throw new Error(`invalid request: unknown request type "${value.type}"`);
  }
}

/**
 * Serializes a response as one JSON line (with trailing newline for writing).
 * レスポンスを JSON 1 行（書き込み用に末尾改行付き）にする。
 */
export function formatResponseLine(response: SidecarResponse): string {
  return `${JSON.stringify(response)}\n`;
}
