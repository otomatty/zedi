import type { WikiLinkSuggestionState } from "../extensions/wikiLinkSuggestionPlugin";
import type { SlashSuggestionState } from "../extensions/slashSuggestionPlugin";
import type { TagSuggestionState } from "../extensions/tagSuggestionPlugin";

/**
 * サジェスト範囲（`{ from, to }`）の値による浅比較。両方 `null` のとき同値、
 * 片方だけ `null` のときは不一致と判定する。`isSame*SuggestionState` から
 * 呼ばれる補助関数で、state 等価判定経由で setState のスキップに使う。
 *
 * Shallow value comparison for a suggestion range (`{ from, to }`). Two
 * `null`s compare equal; a `null` against a value compares unequal. Used by
 * the per-suggestion-kind comparators below to gate setState calls and
 * avoid redundant re-renders.
 *
 * @param a - 比較対象 A / left-hand range, may be `null`
 * @param b - 比較対象 B / right-hand range, may be `null`
 * @returns `from` と `to` が両方一致すれば `true`、両方 `null` でも `true`。
 *   / `true` when both `from` and `to` match (or both args are `null`).
 */
export function isSameSuggestionRange(
  a: { from: number; to: number } | null,
  b: { from: number; to: number } | null,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.from === b.from && a.to === b.to;
}

/**
 * WikiLink (`[[...]]`) サジェスト state の浅比較。`active` / `query` / `range`
 * の 3 値だけを見る（`decorations` は `DecorationSet` の参照が毎回変わるので
 * 比較対象から外す）。`a` が `null` のときは常に不一致扱いで `setState` の
 * 初期化を許す。
 *
 * Shallow comparator for the WikiLink (`[[...]]`) suggestion state. Only
 * inspects `active`, `query`, and `range`; `decorations` is excluded because
 * its `DecorationSet` reference changes every transaction even when no
 * meaningful change occurred. When `a` is `null` the comparator returns
 * `false` so the very first state lands.
 *
 * @param a - 直前の state または `null` / previous state, or `null` for
 *   first-render
 * @param b - 新しい state / new state to compare against
 * @returns 3 つの値がすべて一致すれば `true`。/ `true` when all three
 *   tracked fields match.
 */
export function isSameWikiLinkSuggestionState(
  a: WikiLinkSuggestionState | null,
  b: WikiLinkSuggestionState,
): boolean {
  if (!a) return false;
  return a.active === b.active && a.query === b.query && isSameSuggestionRange(a.range, b.range);
}

/**
 * スラッシュコマンド (`/...`) サジェスト state の浅比較。比較対象は WikiLink と
 * 同じ 3 値（`active` / `query` / `range`）。`decorations` を除外する理由も
 * 同じ。
 *
 * Shallow comparator for the slash-command (`/...`) suggestion state. Same
 * three-field model as the WikiLink variant; `decorations` is excluded for
 * the same reason (reference identity changes per-transaction).
 *
 * @param a - 直前の state または `null` / previous state, or `null`
 * @param b - 新しい state / new state to compare against
 * @returns 3 つの値がすべて一致すれば `true`。/ `true` when all three
 *   tracked fields match.
 */
export function isSameSlashSuggestionState(
  a: SlashSuggestionState | null,
  b: SlashSuggestionState,
): boolean {
  if (!a) return false;
  return a.active === b.active && a.query === b.query && isSameSuggestionRange(a.range, b.range);
}

/**
 * `#name` タグサジェスト用の浅比較ヘルパー。WikiLink / Slash と同じく
 * `active`/`query`/`range` だけを見て、不要な再レンダーを防ぐ。
 *
 * Shallow comparator for the tag suggestion state. Mirrors the WikiLink /
 * slash variants — only `active`, `query`, and `range` matter for re-render
 * gating. See issue #767 (Phase 2).
 */
export function isSameTagSuggestionState(
  a: TagSuggestionState | null,
  b: TagSuggestionState,
): boolean {
  if (!a) return false;
  return a.active === b.active && a.query === b.query && isSameSuggestionRange(a.range, b.range);
}
