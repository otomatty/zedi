/**
 * Multi-step Claude Code workflow UI (Issue #462).
 * Claude Code マルチステップワークフロー UI（Issue #462）。
 */

import { useWorkflowPanelLogic } from "@/hooks/useWorkflowPanelLogic";
import { WorkflowPanelForm } from "./WorkflowPanelForm";

/**
 * Workflow editor and runner embedded in the AI chat panel.
 * AI チャットパネルに埋め込むワークフロー編集・実行。
 */
export function AIChatWorkflowPanel() {
  const logic = useWorkflowPanelLogic();
  return <WorkflowPanelForm {...logic} />;
}
