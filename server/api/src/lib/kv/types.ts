/**
 * KvStore — Redis / Cloudflare Durable Objects を吸収する KV 抽象 (#1093)
 *
 * 現行の Redis 用途（レート制限カウンタ・ワンタイムコード・MCP deny-list）を
 * 賄う最小のインターフェース。Railway (Node) では ioredis 実装、Cloudflare
 * Workers では Durable Object 実装が注入される。
 *
 * Minimal key-value abstraction over Redis (Node/Railway) and Durable Objects
 * (Cloudflare Workers), covering rate-limit counters, one-time auth codes,
 * and the MCP token deny-list.
 */
export interface KvStore {
  /** キーの値を取得する。無ければ null。 / GET; null when missing. */
  get(key: string): Promise<string | null>;

  /** TTL 付きで値を保存する。 / SETEX equivalent. */
  setex(key: string, ttlSec: number, value: string): Promise<void>;

  /**
   * 値を原子的に取得して削除する（ワンタイムコード消費用）。
   * Atomically read-and-delete (one-time code consumption). Null when missing.
   */
  getdel(key: string): Promise<string | null>;

  /**
   * カウンタを原子的にインクリメントし、キー新規作成時のみ TTL を設定する
   * （固定ウィンドウ）。戻り値はインクリメント後のカウント。
   *
   * Atomic INCR with EXPIRE-on-create (fixed window — the TTL must NOT be
   * refreshed on subsequent increments). Returns the post-increment count.
   */
  incrWithTtl(key: string, ttlSec: number): Promise<number>;

  /**
   * 残り TTL を秒で返す。キーが無い / TTL が無い場合は null。
   * Remaining TTL in seconds; null when the key is missing or has no TTL.
   */
  ttl(key: string): Promise<number | null>;
}
