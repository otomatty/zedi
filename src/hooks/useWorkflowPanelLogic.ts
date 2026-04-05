/**
 * Composes draft editing and workflow execution for the AI chat workflow panel (Issue #462).
 * AI チャットのワークフローパネル向けにドラフト編集と実行を合成する（Issue #462）。
 */

import { useWorkflowDraft } from "./useWorkflowDraft";
import { useWorkflowRunSession } from "./useWorkflowRunSession";

/**
 * Combined state and actions for {@link AIChatWorkflowPanel}.
 * {@link AIChatWorkflowPanel} 向けの状態とアクションをまとめる。
 */
export function useWorkflowPanelLogic() {
  const draftApi = useWorkflowDraft();
  const runApi = useWorkflowRunSession(draftApi.draft);

  return {
    ...draftApi,
    ...runApi,
  };
}
