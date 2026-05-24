/**
 * Wire-level SSE event types emitted from `POST /api/pages/:pageId/compose-sessions/:id/run`.
 *
 * compose-session 実行ストリームが SSE で吐く wire イベント型。フロントエンドは
 * `event: <type>` でフィルタリングし、`data` を本ファイルの discriminated union
 * として扱う。`sseMapper.ts` が LangGraph の生イベントから本型へ変換する。
 *
 * Discriminated union of SSE payloads sent by the compose-session run endpoint.
 * The frontend treats `data` as a JSON document and discriminates on `type`.
 * `sseMapper.ts` converts LangGraph runtime events into this shape.
 */

/**
 * セッション開始通知。クライアントがプログレス UI を初期化するための合図。
 * Emitted once when the run starts; lets the client initialise progress UI.
 */
export interface SseStartedEvent {
  type: "started";
  sessionId: string;
  graphId: string;
  phase?: string;
}

/**
 * フェーズ遷移通知。subgraph が次フェーズに進んだとき。
 * Phase transition (e.g. "research" → "draft").
 */
export interface SseStatusEvent {
  type: "status";
  phase: string;
  message?: string;
}

/**
 * LLM テキストトークン。compose の本文ドラフトをインクリメンタル描画する用途。
 * Token delta from the underlying chat model for incremental rendering.
 */
export interface SseTokenEvent {
  type: "token";
  /** ノード名（draft / outline 等）。Node label, e.g. "draft". */
  node?: string;
  content: string;
}

/**
 * Tool 呼び出し開始。UI 上の「検索中…」「記事取得中…」表示用。
 * Tool invocation started.
 */
export interface SseToolStartEvent {
  type: "tool_start";
  tool: string;
  /** zod でバリデート済みの入力。Validated tool input. */
  input?: Record<string, unknown>;
}

/**
 * Tool 呼び出し終了。
 * Tool invocation finished.
 */
export interface SseToolEndEvent {
  type: "tool_end";
  tool: string;
  /** クライアントには内容を晒さず長さだけ載せる用途で `outputLength` を許容。 */
  outputLength?: number;
  error?: string;
}

/**
 * Usage 更新通知。トークン課金後に走る。
 * Usage snapshot emitted after `recordUsage`.
 */
export interface SseUsageEvent {
  type: "usage";
  inputTokens: number;
  outputTokens: number;
  costUnits: number;
  usagePercent: number;
}

/**
 * Human-in-the-loop interrupt。次の resume で再開可能なポイント。
 * Human-in-the-loop interrupt point; resumable via PATCH resume.
 */
export interface SseInterruptEvent {
  type: "interrupt";
  /** クライアントに渡す任意の追加情報。Optional payload describing the interrupt. */
  payload?: unknown;
}

/**
 * 終了イベント。`status` でステータスを伝達。
 * Terminal event; carries the final status.
 */
export interface SseDoneEvent {
  type: "done";
  status: "completed" | "interrupted" | "failed";
}

/**
 * エラーイベント。`SseDoneEvent` とは別に詳細を伝える。
 * Error event with provider-side message; pair with a `done` with status="failed".
 */
export interface SseErrorEvent {
  type: "error";
  message: string;
  /** リトライ可能か（ネットワーク等）。Whether the client can retry. */
  retryable?: boolean;
}

/**
 * Wire-level SSE union.
 */
export type SseEvent =
  | SseStartedEvent
  | SseStatusEvent
  | SseTokenEvent
  | SseToolStartEvent
  | SseToolEndEvent
  | SseUsageEvent
  | SseInterruptEvent
  | SseDoneEvent
  | SseErrorEvent;

/**
 * SSE event 名（`event:` 行に流す名前）。`SseEvent["type"]` と同値だが、
 * 文字列リテラルとして引きやすいよう列挙する。
 *
 * SSE event names mirroring `SseEvent["type"]`, exposed as a const so writers
 * can `event: SSE_EVENT_NAMES.token` without re-spelling literals.
 */
export const SSE_EVENT_NAMES = {
  started: "started",
  status: "status",
  token: "token",
  toolStart: "tool_start",
  toolEnd: "tool_end",
  usage: "usage",
  interrupt: "interrupt",
  done: "done",
  error: "error",
} as const satisfies Record<string, SseEvent["type"]>;
