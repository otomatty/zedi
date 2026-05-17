import { type SelectedTags, UNTAGGED_FILTER_TOKEN } from "@/types/tagFilter";

/**
 * `?tags=` URL クエリと {@link SelectedTags} の相互変換を行う純関数群。
 * Pure codec between the `?tags=` URL query and {@link SelectedTags}.
 *
 * 設計原則 / Design contract:
 * - 入力は寛容に正規化する: トリム、空要素除去、大文字小文字を小文字キーに統一、
 *   重複排除、{@link MAX_TAGS} 件まで切り詰め。
 *   Input is normalized leniently: trim, drop empties, lower-case, dedupe,
 *   truncate to {@link MAX_TAGS}.
 * - `__none__` トークンが 1 つでも含まれていれば `untagged-only` を優先返却
 *   (混在は `untagged-only` 単独として扱う)。
 *   The `__none__` token wins: any mix collapses to `untagged-only`.
 * - 正規化の結果 0 件になった場合は `none-selected` を返す。
 *   When normalization yields 0 entries, return `none-selected`.
 * - シリアライズは roundtrip 後に同じ正規化結果が得られることを保証する。
 *   Serialization is roundtrip-stable after normalization.
 */

/**
 * URL クエリに乗せられるタグの最大件数。サーバ側 (`parseTagsFilter`) も同じ
 * 上限を強制する。
 * Maximum tags accepted from the URL; the server enforces the same cap.
 */
export const MAX_TAGS = 20;

/**
 * 1 タグ名の最大文字数。サーバ側のバリデーションと一致させる。
 * Maximum tag-name length, matched on the server.
 */
export const MAX_TAG_LENGTH = 100;

/**
 * `?tags=` の raw 文字列 (`URLSearchParams.get()` の戻り値) を
 * {@link SelectedTags} にパースする。
 *
 * Parse the raw `?tags=` query value (as returned by `URLSearchParams.get()`)
 * into a {@link SelectedTags}.
 *
 * @param raw - `URLSearchParams.get('tags')` の戻り値。`null` / `undefined` は
 *   未指定として扱う。 / Raw query value; `null` / `undefined` means "no param".
 * @returns 正規化済みフィルタ状態 / Normalized filter state.
 */
export function parseTagsParam(raw: string | null | undefined): SelectedTags {
  if (raw == null) return { kind: "none-selected" };

  const tokens = raw
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0 && t.length <= MAX_TAG_LENGTH);

  if (tokens.length === 0) return { kind: "none-selected" };

  // `__none__` is exclusive — any occurrence forces untagged-only mode so
  // mixed URLs like `?tags=__none__,foo` collapse predictably. The comparison
  // is case-insensitive so `?tags=__NONE__` (manual edits / typo'd casing)
  // is still recognised (PR #897 CodeRabbit minor).
  if (tokens.some((t) => t.toLowerCase() === UNTAGGED_FILTER_TOKEN)) {
    return { kind: "untagged-only" };
  }

  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const token of tokens) {
    const key = token.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(key);
    if (normalized.length >= MAX_TAGS) break;
  }

  if (normalized.length === 0) return { kind: "none-selected" };
  return { kind: "tags", tags: normalized };
}

/**
 * {@link SelectedTags} を `?tags=` の raw 文字列にシリアライズする。
 * `none-selected` は `null` を返し、呼び出し元が `URLSearchParams.delete('tags')`
 * を選べるようにする。
 *
 * Serialize a {@link SelectedTags} back to the raw query value.
 * Returns `null` for `none-selected` so callers can drop the param entirely.
 *
 * @param selected - シリアライズ対象 / Value to serialize.
 * @returns `?tags=` に格納する文字列、または `null` (パラメータ削除)。
 *   String to set as `?tags=`, or `null` to remove the param.
 */
export function serializeTagsParam(selected: SelectedTags): string | null {
  switch (selected.kind) {
    case "none-selected":
      return null;
    case "untagged-only":
      return UNTAGGED_FILTER_TOKEN;
    case "tags": {
      const cleaned = dedupLower(selected.tags).slice(0, MAX_TAGS);
      if (cleaned.length === 0) return null;
      return cleaned.join(",");
    }
  }
}

function dedupLower(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const tag of tags) {
    const key = tag.trim().toLowerCase();
    if (!key || key.length > MAX_TAG_LENGTH) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}
