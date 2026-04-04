/**
 * Persists insert position for agent slash results (cursor vs end of note).
 * エージェントスラッシュ結果の挿入位置（カーソル／ノート末尾）の永続化。
 */

import type { SlashAgentInsertPosition } from "./types";

const STORAGE_KEY = "zedi.slashAgent.insertPosition";

/**
 * Reads insert position from localStorage; defaults to `cursor`.
 * localStorage から挿入位置を読む。既定は `cursor`。
 */
export function readSlashAgentInsertPosition(): SlashAgentInsertPosition {
  if (typeof window === "undefined") return "cursor";
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v === "end" ? "end" : "cursor";
  } catch {
    return "cursor";
  }
}

/**
 * Persists insert position for future slash runs.
 * 今後のスラッシュ実行用に挿入位置を保存する。
 */
export function writeSlashAgentInsertPosition(position: SlashAgentInsertPosition): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, position);
  } catch {
    /* ignore quota / private mode */
  }
}
