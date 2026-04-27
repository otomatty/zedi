import { useCallback, useRef, useState } from "react";
import type { WikiLinkSuggestionState } from "../extensions/wikiLinkSuggestionPlugin";
import type { SlashSuggestionState } from "../extensions/slashSuggestionPlugin";
import type { TagSuggestionState } from "../extensions/tagSuggestionPlugin";
import type { WikiLinkSuggestionHandle } from "../extensions/WikiLinkSuggestion";
import type { TagSuggestionHandle } from "../extensions/TagSuggestion";
import type { SlashSuggestionHandle } from "./SlashSuggestionLayer";
import {
  isSameSlashSuggestionState,
  isSameTagSuggestionState,
  isSameWikiLinkSuggestionState,
} from "./suggestionStateUtils";

/**
 * WikiLink / Slash / Tag サジェストの state と ref を管理する。
 * useTiptapEditorController の行数削減のため切り出し。
 *
 * Manages suggestion state and refs for WikiLink, Slash, and Tag (`#name`).
 * Extracted from useTiptapEditorController to keep that hook compact.
 */
export function useSuggestionControllers() {
  const [suggestionState, setSuggestionState] = useState<WikiLinkSuggestionState | null>(null);
  const [slashState, setSlashState] = useState<SlashSuggestionState | null>(null);
  const [tagSuggestionState, setTagSuggestionState] = useState<TagSuggestionState | null>(null);
  const suggestionRef = useRef<WikiLinkSuggestionHandle>(null);
  const slashRef = useRef<SlashSuggestionHandle>(null);
  const tagSuggestionRef = useRef<TagSuggestionHandle>(null);

  const handleStateChange = useCallback((state: WikiLinkSuggestionState) => {
    setSuggestionState((prev) => (isSameWikiLinkSuggestionState(prev, state) ? prev : state));
  }, []);
  const handleSlashStateChange = useCallback((state: SlashSuggestionState) => {
    setSlashState((prev) => (isSameSlashSuggestionState(prev, state) ? prev : state));
  }, []);
  const handleTagSuggestionStateChange = useCallback((state: TagSuggestionState) => {
    setTagSuggestionState((prev) => (isSameTagSuggestionState(prev, state) ? prev : state));
  }, []);

  return {
    suggestionState,
    slashState,
    tagSuggestionState,
    suggestionRef,
    slashRef,
    tagSuggestionRef,
    handleStateChange,
    handleSlashStateChange,
    handleTagSuggestionStateChange,
  };
}
