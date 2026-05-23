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
 * WikiLink サジェスト UI のフローティング層（本文中の `[[` 用）。
 * `useWikiLinkCandidates` でスコープ（個人 / ノート）に応じた候補ページを
 * 取得し、共通プレゼンテーションである `WikiLinkSuggestion` に流す。
 * 確定時の範囲置換は `onSelect` 側（`useSuggestionEffects`）で行う。
 * Issue #713 Phase 4 / Issue #925（共通化）。
 *
 * Floating layer that mounts the shared `WikiLinkSuggestion` over the
 * editor for the in-body `[[` flow. Scope-aware candidates come from
 * `useWikiLinkCandidates`, and range replacement on confirm is handled
 * by the caller's `onSelect`. The input bar (#924 §2) reuses the same
 * presentation component via its own host. See issues #713 Phase 4 and
 * #925.
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
        query={suggestionState.query}
        onSelect={onSelect}
        onClose={onClose}
        pages={pages}
      />
    </div>
  );
};
