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
 * @returns 初期値は 0。取得成功で値を更新し、失敗時は直前の取得値を維持する
 *          （誤った 0 表示でフラッシュしないため）。
 *          / Starts at 0; updates on successful fetches and preserves the last
 *          successful value when a refresh fails (so the badge does not flash
 *          to 0 on transient errors).
 */
export function useApiErrorActiveCount(): number {
  const [count, setCount] = useState(0);
  const isMountedRef = useRef(true);
  // ポーリングと visibilitychange の発火が重なると、遅い古いリクエストが
  // 新しい結果を上書きする恐れがある。`useApiErrors` と同じパターンで
  // 「最新リクエスト ID」だけを採用するようガードする。
  //
  // Polling and visibilitychange can race; a slow earlier response would
  // otherwise overwrite a fresher one. Mirror `useApiErrors`' pattern and
  // keep only the latest request's result.
  const latestRequestRef = useRef(0);

  useEffect(() => {
    isMountedRef.current = true;

    const fetchCount = async () => {
      const requestId = ++latestRequestRef.current;
      try {
        const results = await Promise.all(
          ACTIVE_API_ERROR_STATUSES.map((status) => getApiErrors({ status, limit: 1 })),
        );
        if (!isMountedRef.current || requestId !== latestRequestRef.current) return;
        const total = results.reduce((sum, r) => sum + r.total, 0);
        setCount(total);
      } catch {
        // バッジ取得失敗時は表示を更新しない（古い値を維持して誤った 0 表示を避ける）。
        // Swallow errors to keep stale-but-correct count rather than flashing 0.
      }
    };

    // 初回ブートストラップもポーリングと同じ可視性ガードに従わせる。バックグラウンド
    // タブで mount された際に fan-out リクエストを走らせない。
    // Apply the same visibility guard to the bootstrap fetch so a tab that
    // mounts while hidden does not pay the full fan-out before any tick fires.
    if (typeof document === "undefined" || !document.hidden) {
      void fetchCount();
    }
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
      isMountedRef.current = false;
      // unmount 後の遅延応答も確実に破棄するため request id を進めておく。
      // Bump the request id on unmount so any in-flight response is discarded.
      latestRequestRef.current += 1;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return count;
}
