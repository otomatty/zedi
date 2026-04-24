import React from "react";
import type { Editor } from "@tiptap/core";
import type { WikiLinkSuggestionState } from "../extensions/wikiLinkSuggestionPlugin";
import {
  WikiLinkSuggestion,
  type SuggestionItem,
  type WikiLinkSuggestionHandle,
} from "../extensions/WikiLinkSuggestion";
import { useWikiLinkCandidates } from "@/hooks/useWikiLinkCandidates";

interface WikiLinkSuggestionLayerProps {
  editor: Editor | null;
  suggestionState: WikiLinkSuggestionState | null;
  position: { top: number; left: number } | null;
  suggestionRef: React.RefObject<WikiLinkSuggestionHandle>;
  onSelect: (item: SuggestionItem) => void;
  onClose: () => void;
  /**
   * 編集中ページの noteId。候補スコープを個人 (`null`) / 同一ノート
   * (`string`) に絞り込むために使用する。Issue #713 Phase 4。
   *
   * Owning note ID of the page being edited. Used to scope suggestion
   * candidates to personal (`null`) or same-note (`string`). See issue #713
   * Phase 4.
   */
  pageNoteId: string | null;
}

/**
 * WikiLink サジェスト UI のフローティング層。`useWikiLinkCandidates` で
 * スコープ（個人 / ノート）に応じた候補ページを取得し、`WikiLinkSuggestion`
 * に渡す。Issue #713 Phase 4。
 *
 * Floating layer for the WikiLink suggestion popup. Fetches scope-aware
 * candidate pages via `useWikiLinkCandidates` and forwards them to
 * `WikiLinkSuggestion`. See issue #713 Phase 4.
 */
export const WikiLinkSuggestionLayer: React.FC<WikiLinkSuggestionLayerProps> = ({
  editor,
  suggestionState,
  position,
  suggestionRef,
  onSelect,
  onClose,
  pageNoteId,
}) => {
  const { pages } = useWikiLinkCandidates(pageNoteId);

  if (!suggestionState?.active || !suggestionState.range || !position || !editor) return null;

  return (
    <div
      className="absolute z-50"
      style={{
        top: position.top,
        left: position.left,
      }}
    >
      <WikiLinkSuggestion
        ref={suggestionRef}
        editor={editor}
        query={suggestionState.query}
        range={suggestionState.range}
        onSelect={onSelect}
        onClose={onClose}
        pages={pages}
      />
    </div>
  );
};
