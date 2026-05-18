import type { SelectedTags } from "@/types/tagFilter";
import { parseTagsParam } from "./urlTagsCodec";

/**
 * ノート既定値とユーザー上書きをマージするための純関数群。
 * Pure resolvers that merge note-side defaults with client-side overrides.
 *
 * - {@link resolveShowFilterBar}: フィルタバーの表示 ON/OFF
 *   (DB の `show_tag_filter_bar` ＋ ユーザーの localStorage 上書き)。
 * - {@link resolveInitialSelectedTags}: 初期選択タグ
 *   (URL \> ノート `default_filter_tags` \> 何もない)。
 */

/**
 * ユーザー上書きを優先し、なければノート既定値を返す。
 * Returns the user override when set, otherwise the note default.
 *
 * @param noteDefault - notes.show_tag_filter_bar / Note's DB default.
 * @param userOverride - localStorage の上書き (`undefined` = 既定に従う)。
 *   The client-side override; `undefined` means "follow the note default".
 */
export function resolveShowFilterBar(
  noteDefault: boolean,
  userOverride: boolean | undefined,
): boolean {
  return userOverride ?? noteDefault;
}

/**
 * 初期選択タグの解決。URL に値があればそれを最優先で採用し、無ければノートの
 * `default_filter_tags` を {@link parseTagsParam} 互換にパースして使う。どちらも
 * 無ければ `none-selected`。
 *
 * Resolve the initial selected tags by precedence: URL \> note default \>
 * none-selected. The note default array is run through {@link parseTagsParam}
 * so the same normalization (lower-casing, dedupe, `__none__` exclusivity)
 * applies to both sources.
 *
 * @param urlRaw - `?tags=` クエリの raw 値 / Raw `?tags=` query value.
 * @param noteDefaultTags - notes.default_filter_tags (text[])。`__none__` も
 *   含み得る。 / `notes.default_filter_tags`; may include `__none__`.
 * @returns 解決済みフィルタ状態 / Resolved filter state.
 */
export function resolveInitialSelectedTags(
  urlRaw: string | null | undefined,
  noteDefaultTags: readonly string[] | null | undefined,
): SelectedTags {
  const fromUrl = parseTagsParam(urlRaw);
  if (fromUrl.kind !== "none-selected") return fromUrl;
  if (!noteDefaultTags || noteDefaultTags.length === 0) {
    return { kind: "none-selected" };
  }
  return parseTagsParam(noteDefaultTags.join(","));
}
