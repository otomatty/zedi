import { useSyncExternalStore } from "react";

/**
 * Viewport width (px) below which the app treats layout as “mobile” for sidebar and shared shell.
 * Matches Tailwind `md` (min-width 768px for `md:` utilities).
 * サイドバー等のシェルでモバイル扱いする閾値（px）。Tailwind の `md` と一致。
 */
export const MOBILE_BREAKPOINT = 768;

function mobileMediaQuery(): string {
  return `(max-width: ${MOBILE_BREAKPOINT - 1}px)`;
}

function subscribe(onStoreChange: () => void): () => void {
  const mql = window.matchMedia(mobileMediaQuery());
  mql.addEventListener("change", onStoreChange);
  return () => mql.removeEventListener("change", onStoreChange);
}

function getSnapshot(): boolean {
  return window.matchMedia(mobileMediaQuery()).matches;
}

/**
 * SSR: no `window`; match client “unknown” → false (`!!undefined` in the previous useState hook).
 * SSR: `window` なし。従来の初回 `undefined` と同様に false 扱い。
 */
function getServerSnapshot(): boolean {
  return false;
}

/**
 * True when viewport width is below {@link MOBILE_BREAKPOINT} (Tailwind `md` breakpoint).
 * ビューポート幅が {@link MOBILE_BREAKPOINT} 未満のとき true。
 */
export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
