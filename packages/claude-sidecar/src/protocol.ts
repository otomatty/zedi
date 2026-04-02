/**
 * JSONL protocol between the Tauri host and this sidecar process.
 * Tauri ホストとこの sidecar プロセス間の JSONL プロトコル。
 *
 * Each line on stdin is one JSON request; each line on stdout is one JSON response.
 * stdin の 1 行が 1 リクエスト、stdout の 1 行が 1 レスポンス。
 */

/** Inbound message from the host (one JSON object per line on stdin). */
export type SidecarRequest =
  | {
      type: "query";
      id: string;
      prompt: string;
      cwd?: string;
      maxTurns?: number;
      allowedTools?: string[];
      /** Optional Claude session to resume (SDK `resume`). */
      resume?: string;
      correlationId?: string;
    }
  | { type: "abort"; id: string }
  | { type: "status"; correlationId: string }
  | { type: "check_installation"; correlationId: string }
  | { type: "shutdown" };

/** Outbound message to the host (one JSON object per line on stdout). */
export type SidecarResponse =
  | { type: "stream-chunk"; id: string; content: string }
  | { type: "stream-complete"; id: string; result: { content: string } }
  | { type: "error"; id: string; error: string; code?: string }
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
  | { type: "shutdown-ack" };

/**
 * Parses a single JSON line into {@link SidecarRequest}.
 * 1 行を {@link SidecarRequest} としてパースする。
 */
export function parseRequestLine(line: string): SidecarRequest {
  const trimmed = line.trim();
  if (!trimmed) {
    throw new Error("empty line");
  }
  const value: unknown = JSON.parse(trimmed);
  if (!value || typeof value !== "object" || !("type" in value)) {
    throw new Error("invalid request: missing type");
  }
  return value as SidecarRequest;
}

/**
 * Serializes a response as one JSON line (with trailing newline for writing).
 * レスポンスを JSON 1 行（書き込み用に末尾改行付き）にする。
 */
export function formatResponseLine(response: SidecarResponse): string {
  return `${JSON.stringify(response)}\n`;
}
