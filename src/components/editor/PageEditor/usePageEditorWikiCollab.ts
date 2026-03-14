import { useCallback, useState } from "react";
import type { UseCollaborationReturn } from "@/lib/collaboration/types";

/**
 * コラボモード時、Wiki 生成内容を Y.Doc に渡すための state とハンドラを提供する。
 * usePageEditorStateAndSync の関数行数削減のため切り出し。
 *
 * Provides state and handlers for passing wiki-generated content to Y.Doc in collab mode.
 * Extracted from usePageEditorStateAndSync to reduce function length.
 */
export function usePageEditorWikiCollab(
  resetWikiBase: () => void,
  collaboration: UseCollaborationReturn | undefined,
) {
  const [wikiContentForCollab, setWikiContentForCollab] = useState<string | null>(null);

  const resetWiki = useCallback(() => {
    setWikiContentForCollab(null);
    resetWikiBase();
  }, [resetWikiBase]);

  const onWikiContentApplied = useCallback(() => {
    setWikiContentForCollab(null);
    collaboration?.flushSave?.();
  }, [collaboration]);

  return { wikiContentForCollab, setWikiContentForCollab, resetWiki, onWikiContentApplied };
}
