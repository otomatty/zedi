/**
 * Merged slash items and path-completion suggestions for the slash menu.
 * スラッシュメニュー用の項目マージとパス補完候補。
 */

import { useMemo } from "react";
import type { Editor } from "@tiptap/core";
import {
  matchAgentSlashByQuery,
  shouldOfferPathCompletion,
} from "@/lib/agentSlashCommands/parseAgentSlashQuery";
import { mergeSlashItems } from "./slashAgentMenuHelpers";
import { useWorkspacePathCompletions } from "./useWorkspacePathCompletions";

/**
 * Resolves menu rows and workspace path suggestions from the current query.
 * クエリからメニュー行とワークスペースパス候補を解決する。
 */
export function useSlashSuggestionMenuData(
  query: string,
  editor: Editor,
  t: (key: string) => string,
  claudeAgentSlashAvailable: boolean,
  /** When set, path completion lists under this note's registered workspace (Issue #461). */
  noteWorkspaceNoteId: string | null,
): {
  items: ReturnType<typeof mergeSlashItems>;
  pathCompletionEnabled: boolean;
  pathArgs: string;
  pathSuggestions: string[];
} {
  const items = useMemo(
    () => mergeSlashItems(query, editor, t, claudeAgentSlashAvailable),
    [query, editor, t, claudeAgentSlashAvailable],
  );

  const pathMatch = matchAgentSlashByQuery(query);
  const pathCompletionEnabled =
    claudeAgentSlashAvailable && shouldOfferPathCompletion(query) && pathMatch !== null;
  const pathArgs = pathMatch?.args ?? "";
  const pathSuggestions = useWorkspacePathCompletions(
    pathArgs,
    pathCompletionEnabled,
    noteWorkspaceNoteId,
  );

  return { items, pathCompletionEnabled, pathArgs, pathSuggestions };
}
