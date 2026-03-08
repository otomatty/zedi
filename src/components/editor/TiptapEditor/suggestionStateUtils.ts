import type { WikiLinkSuggestionState } from "../extensions/wikiLinkSuggestionPlugin";
import type { SlashSuggestionState } from "../extensions/slashSuggestionPlugin";

export function isSameSuggestionRange(
  a: { from: number; to: number } | null,
  b: { from: number; to: number } | null,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.from === b.from && a.to === b.to;
}

export function isSameWikiLinkSuggestionState(
  a: WikiLinkSuggestionState | null,
  b: WikiLinkSuggestionState,
): boolean {
  if (!a) return false;
  return a.active === b.active && a.query === b.query && isSameSuggestionRange(a.range, b.range);
}

export function isSameSlashSuggestionState(
  a: SlashSuggestionState | null,
  b: SlashSuggestionState,
): boolean {
  if (!a) return false;
  return a.active === b.active && a.query === b.query && isSameSuggestionRange(a.range, b.range);
}
