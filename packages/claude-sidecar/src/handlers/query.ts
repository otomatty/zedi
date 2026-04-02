/**
 * Runs one Claude Agent SDK `query()` and maps SDK stream events to sidecar stdout lines.
 * Claude Agent SDK の `query()` を 1 回実行し、ストリームを sidecar の stdout 行に写す。
 */

import { query } from "@anthropic-ai/claude-agent-sdk";
import type {
  SDKAssistantMessage,
  SDKMessage,
  SDKPartialAssistantMessage,
  SDKResultMessage,
} from "@anthropic-ai/claude-agent-sdk";
import type { SidecarResponse } from "../protocol";
import { formatResponseLine } from "../protocol";
import type { QueryActivityTracker } from "./status";

/** Writes one newline-terminated JSON line to the host. / ホストへ改行付き JSON 1 行を書く */
export type WriteLine = (line: string) => void;

const DEFAULT_TOOLS = ["Read", "Write", "Bash", "WebSearch"] as const;

function extractTextDelta(msg: SDKPartialAssistantMessage): string | null {
  const ev = msg.event as unknown as Record<string, unknown> | undefined;
  if (!ev || typeof ev !== "object") return null;
  if (ev.type !== "content_block_delta") return null;
  const delta = ev.delta as Record<string, unknown> | undefined;
  if (!delta || delta.type !== "text_delta") return null;
  const text = delta.text;
  return typeof text === "string" ? text : null;
}

function extractAssistantText(msg: SDKAssistantMessage): string {
  const message = msg.message as { content?: unknown };
  const content = message.content;
  if (!Array.isArray(content)) return "";
  let out = "";
  for (const block of content) {
    if (
      block &&
      typeof block === "object" &&
      "type" in block &&
      (block as { type: string }).type === "text" &&
      "text" in block
    ) {
      out += String((block as { text: string }).text);
    }
  }
  return out;
}

function isResultMessage(msg: SDKMessage): msg is SDKResultMessage {
  return typeof msg === "object" && msg !== null && "type" in msg && msg.type === "result";
}

/**
 * Emits stream-complete on success or error line on failure.
 * 成功時は stream-complete、失敗時は error 行を出す。
 */
function emitResultOrError(
  id: string,
  msg: SDKResultMessage,
  aggregated: string,
  emit: (r: SidecarResponse) => void,
): void {
  if (msg.subtype === "success") {
    const finalText = msg.result ?? aggregated;
    emit({
      type: "stream-complete",
      id,
      result: { content: finalText },
    });
    return;
  }
  const errors = "errors" in msg && Array.isArray(msg.errors) ? msg.errors.join("; ") : "";
  emit({
    type: "error",
    id,
    error: errors || `Claude Code finished with subtype ${msg.subtype}`,
    code: msg.subtype,
  });
}

/**
 * Executes a query; writes {@link SidecarResponse} lines via `writeLine`.
 * `writeLine` 経由で {@link SidecarResponse} 行を書き出す。
 */
export async function runQuery(params: {
  id: string;
  prompt: string;
  cwd?: string;
  maxTurns?: number;
  allowedTools?: string[];
  resume?: string;
  writeLine: WriteLine;
  abortController: AbortController;
  tracker: QueryActivityTracker;
}): Promise<void> {
  const { id, prompt, cwd, maxTurns, allowedTools, resume, writeLine, abortController, tracker } =
    params;

  const emit = (response: SidecarResponse): void => {
    writeLine(formatResponseLine(response));
  };

  tracker.start(id);
  let aggregated = "";

  try {
    const q = query({
      prompt,
      options: {
        cwd: cwd ?? process.cwd(),
        maxTurns: maxTurns ?? 10,
        allowedTools: allowedTools?.length ? allowedTools : [...DEFAULT_TOOLS],
        abortController,
        includePartialMessages: true,
        resume,
        permissionMode: "acceptEdits",
        settingSources: ["user", "project", "local"],
      },
    });

    for await (const msg of q) {
      if (abortController.signal.aborted) {
        break;
      }

      if (msg.type === "stream_event") {
        const delta = extractTextDelta(msg);
        if (delta) {
          aggregated += delta;
          emit({ type: "stream-chunk", id, content: delta });
        }
        continue;
      }

      if (msg.type === "assistant") {
        const text = extractAssistantText(msg);
        const delta = text.length > 0 ? text.slice(aggregated.length) : "";
        if (delta.length > 0) {
          aggregated += delta;
          emit({ type: "stream-chunk", id, content: delta });
        }
        continue;
      }

      if (isResultMessage(msg)) {
        emitResultOrError(id, msg, aggregated, emit);
        return;
      }
    }

    emit({
      type: "stream-complete",
      id,
      result: { content: aggregated },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    emit({
      type: "error",
      id,
      error: message,
      code: "query_exception",
    });
  } finally {
    tracker.end(id);
  }
}
