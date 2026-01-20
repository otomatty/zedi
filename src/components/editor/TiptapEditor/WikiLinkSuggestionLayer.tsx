import React from "react";
import type { Editor } from "@tiptap/core";
import type { WikiLinkSuggestionState } from "../extensions/wikiLinkSuggestionPlugin";
import {
  WikiLinkSuggestion,
  type SuggestionItem,
  type WikiLinkSuggestionHandle,
} from "../extensions/WikiLinkSuggestion";

interface WikiLinkSuggestionLayerProps {
  editor: Editor | null;
  suggestionState: WikiLinkSuggestionState | null;
  position: { top: number; left: number } | null;
  suggestionRef: React.RefObject<WikiLinkSuggestionHandle>;
  onSelect: (item: SuggestionItem) => void;
  onClose: () => void;
}

export const WikiLinkSuggestionLayer: React.FC<WikiLinkSuggestionLayerProps> = ({
  editor,
  suggestionState,
  position,
  suggestionRef,
  onSelect,
  onClose,
}) => {
  if (!suggestionState?.active || !position || !editor) return null;

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
        range={suggestionState.range!}
        onSelect={onSelect}
        onClose={onClose}
      />
    </div>
  );
};
