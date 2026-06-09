/**
 * Shared props type for workflow panel subcomponents (Issue #462).
 * ワークフローパネル子コンポーネント共通の props 型（Issue #462）。
 */

/**
 * Props mirror {@link useWorkflowPanelLogic} return shape.
 * {@link useWorkflowPanelLogic} の戻り値と同形。
 */
export type WorkflowPanelFormProps = ReturnType<
  typeof import("@/hooks/useWorkflowPanelLogic").useWorkflowPanelLogic
>;
