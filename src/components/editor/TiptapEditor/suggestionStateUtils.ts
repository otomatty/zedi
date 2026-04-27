import type { WikiLinkSuggestionState } from "../extensions/wikiLinkSuggestionPlugin";
import type { SlashSuggestionState } from "../extensions/slashSuggestionPlugin";
import type { TagSuggestionState } from "../extensions/tagSuggestionPlugin";

/**
 *
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
 *
 */
export function isSameWikiLinkSuggestionState(
  a: WikiLinkSuggestionState | null,
  b: WikiLinkSuggestionState,
): boolean {
  if (!a) return false;
  return a.active === b.active && a.query === b.query && isSameSuggestionRange(a.range, b.range);
}

/**
 *
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
