/**
 * createKvStore — ランタイムに応じた KvStore の生成 (#1093 / #1091)
 *
 * Workers では `KV_DO` binding（Durable Object）、Node/Railway では
 * `createKvStoreNode.ts` が注入する Redis ファクトリから生成する。どちらも
 * 無い場合は null（レート制限等は graceful degradation）。
 *
 * Node アダプタ（ioredis）はこのモジュールから静的 import しない — Worker
 * バンドル・workerd 実行から ioredis を物理的に除外するためのモジュール境界
 * （#1091 FR-5。`worker:bundle:check` が不在を検査する）。
 *
 * Creates a KvStore for the current runtime: the `KV_DO` Durable Object
 * binding on Workers, or the injected Node factory (ioredis-backed, wired by
 * `createKvStoreNode.ts` from the Node entry only). ioredis is never imported
 * statically here so it stays out of the Worker bundle.
 */
import type { CloudflareBindings } from "../../types/cloudflare.js";
import { DurableObjectKvStore } from "./doKvStore.js";
import type { KvStore } from "./types.js";

/** Node エントリが注入する KvStore ファクトリ（未注入 = Workers or 未設定）。 */
export type NodeKvStoreFactory = () => KvStore | null;

let nodeKvStoreFactory: NodeKvStoreFactory | null = null;

/**
 * Node 側 KvStore ファクトリを注入する（null でリセット）。
 * Inject the Node-only KvStore factory (pass null to reset).
 */
export function setNodeKvStoreFactory(factory: NodeKvStoreFactory | null): void {
  nodeKvStoreFactory = factory;
}

/**
 * 現在のランタイム向けの {@link KvStore} を返す。未設定なら null。
 * Returns a {@link KvStore} for the current runtime, or null when unconfigured.
 */
export function createKvStore(bindings?: Partial<CloudflareBindings>): KvStore | null {
  if (bindings?.KV_DO) {
    return new DurableObjectKvStore(bindings.KV_DO);
  }
  return nodeKvStoreFactory?.() ?? null;
}
