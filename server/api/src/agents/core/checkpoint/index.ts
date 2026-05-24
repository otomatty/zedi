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

export {
  ensurePostgresCheckpointerSetup,
  getPostgresCheckpointer,
} from "./postgresCheckpointer.js";
