import { useCallback, useLayoutEffect, useRef, useState } from "react";

/** コンテナ幅に応じた列数用の閾値（px）。カードをやや小さくするため多めの列数になるよう設定 */
const WIDTH_2 = 360;
const WIDTH_3 = 520;
const WIDTH_4 = 680;
const WIDTH_5 = 880;

/**
 * コンテナ幅からグリッド列数を算出する（2〜6）。
 * ビューポートではなくコンテナ幅で列数を変えるため、AI ドックの開閉等で表示領域が変わっても列数が追従する。
 *
 * Derives grid column count (2–6) from container width so that toggling adjacent
 * panels (e.g. the AI dock) updates the visible column count.
 */
export function widthToColumns(width: number): 2 | 3 | 4 | 5 | 6 {
  if (width < WIDTH_2) return 2;
  if (width < WIDTH_3) return 3;
  if (width < WIDTH_4) return 4;
  if (width < WIDTH_5) return 5;
  return 6;
}

/**
 * 要素の幅を ResizeObserver で監視し、閾値に応じて列数 2〜6 を返す。
 * 初回は useLayoutEffect で即時計測し、スケルトン→コンテンツ切替時も列数が崩れないようにする。
 *
 * @returns ref を計測したいラッパー要素に付与し、columns で grid-cols-{n} を適用する
 */
export function useContainerColumns(): {
  ref: React.RefObject<HTMLDivElement | null>;
  columns: 2 | 3 | 4 | 5 | 6;
} {
  const ref = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState<2 | 3 | 4 | 5 | 6>(2);

  const updateColumns = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.getBoundingClientRect().width;
    setColumns(widthToColumns(w));
  }, []);

  useLayoutEffect(() => {
    updateColumns();
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(updateColumns);
    ro.observe(el);
    return () => ro.disconnect();
  }, [updateColumns]);

  return { ref, columns };
}
