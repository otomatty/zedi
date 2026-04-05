/**
 * Builds the user prompt for one workflow step (Issue #462).
 * ワークフロー 1 ステップ分のユーザープロンプトを組み立てる（Issue #462）。
 */

import type { WorkflowStepDefinition } from "./types";

const DEFAULT_MAX_TURNS = 15;

/**
 * Returns default max turns when a step omits `maxTurns`.
 * ステップが `maxTurns` を省略したときの既定値。
 */
export function defaultWorkflowStepMaxTurns(step: WorkflowStepDefinition): number {
  return step.maxTurns ?? DEFAULT_MAX_TURNS;
}

/**
 * Builds Claude Code prompt text for `stepIndex` including prior step outputs.
 * 先行ステップの出力を含めた Claude Code 用プロンプトを組み立てる。
 */
export function buildWorkflowStepPrompt(options: {
  workflowName: string;
  step: WorkflowStepDefinition;
  stepIndex: number;
  totalSteps: number;
  /** Plain-text excerpt of the open page (optional). / 開いているページの抜粋（任意） */
  pageExcerpt?: string;
  /** Completed assistant outputs from earlier steps. / 先行ステップの完了出力 */
  priorOutputs: string[];
  /** When resuming after pause, partial text from the interrupted attempt. / 一時停止後の再開時、中断前の部分テキスト */
  resumeFromPartial?: string;
}): string {
  const {
    workflowName,
    step,
    stepIndex,
    totalSteps,
    pageExcerpt,
    priorOutputs,
    resumeFromPartial,
  } = options;

  const parts: string[] = [
    `You are executing step ${stepIndex + 1} of ${totalSteps} in a workflow named "${workflowName}".`,
    "",
    `## Step title`,
    step.title,
    "",
    `## Instructions`,
    step.instruction.trim() || "(no additional instructions)",
    "",
  ];

  if (pageExcerpt?.trim()) {
    parts.push(`## Context from the open note (excerpt)`, pageExcerpt.trim(), "");
  }

  if (priorOutputs.length > 0) {
    parts.push(`## Outputs from previous steps`);
    for (let i = 0; i < priorOutputs.length; i += 1) {
      parts.push(`### Step ${i + 1}`, priorOutputs[i].trim() || "(empty)", "");
    }
  }

  if (resumeFromPartial?.trim()) {
    parts.push(
      `## Resume`,
      "The previous attempt was interrupted. Continue and improve from this partial output:",
      resumeFromPartial.trim(),
      "",
    );
  }

  parts.push(
    `Respond with the result for this step only. Use clear Markdown. Be concise unless the instructions ask for detail.`,
  );

  return parts.join("\n");
}
