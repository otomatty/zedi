import { useRef, useCallback } from "react";

/** 長押し検出の設定 / Long press detection options */
interface UseLongPressOptions {
  /** 長押しと判定するまでの時間(ms) / Duration before long press triggers */
  delay?: number;
  /** スクロールと判定する移動量の閾値(px) / Movement threshold to cancel long press */
  moveThreshold?: number;
}

/**
 * タッチ長押しを検出するフック。移動量が閾値を超えた場合はスクロールと判定しキャンセルする。
 * Hook to detect touch long press. Cancels if touch moves beyond threshold (scroll).
 */
export function useLongPress(
  onLongPress: (position: { x: number; y: number }) => void,
  options: UseLongPressOptions = {},
) {
  const { delay = 500, moveThreshold = 10 } = options;

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startPosRef = useRef<{ x: number; y: number } | null>(null);
  const firedRef = useRef(false);

  const cancel = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      const touch = e.touches[0];
      startPosRef.current = { x: touch.clientX, y: touch.clientY };
      firedRef.current = false;

      timerRef.current = setTimeout(() => {
        firedRef.current = true;
        onLongPress({ x: touch.clientX, y: touch.clientY });
      }, delay);
    },
    [onLongPress, delay],
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!startPosRef.current) return;
      const touch = e.touches[0];
      const dx = touch.clientX - startPosRef.current.x;
      const dy = touch.clientY - startPosRef.current.y;
      if (Math.abs(dx) > moveThreshold || Math.abs(dy) > moveThreshold) {
        cancel();
      }
    },
    [cancel, moveThreshold],
  );

  const onTouchEnd = useCallback(() => {
    cancel();
  }, [cancel]);

  return {
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    /** 長押しが発火したかどうか / Whether the long press was triggered */
    firedRef,
  };
}
