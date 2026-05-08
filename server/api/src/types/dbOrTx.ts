import type { Database } from "./index.js";

/**
 * Drizzle の DB またはトランザクション引数。サービスを route 側トランザクションに参加させるため。
 *
 * Drizzle database handle or transaction callback argument — lets services join a route-level tx.
 */
export type DbOrTx = Parameters<Parameters<Database["transaction"]>[0]>[0] | Database;
