import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ApiErrorRow,
  ApiErrorSeverity,
  ApiErrorStatus,
  GetApiErrorsResponse,
} from "@/api/admin";
import { getApiErrors } from "@/api/admin";

/**
 * Phase 1 でのポーリング間隔 (ms)。WebSocket / Server-Sent Events を導入する Phase 2 で
 * 廃止する。長すぎるとバッジ更新が遅く、短すぎると API 負荷が上がる。
 *
 * Polling interval (ms) used during Phase 1; will be replaced by realtime
 * updates in a later phase. Tuned to keep the badge fresh without hammering
 * the API.
 */
export const API_ERRORS_POLL_INTERVAL_MS = 30_000;

/**
 * `useApiErrors` の入力。
 * Inputs accepted by the polling hook.
 */
export interface UseApiErrorsParams {
  status?: ApiErrorStatus;
  severity?: ApiErrorSeverity;
  limit?: number;
  offset?: number;
  /**
   * ポーリング間隔 (ms)。0 を渡すとポーリングを無効化する（テスト用途）。
   * Polling interval in ms; pass 0 to disable polling (used by tests).
   */
  intervalMs?: number;
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
  /** 即時再取得（リクエスト中のレースは内部で処理） / Force refresh (race-safe) */
  refetch: () => Promise<void>;
}

/**
 * `GET /api/admin/errors` を取得し、定期ポーリングで同期するフック。
 *
 * Phase 1 では realtime 接続が無いため、`API_ERRORS_POLL_INTERVAL_MS` ごとに
 * 再フェッチする。タブが非表示 (`document.hidden`) の間は API 負荷を抑えるため
 * インターバルをスキップし、可視化された時に即時再取得する。
 *
 * Polls `GET /api/admin/errors` on a fixed interval. Skips ticks while the tab
 * is hidden to avoid wasted API traffic, and refetches immediately when the
 * tab becomes visible again.
 *
 * @see https://github.com/otomatty/zedi/issues/616
 * @see https://github.com/otomatty/zedi/issues/804
 */
export function useApiErrors(params: UseApiErrorsParams = {}): UseApiErrorsResult {
  const { status, severity, limit, offset, intervalMs = API_ERRORS_POLL_INTERVAL_MS } = params;

  const [data, setData] = useState<GetApiErrorsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isMountedRef = useRef(true);
  const latestRequestRef = useRef(0);

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

  useEffect(() => {
    if (intervalMs <= 0) return;
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
  }, [intervalMs, load]);

  const refetch = useCallback(() => load(false), [load]);

  return {
    errors: data?.errors ?? [],
    total: data?.total ?? 0,
    loading,
    error,
    refetch,
  };
}
