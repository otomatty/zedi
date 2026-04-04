/**
 * Props for {@link SlashSuggestionMenu}. / {@link SlashSuggestionMenu} の props
 */

import type { Editor } from "@tiptap/core";

/** Props for {@link SlashSuggestionMenu}. / {@link SlashSuggestionMenu} の props */
export interface SlashSuggestionMenuProps {
  editor: Editor;
  query: string;
  range: { from: number; to: number };
  onClose: () => void;
  claudeAgentSlashAvailable: boolean;
  onAgentBusyChange?: (busy: boolean) => void;
  /** Note-linked workspace for agent cwd + path completion (Issue #461). */
  claudeWorkspaceRoot?: string | null;
}
