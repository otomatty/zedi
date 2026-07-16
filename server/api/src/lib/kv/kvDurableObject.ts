/**
 * KvDurableObject — 論理キー 1 個分の状態を持つ Durable Object (#1093)
 *
 * Durable Object 1 インスタンス = KvStore の論理キー 1 個。DO の入力ゲートにより
 * リクエストは直列化されるため、INCR や GET+DEL が追加ロックなしで原子的になる。
 * 期限切れは遅延判定（読み取り時に expiresAt を検査）+ alarm によるストレージ削除で扱う。
 *
 * Per-key Durable Object backing the Workers-side KvStore. DO input gates
 * serialise requests, making INCR / GET+DEL atomic without extra locking.
 * Expiry is enforced lazily on read, with an alarm cleaning up storage.
 *
 * プロトコル / Protocol: POST / に JSON `{ op, ttlSec?, value? }` を送る。
 *   - get         → { value: string | null }
 *   - setex       → { ok: true }            (requires ttlSec, value)
 *   - getdel      → { value: string | null }
 *   - incrWithTtl → { count: number }       (requires ttlSec)
 *   - ttl         → { ttlSec: number | null }
 */

/** ストレージキー: 保存値 / Storage key for the stored value (string or counter). */
const VALUE_KEY = "value";
/** ストレージキー: 失効時刻 (epoch ms) / Storage key for the expiry timestamp (epoch ms). */
const EXPIRES_AT_KEY = "expiresAt";

interface KvOpRequest {
  op?: string;
  ttlSec?: number;
  value?: string;
}

export class KvDurableObject {
  constructor(private readonly state: DurableObjectState) {}

  /**
   * JSON プロトコル (`{ op, ttlSec?, value? }`) の 1 操作を処理する。
   * Handles one JSON-protocol operation (`{ op, ttlSec?, value? }`).
   */
  async fetch(request: Request): Promise<Response> {
    let body: KvOpRequest;
    try {
      body = (await request.json()) as KvOpRequest;
    } catch {
      return Response.json({ error: "invalid JSON body" }, { status: 400 });
    }

    switch (body.op) {
      case "get":
        return Response.json({ value: await this.readLiveString() });

      case "setex": {
        if (typeof body.ttlSec !== "number" || body.ttlSec <= 0 || typeof body.value !== "string") {
          return Response.json({ error: "setex requires ttlSec > 0 and value" }, { status: 400 });
        }
        await this.writeWithTtl(body.value, body.ttlSec);
        return Response.json({ ok: true });
      }

      case "getdel": {
        const value = await this.readLiveString();
        if (value !== null) {
          await this.state.storage.deleteAll();
          await this.state.storage.deleteAlarm();
        }
        return Response.json({ value });
      }

      case "incrWithTtl": {
        if (typeof body.ttlSec !== "number" || body.ttlSec <= 0) {
          return Response.json({ error: "incrWithTtl requires ttlSec > 0" }, { status: 400 });
        }
        const live = await this.readLive();
        const current = typeof live === "number" ? live : 0;
        const count = current + 1;
        if (count === 1) {
          // 固定ウィンドウ: TTL はキー新規作成時のみ設定する（RedisKvStore と同じ意味論）。
          // Fixed window: set the TTL only on creation, mirroring RedisKvStore.
          await this.writeWithTtl(count, body.ttlSec);
        } else {
          await this.state.storage.put({ [VALUE_KEY]: count });
        }
        return Response.json({ count });
      }

      case "ttl": {
        const expiresAt = (await this.state.storage.get(EXPIRES_AT_KEY)) as number | undefined;
        if (expiresAt === undefined || expiresAt <= Date.now()) {
          return Response.json({ ttlSec: null });
        }
        return Response.json({ ttlSec: Math.ceil((expiresAt - Date.now()) / 1000) });
      }

      default:
        return Response.json({ error: `unknown op: ${String(body.op)}` }, { status: 400 });
    }
  }

  /** alarm: 失効時刻に達したエントリを削除する。 / Deletes the entry once it expires. */
  async alarm(): Promise<void> {
    await this.state.storage.deleteAll();
  }

  /**
   * 生存中の値を返す。期限切れならストレージを掃除して undefined。
   * Returns the live value, cleaning up and returning undefined when expired.
   */
  private async readLive(): Promise<string | number | undefined> {
    const expiresAt = (await this.state.storage.get(EXPIRES_AT_KEY)) as number | undefined;
    if (expiresAt === undefined) return undefined;
    if (expiresAt <= Date.now()) {
      await this.state.storage.deleteAll();
      return undefined;
    }
    return (await this.state.storage.get(VALUE_KEY)) as string | number | undefined;
  }

  /** 生存中の値を文字列として返す（get / getdel 用）。 / Live value as a string, for get/getdel. */
  private async readLiveString(): Promise<string | null> {
    const value = await this.readLive();
    return value === undefined ? null : String(value);
  }

  private async writeWithTtl(value: string | number, ttlSec: number): Promise<void> {
    const expiresAt = Date.now() + ttlSec * 1000;
    await this.state.storage.put({ [VALUE_KEY]: value, [EXPIRES_AT_KEY]: expiresAt });
    await this.state.storage.setAlarm(expiresAt);
  }
}
