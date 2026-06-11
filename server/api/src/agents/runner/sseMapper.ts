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
import type {
  SseComposePhaseEvent,
  SseComposeSectionEvent,
  SseEvent,
  SseResearchBatchEvent,
  SseResearchEvaluationEvent,
  SseResearchIterationEvent,
} from "../core/types/sseEvents.js";

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
    case "on_custom_event":
      return mapCustomEvent(event);
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
  // Only emit a status / interrupt update when the chain end belongs to the
  // top-level graph. Nested chain ends would generate noise.
  // トップレベル graph の終了のみ拾う。ネストした chain は無視する。
  const data = asRecord(event.data);
  if (!data) return [];
  const output = asRecord(data.output);
  if (!output) return [];
  const events: SseEvent[] = [];

  // LangGraph ≥ 1.x: interrupts surface as a `__interrupt__: Interrupt[]`
  // array on the final state, not as a throw. Convert each entry to its own
  // `interrupt` SSE event so the frontend sees the same wire shape it would
  // get from the legacy throw path. Route layer reads `interrupt` events to
  // flip the session status to "interrupted".
  // LangGraph 1.x の `__interrupt__` 配列を SSE interrupt イベントに変換する。
  const interrupts = (output as { __interrupt__?: unknown }).__interrupt__;
  if (Array.isArray(interrupts) && interrupts.length > 0) {
    for (const entry of interrupts) {
      const value =
        entry && typeof entry === "object" ? (entry as { value?: unknown }).value : undefined;
      events.push({ type: "interrupt", payload: value });
    }
  }

  const phase = typeof output.phase === "string" ? output.phase : undefined;
  if (phase) events.push({ type: "status", phase });
  return events;
}

/**
 * Map `on_custom_event` (LangGraph's hook for `dispatchCustomEvent` from
 * `@langchain/core/callbacks/dispatch`) to typed Sse events. Used by the
 * research loop subgraph (#949) to surface `research_iteration` /
 * `research_evaluation` / `research_batch` without inventing a new transport.
 *
 * `dispatchCustomEvent(name, data, config)` で吐かれる runtime event を SSE に
 * 変換する。`event.name` でイベント種別を分岐し、`event.data` は信頼せず構造
 * 的に検証してから dispatch する（ペイロードが壊れていれば空配列を返して
 * フロントを壊さない）。
 */
function mapCustomEvent(event: LangGraphRuntimeEvent): SseEvent[] {
  const name = event.name;
  if (!name) return [];
  const data = asRecord(event.data);
  if (!data) return [];
  switch (name) {
    case "research_iteration":
      return mapResearchIteration(data);
    case "research_evaluation":
      return mapResearchEvaluation(data);
    case "research_batch":
      return mapResearchBatch(data);
    case "compose_phase":
      return mapComposePhase(data);
    case "compose_section":
      return mapComposeSection(data);
    case "compose_completion":
      return mapComposeCompletion(data);
    default:
      // Unknown custom event names are dropped silently; emitting them as `status`
      // would risk leaking implementation detail to the wire.
      // 未知 name は静かに捨てる。`status` 等に流すと内部詳細が漏れる。
      return [];
  }
}

function mapResearchIteration(data: Record<string, unknown>): SseResearchIterationEvent[] {
  const iteration = typeof data.iteration === "number" ? data.iteration : null;
  const status = data.status === "planned" || data.status === "refined" ? data.status : null;
  const queryCount = typeof data.queryCount === "number" ? data.queryCount : null;
  if (iteration === null || status === null || queryCount === null) return [];
  return [{ type: "research_iteration", iteration, status, queryCount }];
}

function mapResearchEvaluation(data: Record<string, unknown>): SseResearchEvaluationEvent[] {
  const iteration = typeof data.iteration === "number" ? data.iteration : null;
  const score = typeof data.score === "number" ? data.score : null;
  const rationale = typeof data.rationale === "string" ? data.rationale : null;
  const missingAspectsCount =
    typeof data.missingAspectsCount === "number" ? data.missingAspectsCount : null;
  if (iteration === null || score === null || rationale === null || missingAspectsCount === null) {
    return [];
  }
  return [{ type: "research_evaluation", iteration, score, rationale, missingAspectsCount }];
}

function mapComposePhase(data: Record<string, unknown>): SseComposePhaseEvent[] {
  const phase = data.phase;
  const status = data.status;
  if (
    phase !== "brief" &&
    phase !== "research" &&
    phase !== "conflict" &&
    phase !== "structure" &&
    phase !== "draft" &&
    phase !== "completed"
  ) {
    return [];
  }
  if (status !== "entered" && status !== "completed") return [];
  return [{ type: "compose_phase", phase, status }];
}

function mapComposeSection(data: Record<string, unknown>): SseComposeSectionEvent[] {
  const sectionId = typeof data.sectionId === "string" ? data.sectionId : null;
  const heading = typeof data.heading === "string" ? data.heading : null;
  const status = data.status === "started" || data.status === "completed" ? data.status : null;
  const index = typeof data.index === "number" ? data.index : null;
  const total = typeof data.total === "number" ? data.total : null;
  if (
    sectionId === null ||
    heading === null ||
    status === null ||
    index === null ||
    total === null
  ) {
    return [];
  }
  return [{ type: "compose_section", sectionId, heading, status, index, total }];
}

function mapComposeCompletion(data: Record<string, unknown>): SseEvent[] {
  const completion = data.completion;
  // The completion object is validated structurally by the frontend reducer;
  // here we only require it to be a non-null object before forwarding.
  // completion の詳細検証はフロント側で行う。ここでは object であることだけ確認。
  if (!completion || typeof completion !== "object" || Array.isArray(completion)) return [];
  return [{ type: "compose_completion", completion }];
}

function mapResearchBatch(data: Record<string, unknown>): SseResearchBatchEvent[] {
  const batchId = typeof data.batchId === "string" ? data.batchId : null;
  const iteration = typeof data.iteration === "number" ? data.iteration : null;
  const sourceCount = typeof data.sourceCount === "number" ? data.sourceCount : null;
  const score = data.score === null || typeof data.score === "number" ? data.score : null;
  const exitReason =
    data.exitReason === "score_threshold" || data.exitReason === "max_iterations"
      ? data.exitReason
      : null;
  if (batchId === null || iteration === null || sourceCount === null || exitReason === null) {
    return [];
  }
  return [
    {
      type: "research_batch",
      batchId,
      iteration,
      sourceCount,
      score,
      exitReason,
    },
  ];
}
