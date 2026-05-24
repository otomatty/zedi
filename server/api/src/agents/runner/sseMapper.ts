/**
 * `sseMapper` — translate LangGraph runtime events into wire SSE events.
 *
 * LangGraph の `streamEvents` 出力を本リポジトリの `SseEvent` discriminated union
 * に変換する純粋関数群。route 層は `mapLangGraphEvent` の結果を `streamSSE` で
 * `event:` ＋ `data:` の 2 行として書き出す。テストしやすいよう、I/O を持たない
 * 同期関数として実装する。
 *
 * Pure-function mappers from LangGraph runtime events to {@link SseEvent}. The
 * route layer is responsible for actually writing to the SSE response; this
 * file only describes the shape transformation so unit tests can pin it.
 */
import type { SseEvent } from "../core/types/sseEvents.js";

/**
 * 起動時 SSE。`event: started` で投げる。
 * Initial SSE event emitted before the graph starts.
 */
export function startedEvent(sessionId: string, graphId: string, phase?: string): SseEvent {
  return phase
    ? { type: "started", sessionId, graphId, phase }
    : { type: "started", sessionId, graphId };
}

/**
 * フェーズ遷移 SSE。
 * Phase transition SSE.
 */
export function statusEvent(phase: string, message?: string): SseEvent {
  return message ? { type: "status", phase, message } : { type: "status", phase };
}

/**
 * Usage SSE。`ZediChatModel` の usage 計算後に流す。
 * Usage SSE emitted right after `recordZediUsage`.
 */
export function usageEvent(input: {
  inputTokens: number;
  outputTokens: number;
  costUnits: number;
  usagePercent: number;
}): SseEvent {
  return { type: "usage", ...input };
}

/**
 * 終了 SSE。`status` で完了 / 中断 / 失敗を区別する。
 * Terminal SSE describing how the run ended.
 */
export function doneEvent(status: "completed" | "interrupted" | "failed"): SseEvent {
  return { type: "done", status };
}

/**
 * エラー SSE。`retryable` は省略可。
 * Error SSE; `retryable` defaults to undefined.
 */
export function errorEvent(message: string, retryable?: boolean): SseEvent {
  return retryable === undefined
    ? { type: "error", message }
    : { type: "error", message, retryable };
}

/**
 * LangGraph `streamEvents` から取れる最小限の event 形。本マッパは LangChain の
 * 詳細型を取り込みすぎないよう、必要なフィールドだけを `unknown` で構造的に
 * 受け取る。
 *
 * Minimal structural type for a LangGraph runtime event so the mapper does not
 * couple to the full LangChain event union. The runner casts the LangGraph
 * event to this shape before calling {@link mapLangGraphEvent}.
 */
export interface LangGraphRuntimeEvent {
  event: string;
  name?: string;
  data?: unknown;
  metadata?: Record<string, unknown>;
  tags?: string[];
}

/**
 * LangGraph 1 イベント → SseEvent[]。1 入力が複数の SSE event に展開されうるため
 * 配列で返す。`null` を返したくない設計（呼び出し側のフィルタ条件を 1 箇所に
 * 集約するため空配列を許容）。
 *
 * Returns 0..N {@link SseEvent} for one LangGraph event. Callers iterate and
 * write each one to the SSE stream. Empty array signals "skip this event".
 */
export function mapLangGraphEvent(event: LangGraphRuntimeEvent): SseEvent[] {
  switch (event.event) {
    case "on_chat_model_stream":
      return mapChatModelStream(event);
    case "on_tool_start":
      return mapToolStart(event);
    case "on_tool_end":
      return mapToolEnd(event);
    case "on_chain_end":
      return mapChainEnd(event);
    default:
      return [];
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function mapChatModelStream(event: LangGraphRuntimeEvent): SseEvent[] {
  const data = asRecord(event.data);
  if (!data) return [];
  const chunk = asRecord(data.chunk);
  if (!chunk) return [];
  const content = chunk.content;
  if (typeof content !== "string" || content.length === 0) return [];
  const node =
    typeof event.metadata?.langgraph_node === "string"
      ? (event.metadata.langgraph_node as string)
      : undefined;
  return node ? [{ type: "token", node, content }] : [{ type: "token", content }];
}

function mapToolStart(event: LangGraphRuntimeEvent): SseEvent[] {
  const tool = event.name;
  if (!tool) return [];
  const data = asRecord(event.data);
  const input = data && asRecord(data.input);
  return input ? [{ type: "tool_start", tool, input }] : [{ type: "tool_start", tool }];
}

function mapToolEnd(event: LangGraphRuntimeEvent): SseEvent[] {
  const tool = event.name;
  if (!tool) return [];
  const data = asRecord(event.data);
  const output = data?.output;
  const outputLength =
    typeof output === "string" ? output.length : output === undefined ? undefined : 0;
  const errorRaw = data?.error;
  const error =
    errorRaw instanceof Error
      ? errorRaw.message
      : typeof errorRaw === "string"
        ? errorRaw
        : undefined;
  const base = { type: "tool_end" as const, tool };
  const withLen = outputLength === undefined ? base : { ...base, outputLength };
  return error ? [{ ...withLen, error }] : [withLen];
}

function mapChainEnd(event: LangGraphRuntimeEvent): SseEvent[] {
  // Only emit a status update when the chain end belongs to the top-level
  // graph (no parent ids in metadata). Nested chain ends would generate noise.
  // トップレベル graph の終了のみ status を吐く。ネストした chain は無視する。
  const data = asRecord(event.data);
  if (!data) return [];
  const output = asRecord(data.output);
  if (!output) return [];
  const phase = typeof output.phase === "string" ? output.phase : undefined;
  if (!phase) return [];
  return [{ type: "status", phase }];
}
