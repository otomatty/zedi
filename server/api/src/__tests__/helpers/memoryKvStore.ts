/**
 * テスト用インメモリ KvStore (#1093)
 *
 * `KvStore` インターフェースを Map で忠実に実装した fake。TTL は Date.now()
 * ベースの遅延判定（vitest の fake timers と併用可能）。
 *
 * In-memory KvStore fake for unit tests. TTLs are evaluated lazily against
 * Date.now(), so vitest fake timers work as expected.
 */
import type { KvStore } from "../../lib/kv/index.js";

export interface MemoryKvStore extends KvStore {
  /** 生ストア（アサーション用） / Raw backing store for assertions. */
  _store: Map<string, { value: string | number; expiresAt: number }>;
}

/** インメモリ {@link KvStore} を生成する。 / Creates an in-memory {@link KvStore}. */
export function createMemoryKvStore(): MemoryKvStore {
  const store = new Map<string, { value: string | number; expiresAt: number }>();

  function live(key: string): { value: string | number; expiresAt: number } | undefined {
    const entry = store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      store.delete(key);
      return undefined;
    }
    return entry;
  }

  return {
    _store: store,
    async get(key) {
      const entry = live(key);
      return entry === undefined ? null : String(entry.value);
    },
    async setex(key, ttlSec, value) {
      store.set(key, { value, expiresAt: Date.now() + ttlSec * 1000 });
    },
    async getdel(key) {
      const entry = live(key);
      if (entry === undefined) return null;
      store.delete(key);
      return String(entry.value);
    },
    async incrWithTtl(key, ttlSec) {
      const entry = live(key);
      const count = (typeof entry?.value === "number" ? entry.value : 0) + 1;
      store.set(key, {
        value: count,
        // 固定ウィンドウ: TTL は新規作成時のみ設定する。 / Fixed window: TTL set on create only.
        expiresAt: entry?.expiresAt ?? Date.now() + ttlSec * 1000,
      });
      return count;
    },
    async ttl(key) {
      const entry = live(key);
      if (entry === undefined) return null;
      return Math.ceil((entry.expiresAt - Date.now()) / 1000);
    },
  };
}
