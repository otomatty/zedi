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
  /** When false, agent rows are omitted (web or Claude CLI missing). / false ならエージェント行を出さない */
  claudeAgentSlashAvailable: boolean;
  /** Fires while Claude Code runs for an agent command. / エージェント実行中 */
  onAgentBusyChange?: (busy: boolean) => void;
  /** Note-linked workspace root for agent cwd (desktop). / エージェント cwd 用 */
  claudeWorkspaceRoot?: string | null;
  /** Note id for Tauri path completion (desktop). / パス補完用ノート ID */
  claudeWorkspaceNoteId?: string | null;
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
  claudeAgentSlashAvailable,
  onAgentBusyChange,
  claudeWorkspaceRoot,
  claudeWorkspaceNoteId,
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
        claudeAgentSlashAvailable={claudeAgentSlashAvailable}
        onAgentBusyChange={onAgentBusyChange}
        claudeWorkspaceRoot={claudeWorkspaceRoot}
        claudeWorkspaceNoteId={claudeWorkspaceNoteId}
      />
    </div>
  );
};
