import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ApiErrorRow,
  ApiErrorSeverity,
  ApiErrorStatus,
  GetApiErrorsResponse,
} from "@/api/admin";
import { getApiErrors } from "@/api/admin";

/**
 * SSE が利用できない環境（古いブラウザ、ネットワーク制限）でのフォールバック
 * ポーリング間隔 (ms)。EventSource が確立した後はサーバーから push されるため
 * このタイマーは抑制される。
 *
 * Fallback polling interval (ms) used when the SSE stream is unavailable
 * (older browsers, network restrictions, server 503 from subscriber cap). Once
 * a SSE connection is healthy this timer is suppressed because updates arrive
 * via push.
 */
export const API_ERRORS_POLL_INTERVAL_MS = 30_000;

/**
 * SSE 切断時の再接続バックオフの初期値 (ms) と上限 (ms)。
 * 連続失敗で指数バックオフし、上限に到達したらそのまま継続。
 *
 * Initial / max backoff (ms) used when the SSE connection drops. We grow the
 * delay exponentially up to the cap so a flaky network or server hiccup does
 * not cause a reconnect storm.
 */
const SSE_RECONNECT_INITIAL_MS = 1_000;
const SSE_RECONNECT_MAX_MS = 30_000;

/**
 * `useApiErrors` の入力。
 * Inputs accepted by the hook.
 */
export interface UseApiErrorsParams {
  status?: ApiErrorStatus;
  severity?: ApiErrorSeverity;
  limit?: number;
  offset?: number;
  /**
   * フォールバックポーリング間隔 (ms)。0 を渡すとポーリングを完全無効化する
   * （テスト用途、もしくは SSE 専用にしたい場合）。
   * Fallback polling interval in ms; pass 0 to disable polling entirely
   * (useful for tests or SSE-only environments).
   */
  intervalMs?: number;
  /**
   * SSE エンドポイントを購読しない場合 false。テストや診断用途。
   * Disable the SSE subscription (default: true). Tests can opt out to keep
   * EventSource off the wire.
   */
  enableStream?: boolean;
}

/**
 * `useApiErrors` の戻り値。
 * Hook return shape.
 */
export interface UseApiErrorsResult {
  errors: ApiErrorRow[];
  total: number;
  loading: boolean;
  error: string | null;
  /** SSE が確立しているか（テスト・UI 表示用） / Whether the SSE link is up */
  streamConnected: boolean;
  /** 即時再取得（リクエスト中のレースは内部で処理） / Force refresh (race-safe) */
  refetch: () => Promise<void>;
}

/**
 * SSE で受信した 1 行を既存の `errors` 配列にマージする。
 * 同 ID があれば置換し、無ければ先頭に追加して `total` をインクリメントする。
 *
 * Merge a single SSE-pushed row into the current list state. Matching rows
 * are replaced in place; brand-new ids are prepended (newest-first) and the
 * total count bumps by one so pagination footers stay accurate.
 */
function mergeRow(prev: GetApiErrorsResponse | null, row: ApiErrorRow): GetApiErrorsResponse {
  if (!prev) {
    return { errors: [row], total: 1, limit: 1, offset: 0 };
  }
  const idx = prev.errors.findIndex((r) => r.id === row.id);
  if (idx >= 0) {
    const next = prev.errors.slice();
    next[idx] = row;
    return { ...prev, errors: next };
  }
  return { ...prev, errors: [row, ...prev.errors], total: prev.total + 1 };
}

/**
 * フィルタ条件と SSE で push された行が合致するかを判定する。
 * 合致しないものは UI に出さない（一覧の意味的な整合を保つ）。
 *
 * Decide whether an SSE-pushed row matches the active filter. Mismatches are
 * dropped client-side so a status/severity filter doesn't suddenly surface
 * rows that wouldn't appear in a fresh REST query.
 */
function matchesFilter(
  row: ApiErrorRow,
  status: ApiErrorStatus | undefined,
  severity: ApiErrorSeverity | undefined,
): boolean {
  if (status && row.status !== status) return false;
  if (severity && row.severity !== severity) return false;
  return true;
}

/**
 * `getApiErrors` で初回・フォールバック取得しつつ、`/api/admin/errors/stream`
 * を `EventSource` で購読してリアルタイム更新するフック (Epic #616 Phase 2 /
 * issue #807)。
 *
 * - 接続成功中は `intervalMs` のポーリングを抑制する。
 * - 切断時は exponential backoff で再接続する。可視タブのみ。
 * - アンマウント時は EventSource を必ず close する（fd リーク防止）。
 *
 * Bootstrap the list via REST and subscribe to `/api/admin/errors/stream` for
 * push updates (Epic #616 Phase 2 / issue #807). While the SSE link is up the
 * fallback poller is suppressed; on disconnect we exponentially back off and
 * reconnect (visible tabs only). The EventSource is always closed on unmount
 * to prevent file-descriptor leaks.
 */
export function useApiErrors(params: UseApiErrorsParams = {}): UseApiErrorsResult {
  const {
    status,
    severity,
    limit,
    offset,
    intervalMs = API_ERRORS_POLL_INTERVAL_MS,
    enableStream = true,
  } = params;

  const [data, setData] = useState<GetApiErrorsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [streamConnected, setStreamConnected] = useState(false);

  const isMountedRef = useRef(true);
  const latestRequestRef = useRef(0);
  // 最新フィルタを ref に保持して EventSource の onmessage クロージャから参照する。
  // useEffect 依存に含めると接続を貼り直してしまうのを避ける。
  // Keep the latest filter in a ref so the EventSource handler can read the
  // current value without forcing the SSE effect to tear down + reconnect on
  // every filter change.
  const filterRef = useRef({ status, severity });
  filterRef.current = { status, severity };

  const load = useCallback(
    async (showLoading: boolean) => {
      const requestId = ++latestRequestRef.current;
      if (showLoading && isMountedRef.current) setLoading(true);
      try {
        const result = await getApiErrors({ status, severity, limit, offset });
        if (!isMountedRef.current || requestId !== latestRequestRef.current) return;
        setData(result);
        setError(null);
      } catch (e) {
        if (!isMountedRef.current || requestId !== latestRequestRef.current) return;
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (isMountedRef.current && requestId === latestRequestRef.current) {
          setLoading(false);
        }
      }
    },
    [status, severity, limit, offset],
  );

  useEffect(() => {
    isMountedRef.current = true;
    void load(true);
    return () => {
      isMountedRef.current = false;
    };
  }, [load]);

  // SSE 購読。`enableStream` と `EventSource` 利用可否で短絡する。
  // SSE subscription. Short-circuits when EventSource is unavailable (jsdom,
  // very old browsers) or when the caller opts out (`enableStream: false`).
  useEffect(() => {
    if (!enableStream) return;
    if (typeof EventSource === "undefined") return;

    let es: EventSource | null = null;
    let reconnectTimer: number | null = null;
    let cancelled = false;
    let backoff = SSE_RECONNECT_INITIAL_MS;

    const open = () => {
      if (cancelled) return;
      es = new EventSource("/api/admin/errors/stream", { withCredentials: true });

      es.addEventListener("ready", () => {
        backoff = SSE_RECONNECT_INITIAL_MS;
        if (isMountedRef.current) setStreamConnected(true);
      });

      es.addEventListener("update", (rawEvent) => {
        const ev = rawEvent as MessageEvent<string>;
        let row: ApiErrorRow;
        try {
          row = JSON.parse(ev.data) as ApiErrorRow;
        } catch {
          return;
        }
        const { status: curStatus, severity: curSeverity } = filterRef.current;
        if (!matchesFilter(row, curStatus, curSeverity)) return;
        if (isMountedRef.current) {
          setData((prev) => mergeRow(prev, row));
        }
      });

      // EventSource は接続が切れると自動で再接続する。意図しない無限ループを
      // 避けるため、`onerror` で一度 close して我々の backoff スケジューラに
      // 任せる。
      // EventSource auto-reconnects with a tiny delay, which fights with our
      // backoff. Close the socket on error and reschedule ourselves so a
      // failing endpoint doesn't hammer the server.
      es.onerror = () => {
        if (isMountedRef.current) setStreamConnected(false);
        es?.close();
        es = null;
        if (cancelled) return;
        if (typeof document !== "undefined" && document.hidden) {
          // 隠しタブでは再接続せず、可視化を待つ。
          // Hidden tabs: defer reconnect until the tab is visible again.
          return;
        }
        reconnectTimer = window.setTimeout(() => {
          backoff = Math.min(backoff * 2, SSE_RECONNECT_MAX_MS);
          open();
        }, backoff);
      };
    };

    const onVisible = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      // 可視化されたタイミングで未接続なら即時再接続を試みる。
      // When the tab becomes visible again, eagerly reconnect if we lost the
      // stream while hidden.
      if (!es) {
        backoff = SSE_RECONNECT_INITIAL_MS;
        open();
      }
    };

    open();
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      if (reconnectTimer != null) window.clearTimeout(reconnectTimer);
      es?.close();
      es = null;
      document.removeEventListener("visibilitychange", onVisible);
      if (isMountedRef.current) setStreamConnected(false);
    };
  }, [enableStream]);

  // フォールバックポーリング: SSE が確立していれば抑制する。
  // Fallback polling: suppressed while SSE is healthy so we don't double-load.
  useEffect(() => {
    if (intervalMs <= 0) return;
    if (streamConnected) return;
    const tick = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      void load(false);
    };
    const id = window.setInterval(tick, intervalMs);
    const onVisible = () => {
      if (typeof document !== "undefined" && !document.hidden) {
        void load(false);
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [intervalMs, load, streamConnected]);

  const refetch = useCallback(() => load(false), [load]);

  return {
    errors: data?.errors ?? [],
    total: data?.total ?? 0,
    loading,
    error,
    streamConnected,
    refetch,
  };
}
