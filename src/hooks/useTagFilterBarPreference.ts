import { useCallback, useEffect, useState } from "react";
import { useNote } from "@/hooks/useNoteQueries";
import {
  getShowTagFilterBarOverride,
  setShowTagFilterBarOverride,
} from "@/lib/noteTagFilterBar/preferenceStorage";
import { resolveShowFilterBar } from "@/lib/noteTagFilterBar/resolvePreference";

/**
 * `/notes/:noteId` のタグフィルタバーを表示するかを解決するフック。
 *
 * - 既定: ノートの DB 設定 (`note.showTagFilterBar`)
 * - 上書き: ユーザーの localStorage (`zedi-note-filter-preferences`)
 *
 * Resolve whether the tag filter bar should render on `/notes/:noteId`,
 * combining the note's DB default with the user's localStorage override.
 *
 * `setOverride(undefined)` を呼ぶと localStorage の上書きを削除して「ノート
 * 既定に従う」状態に戻る。3 状態セレクタ (`note default / always show /
 * always hide`) を実装する UI から呼び出すことを想定している。
 *
 * `setOverride(undefined)` clears the user override and reverts to "follow
 * the note default". Designed for the 3-state selector in the filter bar
 * settings menu.
 */
export function useTagFilterBarPreference(noteId: string): {
  /** バーを表示するか / Whether the bar should render. */
  enabled: boolean;
  /** ノート側既定値 / The note's DB default. */
  noteDefault: boolean;
  /** localStorage 上書き値。`undefined` は未設定。/ The user override; `undefined` when unset. */
  userOverride: boolean | undefined;
  /**
   * 上書き値を設定 / 解除する。`undefined` を渡すとノート既定に従う。
   * Set or clear the override; `undefined` reverts to the note default.
   */
  setOverride: (value: boolean | undefined) => void;
} {
  const { note } = useNote(noteId, { allowRemote: true });
  const noteDefault = note?.showTagFilterBar ?? false;

  const [userOverride, setUserOverride] = useState<boolean | undefined>(() =>
    getShowTagFilterBarOverride(noteId),
  );

  // ノート切替時に override を読み直す。同じ noteId のままなら state を維持する。
  // Re-read the override whenever the noteId changes; keep state otherwise so
  // the same tab does not flicker between renders.
  useEffect(() => {
    setUserOverride(getShowTagFilterBarOverride(noteId));
  }, [noteId]);

  const setOverride = useCallback(
    (value: boolean | undefined) => {
      setShowTagFilterBarOverride(noteId, value);
      setUserOverride(value);
    },
    [noteId],
  );

  return {
    enabled: resolveShowFilterBar(noteDefault, userOverride),
    noteDefault,
    userOverride,
    setOverride,
  };
}
