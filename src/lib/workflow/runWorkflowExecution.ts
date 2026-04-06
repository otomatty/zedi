/**
 * Orchestrates multi-step Claude Code workflow runs (Issue #462).
 * Claude Code のマルチステップワークフロー実行をオーケストレーションする（Issue #462）。
 */

import { streamClaudeQuery } from "@/lib/claudeCode/streamClaudeQuery";
import type { WorkflowDefinition, WorkflowRunProgress, WorkflowStepRunStatus } from "./types";
import { buildWorkflowStepPrompt, defaultWorkflowStepMaxTurns } from "./buildWorkflowStepPrompt";
import { formatWorkflowNoteMarkdown } from "./formatWorkflowNoteMarkdown";

/** Outcome when {@link runWorkflowExecution} finishes or yields control. */
export type WorkflowExecutionOutcome =
  | { outcome: "completed" }
  | { outcome: "stopped" }
  | {
      outcome: "paused";
      /** Step index where the run stopped (same step on resume). / 停止したステップ index（再開時も同じ） */
      pausedAtStepIndex: number;
      /** Step id at pause (stable across draft edits). / 一時停止時のステップ id（ドラフト編集後も追跡） */
      pausedStepId: string;
      /** Completed outputs keyed by step id. / 完了ステップの出力（id キー） */
      stepOutputsById: Record<string, string>;
      /** Snapshot of outputs for completed steps. / 完了ステップの出力スナップショット */
      stepOutputs: string[];
      /** Streaming buffer at pause time for the active step. / 停止時点のアクティブステップのストリーム */
      partialForStep: string;
    }
  | { outcome: "error"; error: string };

type RunWorkflowStepsLoopParams = {
  definition: WorkflowDefinition;
  cwd?: string;
  pageExcerpt?: string;
  workflowSignal: AbortSignal;
  createStepAbort: () => AbortController;
  startStepIndex: number;
  stepOutputs: string[];
  resumePartialForCurrentStep?: string;
  onProgress: (p: WorkflowRunProgress) => void;
  onNoteMarkdown: (fullMarkdown: string) => void;
  baseContentBeforeWorkflow: string;
};

/**
 * Runs or resumes a workflow: streams each step into the note via `onNoteMarkdown`.
 * ワークフローを実行または再開し、各ステップを `onNoteMarkdown` 経由でノートへストリームする。
 */
export async function runWorkflowExecution(options: {
  definition: WorkflowDefinition;
  cwd?: string;
  pageExcerpt?: string;
  /** Aborts the whole run (Stop). / 実行全体を中止（停止） */
  workflowSignal: AbortSignal;
  /** Fresh controller per step; UI aborts the current one on Pause. / ステップごとに新規。UI が一時停止で現在のみ abort */
  createStepAbort: () => AbortController;
  /** First step index to execute (0 on fresh run). / 最初に実行するステップ index（新規は 0） */
  startStepIndex: number;
  /** Completed outputs for steps before `startStepIndex`. / `startStepIndex` より前の完了出力 */
  stepOutputs: string[];
  /** When resuming the same step after pause, partial assistant text. / 一時停止後に同じステップを再開するときの部分テキスト */
  resumePartialForCurrentStep?: string;
  onProgress: (p: WorkflowRunProgress) => void;
  /** Full note body = base snapshot + formatted workflow block. / ベーススナップショット + 整形済みブロック */
  onNoteMarkdown: (fullMarkdown: string) => void;
  /** Editor content before the workflow block was inserted. / ワークフローブロック挿入前のエディタ内容 */
  baseContentBeforeWorkflow: string;
}): Promise<WorkflowExecutionOutcome> {
  const {
    definition,
    cwd,
    pageExcerpt,
    workflowSignal,
    createStepAbort,
    startStepIndex,
    stepOutputs: initialOutputs,
    resumePartialForCurrentStep,
    onProgress,
    onNoteMarkdown,
    baseContentBeforeWorkflow,
  } = options;

  const steps = definition.steps;
  if (steps.length === 0) {
    return { outcome: "error", error: "Workflow has no steps." };
  }

  const stepOutputs = normalizeStepOutputs(initialOutputs, steps.length);

  return runWorkflowStepsLoop({
    definition,
    cwd,
    pageExcerpt,
    workflowSignal,
    createStepAbort,
    startStepIndex,
    stepOutputs,
    resumePartialForCurrentStep,
    onProgress,
    onNoteMarkdown,
    baseContentBeforeWorkflow,
  });
}

/**
 * Pads or trims `stepOutputs` to match `stepsLength`.
 * `stepOutputs` を `stepsLength` に合わせて埋めたり切り詰めたりする。
 */
function normalizeStepOutputs(initialOutputs: string[], stepsLength: number): string[] {
  const stepOutputs = [...initialOutputs];
  while (stepOutputs.length < stepsLength) {
    stepOutputs.push("");
  }
  if (stepOutputs.length > stepsLength) {
    stepOutputs.length = stepsLength;
  }
  return stepOutputs;
}

/**
 * Main step loop: streams each step, updates note and progress.
 * メインのステップループ：各ステップをストリームし、ノートと進捗を更新する。
 */
async function runWorkflowStepsLoop(
  params: RunWorkflowStepsLoopParams,
): Promise<WorkflowExecutionOutcome> {
  const {
    definition,
    cwd,
    pageExcerpt,
    workflowSignal,
    createStepAbort,
    startStepIndex,
    stepOutputs,
    resumePartialForCurrentStep,
    onProgress,
    onNoteMarkdown,
    baseContentBeforeWorkflow,
  } = params;

  const steps = definition.steps;
  const stepTitles = steps.map((s) => s.title);

  const pushProgress = (
    phase: WorkflowRunProgress["phase"],
    currentStepIndex: number,
    statuses: WorkflowStepRunStatus[],
    streaming: string,
    lastError?: string,
  ): void => {
    onProgress({
      phase,
      currentStepIndex,
      stepStatuses: statuses,
      stepOutputs: [...stepOutputs],
      currentStepStreaming: streaming,
      lastError,
    });
  };

  const emitNote = (
    currentStepIndex: number,
    statuses: WorkflowStepRunStatus[],
    streamingStepIndex: number | null,
    streamingText: string,
  ): void => {
    const block = formatWorkflowNoteMarkdown({
      title: definition.name,
      stepTitles,
      stepStatuses: statuses,
      stepOutputs,
      streamingStepIndex,
      streamingText,
    });
    const base = baseContentBeforeWorkflow.trimEnd();
    const full = base.length > 0 ? `${base}\n\n${block}` : block;
    onNoteMarkdown(full);
  };

  for (let i = startStepIndex; i < steps.length; i += 1) {
    if (workflowSignal.aborted) {
      pushProgress("aborted", i, buildStatuses(steps.length, i, "pending"), "", undefined);
      return { outcome: "stopped" };
    }

    const step = steps[i];
    const statusesBefore = buildStatuses(steps.length, i, "running");
    const initialStreaming =
      resumePartialForCurrentStep && i === startStepIndex ? resumePartialForCurrentStep : "";
    pushProgress("running", i, statusesBefore, initialStreaming, undefined);
    emitNote(i, statusesBefore, i, initialStreaming);

    const prior = stepOutputs.slice(0, i);

    const prompt = buildWorkflowStepPrompt({
      workflowName: definition.name,
      step,
      stepIndex: i,
      totalSteps: steps.length,
      pageExcerpt,
      priorOutputs: prior,
      resumeFromPartial: i === startStepIndex ? resumePartialForCurrentStep : undefined,
    });

    const stepController = createStepAbort();
    const merged = AbortSignal.any([workflowSignal, stepController.signal]);

    let streaming = initialStreaming;

    const result = await streamClaudeQuery(
      prompt,
      {
        cwd,
        maxTurns: defaultWorkflowStepMaxTurns(step),
        allowedTools: step.allowedTools,
      },
      merged,
      {
        onChunk: (chunk) => {
          streaming += chunk;
          const statuses = buildStatuses(steps.length, i, "running");
          pushProgress("running", i, statuses, streaming, undefined);
          emitNote(i, statuses, i, streaming);
        },
      },
    );

    if (!result.ok) {
      if (result.error === "Aborted") {
        if (workflowSignal.aborted) {
          pushProgress("aborted", i, buildStatuses(steps.length, i, "error"), "", undefined);
          return { outcome: "stopped" };
        }
        pushProgress("paused", i, buildStatuses(steps.length, i, "running"), streaming, undefined);
        emitNote(i, buildStatuses(steps.length, i, "running"), i, streaming);
        const stepOutputsById: Record<string, string> = {};
        for (let k = 0; k < i; k += 1) {
          stepOutputsById[steps[k].id] = stepOutputs[k];
        }
        return {
          outcome: "paused",
          pausedAtStepIndex: i,
          pausedStepId: steps[i].id,
          stepOutputsById,
          stepOutputs: [...stepOutputs],
          partialForStep: streaming,
        };
      }
      stepOutputs[i] = "";
      const errStatuses = buildStatuses(steps.length, i, "error");
      pushProgress("running", i, errStatuses, streaming, result.error);
      emitNote(i, errStatuses, null, "");
      return { outcome: "error", error: result.error };
    }

    stepOutputs[i] = result.content;
    const doneStatuses = buildStatuses(steps.length, i, "done");
    pushProgress("running", i, doneStatuses, "", undefined);
    emitNote(i, doneStatuses, null, "");
  }

  pushProgress(
    "completed",
    steps.length - 1,
    steps.map(() => "done"),
    "",
    undefined,
  );
  emitNote(
    steps.length - 1,
    steps.map(() => "done"),
    null,
    "",
  );

  return { outcome: "completed" };
}

function buildStatuses(
  total: number,
  runningIndex: number,
  runningKind: WorkflowStepRunStatus,
): WorkflowStepRunStatus[] {
  const out: WorkflowStepRunStatus[] = [];
  for (let j = 0; j < total; j += 1) {
    if (j < runningIndex) out.push("done");
    else if (j === runningIndex) out.push(runningKind);
    else out.push("pending");
  }
  return out;
}
