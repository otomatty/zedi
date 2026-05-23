import { useCallback, useSyncExternalStore } from "react";

/**
 * 仮想キーボードがレイアウトビューポートの下部に作るインセット（px）を返す
 * フック。`active` が `true` の間だけ `visualViewport` のリスナーを登録し、
 * `false` または unmount で解除する（issue #927 「focus/blur で update リスナー
 * 登録解除」）。
 *
 * iOS Safari は仮想キーボード表示時に `window.innerHeight` が変わらず
 * `visualViewport.height` だけが縮むため、その差分（さらに `offsetTop` を
 * 引いたもの）が「キーボードに覆われた高さ」になる。Android Chrome の既定は
 * レイアウトビューポート自体がリサイズされ差分が 0 付近になるので、CSS の
 * `position: fixed; bottom: 0;` がそのまま追従する。本フックはどちらの環境
 * でも安全に 0 以上の値を返す。
 *
 * Returns the bottom inset (px) that the on-screen keyboard takes from the
 * layout viewport. Listeners are only attached while `active` is `true`,
 * satisfying #927's "register on focus / unregister on blur" requirement.
 *
 * On iOS Safari the layout viewport height (`window.innerHeight`) stays
 * constant while `visualViewport.height` shrinks, so
 * `innerHeight − vv.height − vv.offsetTop` is the keyboard-covered area.
 * Android Chrome's default behaviour resizes the layout viewport itself, so
 * the difference is ~0 and a plain `bottom: 0` already tracks the keyboard.
 * The hook clamps to `0` so consumers can use the value unconditionally.
 *
 * @param active - リスナーを有効化するかどうか（通常は入力欄の focus 状態）。 / Whether to attach listeners (typically the input focus state).
 * @returns キーボードによる下部インセット（px、無いときは 0）。 / Bottom inset in px (0 when no keyboard).
 */
export function useVirtualKeyboardOffset(active: boolean): number {
  // `useSyncExternalStore` を使うことで「subscribe / unsubscribe」と
  // 「現在値の読み出し」が React の規約通り分離でき、effect 内で setState
  // する必要がなくなる（react-hooks/set-state-in-effect）。
  // Using `useSyncExternalStore` keeps subscribe / read split per React's
  // contract and avoids `setState` inside an effect body
  // (react-hooks/set-state-in-effect).
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!active || typeof window === "undefined") return noop;
      const vv = window.visualViewport;
      if (!vv) return noop;
      vv.addEventListener("resize", onChange);
      vv.addEventListener("scroll", onChange);
      return () => {
        vv.removeEventListener("resize", onChange);
        vv.removeEventListener("scroll", onChange);
      };
    },
    [active],
  );

  const getSnapshot = useCallback(() => {
    if (!active || typeof window === "undefined") return 0;
    const vv = window.visualViewport;
    if (!vv) return 0;
    return Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
  }, [active]);

  // SSR は常に 0（キーボードは存在しない）。
  // SSR snapshot is always 0 — no virtual keyboard outside the browser.
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

function noop(): void {
  // no-op cleanup used while inactive / when visualViewport is unsupported.
}

function getServerSnapshot(): number {
  return 0;
}
