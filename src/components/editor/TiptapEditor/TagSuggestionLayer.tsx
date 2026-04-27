import React from "react";
import type { Editor } from "@tiptap/core";
import type { TagSuggestionState } from "../extensions/tagSuggestionPlugin";
import {
  TagSuggestion,
  type TagSuggestionItem,
  type TagSuggestionHandle,
} from "../extensions/TagSuggestion";
import { useTagCandidates } from "@/hooks/useTagCandidates";

interface TagSuggestionLayerProps {
  editor: Editor | null;
  suggestionState: TagSuggestionState | null;
  position: { top: number; left: number } | null;
  suggestionRef: React.RefObject<TagSuggestionHandle>;
  onSelect: (item: TagSuggestionItem) => void;
  onClose: () => void;
  /**
   * 編集中ページの noteId。タグサジェストの候補スコープを WikiLink と同じ
   * 規則で個人 (`null`) / 同一ノート (`string`) に絞るために使う。
   *
   * Owning note id of the page being edited. Scopes tag candidates the same
   * way `WikiLinkSuggestionLayer` scopes WikiLink candidates.
   */
  pageNoteId: string | null;
}

/**
 * タグサジェスト UI の絶対配置層。`useTagCandidates` でスコープ別の候補を
 * 取得し、`TagSuggestion` に渡す。WikiLink 用 `WikiLinkSuggestionLayer` と
 * 同じ構造（描画・データ取得は層で吸収し、本体コンポーネントは純表示）。
 *
 * Floating layer for the `#name` suggestion popup. Fetches scope-aware tag
 * candidates via `useTagCandidates` and forwards them to `TagSuggestion`,
 * mirroring `WikiLinkSuggestionLayer`. See issue #767 (Phase 2).
 */
export const TagSuggestionLayer: React.FC<TagSuggestionLayerProps> = ({
  editor,
  suggestionState,
  position,
  suggestionRef,
  onSelect,
  onClose,
  pageNoteId,
}) => {
  const { candidates } = useTagCandidates(pageNoteId);

  if (!suggestionState?.active || !suggestionState.range || !position || !editor) return null;

  return (
    <div
      className="absolute z-50"
      style={{
        top: position.top,
        left: position.left,
      }}
    >
      <TagSuggestion
        ref={suggestionRef}
        editor={editor}
        query={suggestionState.query}
        range={suggestionState.range}
        onSelect={onSelect}
        onClose={onClose}
        candidates={candidates}
      />
    </div>
  );
};
