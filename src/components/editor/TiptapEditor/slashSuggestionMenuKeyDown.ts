/**
 * Keyboard routing for {@link SlashSuggestionMenu}.
 * {@link SlashSuggestionMenu} のキーボード処理。
 */

import type { Dispatch, SetStateAction } from "react";

/** Snapshot for slash menu key handling. / スラッシュメニューキー処理用スナップショット */
export interface SlashSuggestionMenuKeyState {
  itemsLength: number;
  selectedIndex: number;
}

/** Setters and actions for slash menu keys. / キー処理用の setter とアクション */
export interface SlashSuggestionMenuKeyActions {
  setSelectedIndex: Dispatch<SetStateAction<number>>;
  selectItem: (index: number) => void;
  onClose: () => void;
}

/**
 * Handles a key event for the slash menu; returns true if the event was consumed.
 * スラッシュメニューのキーイベントを処理する。取り込んだら true。
 */
export function handleSlashSuggestionMenuKeyDown(
  event: KeyboardEvent,
  state: SlashSuggestionMenuKeyState,
  actions: SlashSuggestionMenuKeyActions,
): boolean {
  if (event.key === "Escape") {
    event.preventDefault();
    actions.onClose();
    return true;
  }
  if (state.itemsLength === 0) return false;

  // Move from the index on screen (already clamped to the list), wrapping at both ends.
  const current = state.selectedIndex;
  if (event.key === "ArrowUp") {
    event.preventDefault();
    actions.setSelectedIndex(current <= 0 ? state.itemsLength - 1 : current - 1);
    return true;
  }

  if (event.key === "ArrowDown") {
    event.preventDefault();
    actions.setSelectedIndex(current >= state.itemsLength - 1 ? 0 : current + 1);
    return true;
  }

  if (event.key === "Enter") {
    event.preventDefault();
    actions.selectItem(state.selectedIndex);
    return true;
  }

  return false;
}
