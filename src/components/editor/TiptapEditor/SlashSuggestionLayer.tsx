/**
 * Floating slash menu wrapper (positioning only).
 * スラッシュメニューのフローティングラッパー（位置のみ）。
 */

import React from "react";
import type { Editor } from "@tiptap/core";
import type { SlashSuggestionState } from "../extensions/slashSuggestionPlugin";
import { SlashSuggestionMenu } from "./SlashSuggestionMenu";
import type { SlashSuggestionHandle } from "./slashSuggestionHandle";

export type { SlashSuggestionHandle } from "./slashSuggestionHandle";

interface SlashSuggestionLayerProps {
  editor: Editor | null;
  suggestionState: SlashSuggestionState | null;
  position: { top: number; left: number } | null;
  suggestionRef: React.RefObject<SlashSuggestionHandle | null>;
  onClose: () => void;
}

/**
 * Positions the slash menu under the `/` trigger.
 * `/` トリガー下にスラッシュメニューを配置する。
 */
export const SlashSuggestionLayer: React.FC<SlashSuggestionLayerProps> = ({
  editor,
  suggestionState,
  position,
  suggestionRef,
  onClose,
}) => {
  if (!suggestionState?.active || !suggestionState.range || !position || !editor) return null;

  return (
    <div
      className="absolute z-50"
      style={{
        top: position.top,
        left: position.left,
      }}
    >
      <SlashSuggestionMenu
        ref={suggestionRef}
        editor={editor}
        query={suggestionState.query}
        range={suggestionState.range}
        onClose={onClose}
      />
    </div>
  );
};
