/**
 * Multi-step Claude Code workflow (Issue #462).
 * Claude Code マルチステップワークフロー（Issue #462）。
 */

/**
 * One step in a workflow definition.
 * ワークフロー定義の 1 ステップ。
 */
export interface WorkflowStepDefinition {
  /** Stable id for React keys and persistence. / React キーと永続化用の安定 ID */
  id: string;
  /** Short label shown in UI and note. / UI とノートに表示する短いラベル */
  title: string;
  /** Instruction sent to Claude Code for this step. / このステップで Claude Code に渡す指示 */
  instruction: string;
  /**
   * Max agent turns for this step (Claude Agent SDK `maxTurns`).
   * このステップのエージェント最大ターン数（SDK `maxTurns`）。
   */
  maxTurns?: number;
  /**
   * Allowed tools for this step; omit for default sidecar tool set.
   * このステップで許可するツール。省略時は sidecar 既定ツール。
   */
  allowedTools?: string[];
}

/**
 * A saved or template-derived workflow.
 * 保存済みまたはテンプレート由来のワークフロー。
 */
export interface WorkflowDefinition {
  id: string;
  name: string;
  steps: WorkflowStepDefinition[];
  createdAt: number;
  updatedAt: number;
}

/**
 * Lifecycle of a workflow run in the UI engine.
 * UI エンジン上のワークフロー実行ライフサイクル。
 */
export type WorkflowRunPhase = "idle" | "running" | "paused" | "completed" | "aborted";

/**
 * Status of each step during a run.
 * 実行中の各ステップの状態。
 */
export type WorkflowStepRunStatus = "pending" | "running" | "done" | "error";

/**
 * Snapshot emitted to UI while executing.
 * 実行中に UI へ送るスナップショット。
 */
export interface WorkflowRunProgress {
  phase: WorkflowRunPhase;
  currentStepIndex: number;
  stepStatuses: WorkflowStepRunStatus[];
  /** Final assistant text per completed step. / 完了ステップごとの最終テキスト */
  stepOutputs: string[];
  /** Streaming buffer for the active step. / 実行中ステップのストリームバッファ */
  currentStepStreaming: string;
  /** Error message when a step fails. / ステップ失敗時のメッセージ */
  lastError?: string;
}
