/**
 * `PostgresSaver` wrapper for the Wiki Compose graph runtime.
 *
 * LangGraph 公式の `PostgresSaver` を Zedi が使う 1 つの connection string に
 * 束ねるだけの薄いラッパー。`checkpoints` / `checkpoint_blobs` / `checkpoint_writes`
 * の 3 テーブルは `setup()` が動的に作る (U4 で別管理)。本ラッパーは
 * `DATABASE_URL` または `POSTGRES_URL` から接続文字列を取得し、プロセスローカル
 * にシングルトンを保持する。
 *
 * Singleton wrapper around LangGraph's `PostgresSaver`. The saver owns its own
 * `checkpoints*` tables — they are created by `setup()` and intentionally are
 * NOT part of Drizzle's migration set, so Drizzle never tries to diff them.
 */
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";

let cached: PostgresSaver | null = null;
let setupOnce: Promise<void> | null = null;

/**
 * `DATABASE_URL` (preferred) or `POSTGRES_URL` を返す。両方未設定なら例外。
 *
 * Return the Postgres connection string used by the rest of the API. Throws
 * when neither variable is set so misconfigured deployments fail loudly
 * instead of silently writing to an in-memory store.
 */
function readConnectionString(): string {
  const value = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (!value || !value.trim()) {
    throw new Error("DATABASE_URL or POSTGRES_URL must be set to use PostgresSaver");
  }
  return value;
}

/**
 * `PostgresSaver` を `(プロセス, schema)` 単位でシングルトン化する。
 *
 * Returns a process-wide singleton `PostgresSaver`. `setup()` is intentionally
 * NOT awaited here — callers that need DDL applied should call
 * {@link ensurePostgresCheckpointerSetup} once at boot. Keeping creation
 * separate from setup means tests can construct the saver without touching the
 * database.
 *
 * @param schema  Postgres schema for checkpoint tables (default "public").
 */
export function getPostgresCheckpointer(schema: string = "public"): PostgresSaver {
  if (cached) return cached;
  cached = PostgresSaver.fromConnString(readConnectionString(), { schema });
  return cached;
}

/**
 * `PostgresSaver.setup()` をプロセス内で 1 度だけ実行する。複数の compose
 * セッションが並行起動しても DDL は 1 回しか走らない。
 *
 * Idempotent `setup()` runner. Subsequent calls return the cached promise so
 * concurrent compose-session starts do not race to create the checkpoint
 * tables.
 */
export async function ensurePostgresCheckpointerSetup(schema: string = "public"): Promise<void> {
  if (!setupOnce) {
    const saver = getPostgresCheckpointer(schema);
    setupOnce = saver.setup();
  }
  return setupOnce;
}

/**
 * テスト用にキャッシュを破棄する。本番コードからは呼ばない。
 *
 * Drops the cached singleton. Test-only.
 */
export function __resetPostgresCheckpointerForTests(): void {
  cached = null;
  setupOnce = null;
}
