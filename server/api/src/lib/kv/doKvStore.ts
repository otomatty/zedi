/**
 * DurableObjectKvStore — Durable Object namespace を KvStore に適合させるアダプタ (#1093)
 *
 * 論理キーごとに `idFromName(key)` で Durable Object を 1 個割り当て、fetch ベースの
 * JSON プロトコル（{@link KvDurableObject} 参照）で操作を委譲する。
 *
 * Workers-side KvStore adapter. Each logical key maps to its own Durable
 * Object via `idFromName(key)`; operations are delegated over the JSON
 * protocol implemented by {@link KvDurableObject}.
 */
import type { KvStore } from "./types.js";

export class DurableObjectKvStore implements KvStore {
  constructor(private readonly namespace: DurableObjectNamespace) {}

  async get(key: string): Promise<string | null> {
    const res = await this.call(key, { op: "get" });
    return (res as { value: string | null }).value;
  }

  async setex(key: string, ttlSec: number, value: string): Promise<void> {
    await this.call(key, { op: "setex", ttlSec, value });
  }

  async getdel(key: string): Promise<string | null> {
    const res = await this.call(key, { op: "getdel" });
    return (res as { value: string | null }).value;
  }

  async incrWithTtl(key: string, ttlSec: number): Promise<number> {
    const res = await this.call(key, { op: "incrWithTtl", ttlSec });
    return (res as { count: number }).count;
  }

  async ttl(key: string): Promise<number | null> {
    const res = await this.call(key, { op: "ttl" });
    return (res as { ttlSec: number | null }).ttlSec;
  }

  private async call(key: string, body: Record<string, unknown>): Promise<unknown> {
    const stub = this.namespace.get(this.namespace.idFromName(key));
    const res = await stub.fetch("https://kv/", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    });
    if (!res.ok) {
      throw new Error(`KV durable object error (${res.status}): ${await res.text()}`);
    }
    return res.json();
  }
}
