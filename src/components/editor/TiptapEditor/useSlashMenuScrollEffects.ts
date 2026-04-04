/**
 * Scrolls the active slash menu row into view (main list or path section).
 * スラッシュメニュー（メイン／パス）の選択行をビュー内にスクロール。
 */

import { useEffect, type RefObject } from "react";

/**
 * Keeps the selected main-row and path-row buttons scrolled into view.
 * メイン行とパス行の選択ボタンが見えるようスクロールする。
 */
export function useSlashMenuScrollEffects(
  listRef: RefObject<HTMLDivElement | null>,
  pathSectionRef: RefObject<HTMLDivElement | null>,
  selectedIndex: number,
  pathSectionActive: boolean,
  pathSelectedIndex: number,
  pathSuggestionsLength: number,
): void {
  useEffect(() => {
    if (pathSectionActive) return;
    if (!listRef.current) return;
    const buttons = listRef.current.querySelectorAll("button");
    const target = buttons[selectedIndex];
    if (target) {
      target.scrollIntoView({ block: "nearest" });
    }
  }, [listRef, pathSectionActive, selectedIndex]);

  useEffect(() => {
    if (!pathSectionActive || !pathSectionRef.current) return;
    const buttons = pathSectionRef.current.querySelectorAll("button");
    const target = buttons[pathSelectedIndex];
    target?.scrollIntoView({ block: "nearest" });
  }, [pathSectionActive, pathSectionRef, pathSelectedIndex, pathSuggestionsLength]);
}
