/**
 * `api_errors` 行の更新を SSE 購読者へブロードキャストする in-memory pub/sub。
 *
 * Phase 2 (Epic #616 / issue #807) では管理画面の `/admin/errors` を SSE で
 * リアルタイム更新する。Sentry Webhook / GitHub AI コールバック / 管理画面の
 * PATCH の各経路で `publishApiErrorUpdate` を呼ぶと、`subscribeApiErrorUpdates`
 * で購読中のすべてのリスナーへ最新行が配信される。
 *
 * In-memory pub/sub used by `/admin/errors` SSE streaming (Epic #616 / issue
 * #807). Producers (Sentry webhook, GitHub AI callback, admin PATCH) call
 * `publishApiErrorUpdate` after persisting a row; the SSE route subscribes via
 * `subscribeApiErrorUpdates` and forwards events to connected admins.
 *
 * 単一プロセス前提のため、PoC 規模では十分。スケール時 (複数 worker) は
 * Redis Pub/Sub または Postgres LISTEN/NOTIFY に差し替える設計。
 *
 * Single-process only — fine for the PoC. When the API scales horizontally,
 * swap the implementation for Redis Pub/Sub or Postgres LISTEN/NOTIFY without
 * changing the call sites.
 *
 * @see ../routes/admin/errors.ts
 * @see https://github.com/otomatty/zedi/issues/616
 * @see https://github.com/otomatty/zedi/issues/807
 */
import type { ApiError } from "../schema/apiErrors.js";

/**
 * SSE 購読者の同時接続数上限。`adminRequired` で admin だけがアクセスできるため
 * 不正利用は限定的だが、メモリ・ファイル記述子のフェイルセーフとして上限を設ける。
 *
 * Hard cap on simultaneous SSE subscribers. Admin-gated already, but enforce
 * a defensive ceiling so a buggy client cannot exhaust memory or file
 * descriptors by opening unbounded EventSource connections.
 */
export const API_ERROR_STREAM_MAX_SUBSCRIBERS = 64;

/**
 * `subscribeApiErrorUpdates` のリスナー型。`undefined` は該当行が削除された
 * 場合の通知用に予約しているが、現状は常に最新行を渡す。
 *
 * Listener signature passed to `subscribeApiErrorUpdates`. The optional
 * `undefined` slot is reserved for a future delete notification; today we
 * always emit the latest row.
 */
export type ApiErrorUpdateListener = (row: ApiError) => void;

const listeners = new Set<ApiErrorUpdateListener>();

/**
 * `publishApiErrorUpdate` などが上限超過などで投げるエラー型のシグナル。
 * Returned by `subscribeApiErrorUpdates` when the subscription cap is reached.
 */
export class ApiErrorStreamCapacityExceededError extends Error {
  /**
   * 上限値を含むメッセージで例外を生成する。
   * Build the error with a message that includes the configured cap.
   */
  constructor() {
    super(`api_error stream subscriber cap reached (${API_ERROR_STREAM_MAX_SUBSCRIBERS})`);
    this.name = "ApiErrorStreamCapacityExceededError";
  }
}

/**
 * 新しい SSE 購読者を登録する。返り値の `unsubscribe` で解除する。
 * 上限を超える場合は `ApiErrorStreamCapacityExceededError` を投げ、
 * SSE ルート側で 503 にマップする。
 *
 * Register a new SSE subscriber. Returns an `unsubscribe` callback that the
 * route layer invokes from its abort handler. Exceeding
 * `API_ERROR_STREAM_MAX_SUBSCRIBERS` throws `ApiErrorStreamCapacityExceededError`
 * so the SSE route can answer 503 instead of silently dropping events.
 */
export function subscribeApiErrorUpdates(listener: ApiErrorUpdateListener): () => void {
  if (listeners.size >= API_ERROR_STREAM_MAX_SUBSCRIBERS) {
    throw new ApiErrorStreamCapacityExceededError();
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * 全購読者へ更新行を配信する。リスナーが throw しても他リスナーへ影響しないよう
 * 例外は console.error でログするだけにする。
 *
 * Fan out a row update to every subscriber. A listener that throws is logged
 * and skipped so a single buggy connection does not break broadcast for the
 * rest of the admins.
 */
export function publishApiErrorUpdate(row: ApiError): void {
  for (const listener of listeners) {
    try {
      listener(row);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[api-errors-broadcaster] subscriber threw: ${message}`);
    }
  }
}

/**
 * 現在の購読者数。テスト・運用監視用。
 * Number of currently-registered subscribers. Used by tests and ops dashboards.
 */
export function apiErrorSubscriberCount(): number {
  return listeners.size;
}

/**
 * 全購読者を強制解除する。テスト用に提供。
 * Drop every subscriber. Test-only helper to keep state clean between cases.
 */
export function clearApiErrorSubscribers(): void {
  listeners.clear();
}
