/**
 * Maps {@link WorkflowExecutionOutcome} to UI state updates (Issue #462).
 * {@link WorkflowExecutionOutcome} を UI 状態更新へ写す（Issue #462）。
 */

import type { Dispatch, SetStateAction } from "react";
import type { TFunction } from "i18next";
import type { WorkflowExecutionOutcome } from "@/lib/workflow/runWorkflowExecution";
import type { WorkflowRunProgress, WorkflowStepDefinition } from "@/lib/workflow/types";

type ToastArg = { title: string; variant?: "destructive" };
type ToastFn = (props: ToastArg) => void;

type PausedState = {
  pausedAtStepIndex: number;
  stepOutputs: string[];
  partialForStep: string;
};

/**
 * Applies execution outcome: toasts and state setters for pause / complete / error.
 * 実行結果を適用する（トーストと pause / 完了 / エラー用の setter）。
 */
export function applyWorkflowRunOutcome(
  result: WorkflowExecutionOutcome,
  validSteps: WorkflowStepDefinition[],
  ctx: {
    t: TFunction;
    toast: ToastFn;
    setPausedState: Dispatch<SetStateAction<PausedState | null>>;
    setActiveRunSteps: Dispatch<SetStateAction<WorkflowStepDefinition[] | null>>;
    setProgress: Dispatch<SetStateAction<WorkflowRunProgress | null>>;
  },
): void {
  const { t, toast, setPausedState, setActiveRunSteps, setProgress } = ctx;

  switch (result.outcome) {
    case "completed":
      setPausedState(null);
      setActiveRunSteps(null);
      setProgress((p) => (p ? { ...p, phase: "completed" } : null));
      toast({ title: t("aiChat.workflow.completed") });
      return;
    case "paused":
      setActiveRunSteps(validSteps);
      setPausedState({
        pausedAtStepIndex: result.pausedAtStepIndex,
        stepOutputs: result.stepOutputs,
        partialForStep: result.partialForStep,
      });
      setProgress((p) => (p ? { ...p, phase: "paused" } : null));
      toast({ title: t("aiChat.workflow.paused") });
      return;
    case "stopped":
      setActiveRunSteps(null);
      setProgress((p) => (p ? { ...p, phase: "aborted" } : null));
      toast({ title: t("aiChat.workflow.stopped") });
      return;
    case "error":
      setActiveRunSteps(null);
      toast({
        title: t("aiChat.workflow.error", { message: result.error }),
        variant: "destructive",
      });
      return;
    default: {
      const _exhaustive: never = result;
      throw new Error(`Unhandled outcome: ${JSON.stringify(_exhaustive)}`);
    }
  }
}
