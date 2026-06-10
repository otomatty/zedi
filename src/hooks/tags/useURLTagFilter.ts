import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import type { SelectedTags } from "@/types/tagFilter";
import { parseTagsParam, serializeTagsParam } from "@/lib/noteTagFilterBar/urlTagsCodec";

/**
 * URL クエリ `?tags=` をフィルタ状態として読み書きするフック。
 * Hook that exposes `?tags=` as a {@link SelectedTags} state.
 *
 * - 読み込み: `useSearchParams` から `?tags=` を取り出し、`parseTagsParam` で
 *   {@link SelectedTags} に正規化する。
 *   Reads `?tags=` via `useSearchParams` and normalizes it through
 *   {@link parseTagsParam}.
 * - 書き込み: `serializeTagsParam` の結果が `null` ならパラメータを削除し、
 *   それ以外は上書きする。`replace: true` でブラウザ履歴を汚さない。
 *   Writes via `setSearchParams({ replace: true })`; a `null` from
 *   {@link serializeTagsParam} removes the param entirely.
 *
 * URL を単一の真実のソースにするため、選択中タグは localStorage に複製
 * しない（リロード後の再現は URL に乗せる側に任せる）。
 *
 * Selected tags are deliberately not duplicated to localStorage — the URL
 * is the single source of truth so reloads / shares restore the same view.
 */
export function useURLTagFilter(): {
  /** 現在のフィルタ状態 / Current filter state. */
  selected: SelectedTags;
  /** フィルタを差し替える。`{ replace: true }` で履歴を汚さない。 */
  setSelected: (next: SelectedTags) => void;
  /**
   * 全てのタグ選択を解除して `?tags=` をクリアする。`setSelected({ kind: 'none-selected' })`
   * の糖衣構文。
   */
  clear: () => void;
} {
  const [searchParams, setSearchParams] = useSearchParams();
  const raw = searchParams.get("tags");

  const selected = useMemo<SelectedTags>(() => parseTagsParam(raw), [raw]);

  const setSelected = useCallback(
    (next: SelectedTags) => {
      setSearchParams(
        (prev) => {
          const updated = new URLSearchParams(prev);
          const serialized = serializeTagsParam(next);
          if (serialized === null) {
            updated.delete("tags");
          } else {
            updated.set("tags", serialized);
          }
          return updated;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const clear = useCallback(() => {
    setSelected({ kind: "none-selected" });
  }, [setSelected]);

  return { selected, setSelected, clear };
}
