/**
 * Generates a random id for workflow definitions and steps.
 * ワークフロー定義・ステップ用のランダム ID を生成する。
 */

/**
 * Returns a UUID when `crypto.randomUUID` exists; otherwise a fallback string.
 * `crypto.randomUUID` があれば UUID、なければフォールバック文字列。
 */
export function newWorkflowId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `wf-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}
