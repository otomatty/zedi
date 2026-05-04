import { useEffect, useRef, useState } from "react";
import { ACTIVE_API_ERROR_STATUSES, getApiErrors } from "@/api/admin";
import { API_ERRORS_POLL_INTERVAL_MS } from "./useApiErrors";

/**
 * サイドバーのバッジ用に「未対応 (`open` + `investigating`) 件数」だけを軽量に取得する。
 *
 * `getApiErrors({ status, limit: 1 })` を `ACTIVE_API_ERROR_STATUSES` ごとに 1 回ずつ
 * 叩き、レスポンスの `total` のみ合算する。行データを使わないので最小トラフィックで済む。
 *
 * Lightweight count of "active" errors for the sidebar badge. Issues one
 * `limit:1` call per active status and sums the `total` fields, so we only
 * pay the cost of the COUNT query — not the row payload.
 *
 * @returns 件数 (取得失敗・未認証時は 0) / Count; falls back to 0 on error.
 */
export function useApiErrorActiveCount(): number {
  const [count, setCount] = useState(0);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    let cancelled = false;

    const fetchCount = async () => {
      try {
        const results = await Promise.all(
          ACTIVE_API_ERROR_STATUSES.map((status) => getApiErrors({ status, limit: 1 })),
        );
        if (cancelled || !isMountedRef.current) return;
        const total = results.reduce((sum, r) => sum + r.total, 0);
        setCount(total);
      } catch {
        // バッジ取得失敗時は表示を更新しない（古い値を維持して誤った 0 表示を避ける）。
        // Swallow errors to keep stale-but-correct count rather than flashing 0.
      }
    };

    void fetchCount();
    const id = window.setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      void fetchCount();
    }, API_ERRORS_POLL_INTERVAL_MS);

    const onVisible = () => {
      if (typeof document !== "undefined" && !document.hidden) {
        void fetchCount();
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      isMountedRef.current = false;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return count;
}
