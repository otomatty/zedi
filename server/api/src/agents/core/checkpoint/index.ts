/**
 * Resolve a LangGraph checkpointer for a compose-session run.
 *
 * P0 でルートが checkpointer を取得する際の単一入口。本番 (Railway) では
 * `DATABASE_URL` / `POSTGRES_URL` が必ず設定されているため `PostgresSaver` を
 * 返し、テストや CI のように DB 接続情報が無い環境では `false` を返して
 * LangGraph の checkpoint 機構を無効化する。
 *
 * Returns either the process-wide `PostgresSaver` (when a DATABASE_URL is
 * available) or `false`. The route layer passes the result through to
 * `GraphRunner`, which forwards it to `StateGraph.compile({ checkpointer })`.
 * `false` keeps tests and the smoke-test path runnable without DDL.
 *
 * Issue: otomatty/zedi#948
 */
import type { BaseCheckpointSaver } from "@langchain/langgraph";
import {
  ensurePostgresCheckpointerSetup,
  getPostgresCheckpointer,
} from "./postgresCheckpointer.js";

/**
 * `DATABASE_URL` または `POSTGRES_URL` が設定されているなら `PostgresSaver` を
 * 返し、`setup()` をプロセス内で 1 度だけ実行する。未設定なら `false`。
 *
 * Returns the singleton `PostgresSaver` when a DB connection string is
 * available (and ensures `setup()` has run); otherwise returns `false` to opt
 * out of checkpointing.
 */
export async function resolveCheckpointerForRun(): Promise<BaseCheckpointSaver | false> {
  if (!process.env.DATABASE_URL && !process.env.POSTGRES_URL) {
    return false;
  }
  await ensurePostgresCheckpointerSetup();
  return getPostgresCheckpointer();
}

/**
 * `POST /run` が `failed` セッションを再実行する前に、同一 `thread_id` の
 * LangGraph checkpoint を破棄する。残存 state と新しい run input が reducer で
 * 混ざり、中途半端な outline / draft から completion が組み立てられるのを防ぐ。
 *
 * Drops all LangGraph checkpoints for a compose session thread before a failed
 * session is retried via `POST /run`. Without this, stale graph state merges
 * with fresh input and can produce incoherent completion markdown.
 */
export async function clearComposeThreadCheckpoint(
  threadId: string,
  checkpointer: BaseCheckpointSaver | false,
): Promise<void> {
  if (checkpointer === false) return;
  const deleter = checkpointer as BaseCheckpointSaver & {
    deleteThread?: (id: string) => Promise<void>;
  };
  if (typeof deleter.deleteThread !== "function") return;
  await deleter.deleteThread(threadId);
}

export {
  ensurePostgresCheckpointerSetup,
  getPostgresCheckpointer,
} from "./postgresCheckpointer.js";
