/**
 * Graph execution context passed via `LangGraphRunnableConfig.configurable`.
 *
 * グラフ実行コンテキスト。`GraphRunner` がノードや tool に渡す共有情報をまとめる。
 * LangGraph の `configurable` には `thread_id` と `pageId`・`userId` 等の識別子を
 * 載せ、`callbacks` には `ZediChatModel` の usage 記録コールバックを載せる。
 *
 * Shared per-run context that the `GraphRunner` propagates into LangGraph
 * `configurable`. Includes the LangGraph `thread_id` plus Zedi-specific
 * identifiers required by `ZediChatModel` for usage attribution.
 */
import type { Database, UserTier } from "../../../types/index.js";
import type { ExecutionBackend } from "./executionBackend.js";

/**
 * グラフ実行 1 回ぶんのコンテキスト。
 * Per-execution graph context.
 *
 * @property threadId  LangGraph 内 thread_id（compose session id を流用）。
 *                     LangGraph thread id; reuse compose-session id.
 * @property userId    実行ユーザー ID。Executing user id.
 * @property pageId    対象ページ ID。Target page id.
 * @property sessionId compose_session 行 ID（threadId と同じ値が来る想定）。
 *                     compose session row id (currently equals threadId).
 * @property graphId   実行する graph の論理名 (registry key)。Logical graph id.
 * @property backend   実行 backend (P0 は `zedi_managed` のみ)。Execution backend.
 * @property tier      ユーザー tier（usage 上限判定で使う）。User tier for budget checks.
 * @property db        Drizzle DB ハンドル。Drizzle DB handle.
 * @property feature   `recordUsage` の feature ラベル。`recordUsage` feature label.
 */
export interface GraphContext {
  threadId: string;
  userId: string;
  pageId: string;
  sessionId: string;
  graphId: string;
  backend: ExecutionBackend;
  tier: UserTier;
  db: Database;
  feature: string;
}

/**
 * LangGraph の `configurable` バッグへ載せるキー。tool / node から `config.configurable`
 * 経由でアクセスする際は必ず本キー名を使う。
 * Single key namespace on `configurable` to fetch a {@link GraphContext}.
 */
export const GRAPH_CONTEXT_CONFIG_KEY = "zediGraphContext" as const;
