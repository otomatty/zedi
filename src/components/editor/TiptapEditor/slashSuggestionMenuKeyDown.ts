/**
 * Keyboard routing for {@link SlashSuggestionMenu} (main list vs path completion).
 * {@link SlashSuggestionMenu} のキーボード（メイン一覧とパス補完の切替）。
 */

import type { Dispatch, SetStateAction } from "react";

/** Snapshot for slash menu key handling. / スラッシュメニューキー処理用スナップショット */
export interface SlashSuggestionMenuKeyState {
  itemsLength: number;
  pathCompletionEnabled: boolean;
  pathSuggestions: readonly string[];
  pathSectionActive: boolean;
  pathSelectedIndex: number;
  selectedIndex: number;
}

/** Setters and actions for slash menu keys. / キー処理用の setter とアクション */
export interface SlashSuggestionMenuKeyActions {
  setPathSectionActive: Dispatch<SetStateAction<boolean>>;
  setPathSelectedIndex: Dispatch<SetStateAction<number>>;
  setSelectedIndex: Dispatch<SetStateAction<number>>;
  applyPathPick: (picked: string) => void;
  selectItem: (index: number) => void | Promise<void>;
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
  const pathNav =
    state.pathCompletionEnabled && state.pathSuggestions.length > 0 && state.itemsLength > 0;

  if (pathNav && state.pathSectionActive) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      actions.setPathSelectedIndex((prev) =>
        prev >= state.pathSuggestions.length - 1 ? 0 : prev + 1,
      );
      return true;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (state.pathSelectedIndex <= 0) {
        actions.setPathSectionActive(false);
        actions.setSelectedIndex(state.itemsLength - 1);
      } else {
        actions.setPathSelectedIndex((p) => p - 1);
      }
      return true;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const picked = state.pathSuggestions[state.pathSelectedIndex];
      if (picked) actions.applyPathPick(picked);
      return true;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      actions.onClose();
      return true;
    }
    return false;
  }

  if (state.itemsLength === 0) {
    if (event.key === "Escape") {
      event.preventDefault();
      actions.onClose();
      return true;
    }
    return false;
  }

  if (pathNav && event.key === "ArrowDown" && state.selectedIndex === state.itemsLength - 1) {
    event.preventDefault();
    actions.setPathSectionActive(true);
    actions.setPathSelectedIndex(0);
    return true;
  }

  if (event.key === "ArrowUp") {
    event.preventDefault();
    actions.setSelectedIndex((prev) => (prev <= 0 ? state.itemsLength - 1 : prev - 1));
    return true;
  }

  if (event.key === "ArrowDown") {
    event.preventDefault();
    actions.setSelectedIndex((prev) => (prev >= state.itemsLength - 1 ? 0 : prev + 1));
    return true;
  }

  if (event.key === "Enter") {
    event.preventDefault();
    void actions.selectItem(state.selectedIndex);
    return true;
  }

  if (event.key === "Escape") {
    event.preventDefault();
    actions.onClose();
    return true;
  }

  return false;
}
