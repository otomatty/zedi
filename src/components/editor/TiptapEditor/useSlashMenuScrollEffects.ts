/**
 * Scrolls the active slash menu row into view.
 * スラッシュメニューの選択行をビュー内にスクロールする。
 */

import { useEffect, type RefObject } from "react";

/**
 * Keeps the selected row button scrolled into view.
 * 選択中の行ボタンが見えるようスクロールする。
 */
export function useSlashMenuScrollEffects(
  listRef: RefObject<HTMLDivElement | null>,
  selectedIndex: number,
): void {
  useEffect(() => {
    if (!listRef.current) return;
    const buttons = listRef.current.querySelectorAll("button");
    buttons[selectedIndex]?.scrollIntoView({ block: "nearest" });
  }, [listRef, selectedIndex]);
}
