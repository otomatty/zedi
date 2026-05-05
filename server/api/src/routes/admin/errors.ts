/**
 * `GET /api/admin/errors`, `GET /api/admin/errors/:id`,
 * `PATCH /api/admin/errors/:id` — 管理画面用 API エラー一覧 / 詳細 / 状態更新。
 *
 * Admin-only API for the `api_errors` workflow board (Epic #616 Phase 1).
 * Authentication & admin role enforcement happen at the parent
 * `/api/admin/*` mount; this router only handles request shaping and
 * delegates to `apiErrorService` for DB access.
 *
 * @see ../../services/apiErrorService.ts
 * @see https://github.com/otomatty/zedi/issues/616
 * @see https://github.com/otomatty/zedi/issues/803
 */
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import {
  ALLOWED_API_ERROR_STATUS_TRANSITIONS,
  ApiErrorInvalidTransitionError,
  ApiErrorStatusConflictError,
  API_ERROR_LIST_DEFAULT_LIMIT,
  API_ERROR_LIST_MAX_LIMIT,
  getApiErrorById,
  listApiErrors,
  updateApiErrorStatus,
} from "../../services/apiErrorService.js";
import {
  ApiErrorStreamCapacityExceededError,
  publishApiErrorUpdate,
  subscribeApiErrorUpdates,
} from "../../services/apiErrorBroadcaster.js";
import type { ApiError, ApiErrorSeverity, ApiErrorStatus } from "../../schema/apiErrors.js";
import type { AppEnv } from "../../types/index.js";

const app = new Hono<AppEnv>();

// 単一の Source of truth から status の許容値を導出する。サービス側で
// `ApiErrorStatus` を増やすと自動的にこのリストにも反映され、ドリフトを防げる。
// Derive the accepted status values from the single source of truth in
// `apiErrorService`. Adding a new status to `ApiErrorStatus` automatically
// expands the transition map and therefore this list, preventing drift.
const VALID_STATUSES = Object.keys(
  ALLOWED_API_ERROR_STATUS_TRANSITIONS,
) as readonly ApiErrorStatus[];
const VALID_SEVERITIES = ["high", "medium", "low", "unknown"] as const;

/**
 * UUID v1〜v5 を許容する正規表現。`api_errors.id` は `uuid` 型なので
 * 不正な形式が来た時点で 404 を返し、Postgres まで投げない（500 を防ぐ）。
 *
 * RFC 4122 UUID matcher (any version). `api_errors.id` is a Postgres `uuid`
 * column, so passing a malformed string would surface as a 500 from the DB.
 * Reject early with 404 to keep the route resilient to garbage input.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * クエリ文字列を `ApiErrorStatus` に変換する。空 / 不正値は `null`。
 * Parse a query value into a valid `ApiErrorStatus`, returning `null` for
 * missing or unrecognized inputs.
 */
function parseStatus(raw: string | undefined): ApiErrorStatus | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  return (VALID_STATUSES as readonly string[]).includes(trimmed)
    ? (trimmed as ApiErrorStatus)
    : null;
}

/**
 * クエリ文字列を `ApiErrorSeverity` に変換する。空 / 不正値は `null`。
 * Parse a query value into a valid `ApiErrorSeverity`, returning `null` for
 * missing or unrecognized inputs.
 */
function parseSeverity(raw: string | undefined): ApiErrorSeverity | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  return (VALID_SEVERITIES as readonly string[]).includes(trimmed)
    ? (trimmed as ApiErrorSeverity)
    : null;
}

/**
 * 整数のクエリパラメータを範囲内に丸める。
 * Clamp an integer query parameter into `[lo, hi]`, falling back to `fallback`
 * for missing or non-finite inputs.
 */
function clampInt(raw: string | undefined, fallback: number, lo: number, hi: number): number {
  if (raw === undefined) return fallback;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(lo, n), hi);
}

/**
 * GET /api/admin/errors — 一覧取得（ページネーション + フィルタ）。
 *
 * クエリ:
 * - `status`: open / investigating / resolved / ignored
 * - `severity`: high / medium / low / unknown
 * - `limit`: 1〜200（既定 50） / `offset`: 0〜
 *
 * GET /api/admin/errors — paginated list with optional status / severity
 * filters. Unknown query values are silently dropped (treated as no filter)
 * to keep the admin UI forgiving when extending the enums.
 */
app.get("/", async (c) => {
  const db = c.get("db");
  const status = parseStatus(c.req.query("status"));
  const severity = parseSeverity(c.req.query("severity"));
  const limit = clampInt(
    c.req.query("limit"),
    API_ERROR_LIST_DEFAULT_LIMIT,
    1,
    API_ERROR_LIST_MAX_LIMIT,
  );
  const offset = clampInt(c.req.query("offset"), 0, 0, Number.MAX_SAFE_INTEGER);

  const { rows, total } = await listApiErrors(db, {
    status: status ?? undefined,
    severity: severity ?? undefined,
    limit,
    offset,
  });

  return c.json({ errors: rows, total, limit, offset });
});

/**
 * SSE で送信するイベントの payload を ApiError 行から組み立てる。
 * timestamps は Date のまま JSON.stringify すると ISO 文字列になる。クライアントは
 * `ApiErrorRow` として消費する。
 *
 * Build the SSE event payload from an `ApiError` row. Date instances
 * stringify to ISO 8601 so the wire shape matches the REST `ApiErrorRow`.
 */
function serializeRowEvent(row: ApiError): string {
  return JSON.stringify(row);
}

/**
 * SSE 接続のキープアライブ間隔 (ms)。プロキシや LB がアイドル接続を切る前に
 * コメント行を送って TCP を温存する。
 *
 * Keep-alive interval (ms) for SSE connections. Proxies / load balancers tend
 * to drop idle TCP after 30–60 s; emit a comment line periodically so the
 * stream stays open without producing visible events on the client.
 */
const SSE_KEEPALIVE_MS = 25_000;

/**
 * GET /api/admin/errors/stream — `text/event-stream` で `api_errors` の更新を
 * リアルタイム配信する (Epic #616 Phase 2 / issue #807)。`adminRequired` は
 * 親ルート (`/api/admin`) で適用済み。
 *
 * クライアントは `EventSource('/api/admin/errors/stream')` で接続し、
 * `update` イベントの `data` を `ApiErrorRow` としてパースする。受信側は同 ID
 * の行を最新値で置換し、未知の ID なら一覧の先頭に追加する想定。
 *
 * GET /api/admin/errors/stream — Server-Sent Events feed of `api_errors`
 * updates (Epic #616 Phase 2 / issue #807). Browsers consume it via
 * `EventSource`; each `update` event carries one `ApiErrorRow` JSON payload so
 * the admin UI can replace the row in place (or prepend on first sight)
 * without a full refetch.
 *
 * - 503: 同時接続数の上限に達している。クライアントは backoff 後に再接続する。
 * - 200: 接続確立後、最初に `: connected` コメント行と `retry: 30000` を返す。
 *
 * - 503: subscriber cap reached; client must back off before reconnecting.
 * - 200: on connect, emits a `: connected` comment plus a `retry: 30000` hint
 *   so the browser's auto-reconnect waits 30 s instead of the default ~3 s.
 */
app.get("/stream", (c) => {
  return streamSSE(
    c,
    async (stream) => {
      // EventSource は接続成功直後の最初のイベントを待つので、空っぽの応答を
      // 返さないよう必ずコメントと retry ヒントを送る。
      // EventSource holds the request "pending" until the first event lands;
      // emit a comment + retry hint so the browser commits to the connection
      // and uses our preferred reconnect delay.
      await stream.writeSSE({ data: "", event: "ready", retry: 30_000 });

      let unsubscribe: (() => void) | null = null;
      try {
        // すべての更新を購読。送信は async なのでイベントを内部キューに溜め、
        // 順序を保ったまま flush する。
        // Subscribe and queue events; SSE writes are async but listener
        // callbacks must be sync, so we serialize through a microtask chain.
        let writeChain: Promise<void> = Promise.resolve();
        unsubscribe = subscribeApiErrorUpdates((row) => {
          writeChain = writeChain
            .then(async () => {
              if (stream.aborted || stream.closed) return;
              await stream.writeSSE({ event: "update", data: serializeRowEvent(row) });
            })
            .catch((err) => {
              const message = err instanceof Error ? err.message : String(err);
              console.error(`[admin-errors-stream] write failed: ${message}`);
            });
        });
      } catch (err) {
        if (err instanceof ApiErrorStreamCapacityExceededError) {
          await stream.writeSSE({
            event: "error",
            data: JSON.stringify({ error: "subscriber cap reached" }),
          });
          await stream.close();
          return;
        }
        throw err;
      }

      stream.onAbort(() => {
        unsubscribe?.();
      });

      // クライアントが切断するまでキープアライブを送り続ける。
      // sleep が abort で resolve すると while を抜けて handler が終了し、
      // ここまで来たら `onAbort` で unsubscribe 済み。
      // Heartbeat loop: emit a comment line every SSE_KEEPALIVE_MS so idle
      // proxies (and our own server) don't tear down the TCP connection.
      // Exits naturally when the client disconnects (sleep resolves on abort).
      while (!stream.aborted && !stream.closed) {
        await stream.sleep(SSE_KEEPALIVE_MS);
        if (stream.aborted || stream.closed) break;
        // SSE コメント行（`:` で始まる）はクライアントには配信されない。
        // SSE comment lines (leading `:`) are ignored by the EventSource API
        // but keep the underlying connection alive.
        await stream.writeSSE({ data: "", event: "ping" });
      }

      unsubscribe?.();
    },
    async (err, stream) => {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[admin-errors-stream] handler error: ${message}`);
      try {
        await stream.writeSSE({ event: "error", data: JSON.stringify({ error: "stream error" }) });
      } catch {
        /* swallow — connection likely closed */
      }
    },
  );
});

/**
 * GET /api/admin/errors/:id — 詳細取得。
 * GET /api/admin/errors/:id — fetch a single row by primary key.
 */
app.get("/:id", async (c) => {
  const id = c.req.param("id");
  if (!UUID_RE.test(id)) {
    return c.json({ error: "Not found" }, 404);
  }
  const db = c.get("db");
  const row = await getApiErrorById(db, id);
  if (!row) {
    return c.json({ error: "Not found" }, 404);
  }
  return c.json({ error: row });
});

/**
 * PATCH /api/admin/errors/:id — ワークフロー状態 (`status`) を更新する。
 *
 * - 400: 不正な JSON、未知の status、許可されていない遷移
 * - 404: 行が存在しない
 * - 409: 並行更新が検知された (`ApiErrorStatusConflictError`)
 *
 * PATCH /api/admin/errors/:id — update workflow `status`.
 *
 * - 400: invalid JSON, unknown status, or disallowed transition
 * - 404: row not found
 * - 409: `ApiErrorStatusConflictError` from a concurrent update
 */
app.patch("/:id", async (c) => {
  const id = c.req.param("id");
  if (!UUID_RE.test(id)) {
    return c.json({ error: "Not found" }, 404);
  }
  const db = c.get("db");

  let body: { status?: unknown } | null;
  try {
    body = await c.req.json<{ status?: unknown } | null>();
  } catch {
    return c.json({ error: "invalid JSON body" }, 400);
  }

  // `c.req.json()` は body が "null" や非オブジェクトでも throw しない場合がある。
  // ここで明示的にガードしないと `body.status` で TypeError になる。
  // Hono's `c.req.json()` doesn't throw on a literal `null` or non-object body,
  // so guard explicitly before reading `.status`.
  if (!body || typeof body !== "object" || typeof body.status !== "string") {
    return c.json({ error: "status is required" }, 400);
  }
  const nextStatus = parseStatus(body.status);
  if (!nextStatus) {
    return c.json(
      {
        error: `status must be one of ${VALID_STATUSES.join(", ")}`,
      },
      400,
    );
  }

  try {
    const row = await updateApiErrorStatus(db, { id, nextStatus });
    if (!row) {
      return c.json({ error: "Not found" }, 404);
    }
    // SSE 購読者へ最新行を配信。失敗してもステータス更新は成功扱いにする
    // （broadcaster は in-memory なので例外時は購読者側で polling fallback を期待）。
    // Notify SSE subscribers; errors here must not flip the PATCH response from
    // 200 to 5xx because the DB write already succeeded.
    publishApiErrorUpdate(row);
    return c.json({ error: row });
  } catch (err) {
    if (err instanceof ApiErrorStatusConflictError) {
      return c.json({ error: "status changed concurrently; refetch and retry" }, 409);
    }
    if (err instanceof ApiErrorInvalidTransitionError) {
      return c.json({ error: err.message }, 400);
    }
    throw err;
  }
});

export default app;
