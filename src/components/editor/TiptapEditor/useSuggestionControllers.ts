import { useCallback, useRef, useState } from "react";
import type { WikiLinkSuggestionState } from "../extensions/wikiLinkSuggestionPlugin";
import type { SlashSuggestionState } from "../extensions/slashSuggestionPlugin";
import type { WikiLinkSuggestionHandle } from "../extensions/WikiLinkSuggestion";
import type { SlashSuggestionHandle } from "./SlashSuggestionLayer";
import { isSameSlashSuggestionState, isSameWikiLinkSuggestionState } from "./suggestionStateUtils";

/**
 * WikiLink / Slash サジェストの state と ref を管理する。
 * useTiptapEditorController の行数削減のため切り出し。
 *
 * Manages suggestion state and refs for WikiLink and Slash.
 * Extracted from useTiptapEditorController to reduce file length.
 */
export function useSuggestionControllers() {
  const [suggestionState, setSuggestionState] = useState<WikiLinkSuggestionState | null>(null);
  const [slashState, setSlashState] = useState<SlashSuggestionState | null>(null);
  const suggestionRef = useRef<WikiLinkSuggestionHandle>(null);
  const slashRef = useRef<SlashSuggestionHandle>(null);

  const handleStateChange = useCallback((state: WikiLinkSuggestionState) => {
    setSuggestionState((prev) => (isSameWikiLinkSuggestionState(prev, state) ? prev : state));
  }, []);
  const handleSlashStateChange = useCallback((state: SlashSuggestionState) => {
    setSlashState((prev) => (isSameSlashSuggestionState(prev, state) ? prev : state));
  }, []);

  return {
    suggestionState,
    slashState,
    suggestionRef,
    slashRef,
    handleStateChange,
    handleSlashStateChange,
  };
}
