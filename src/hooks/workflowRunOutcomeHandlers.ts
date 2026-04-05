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
  /** Step to resume (lookup in current valid steps). / 再開するステップ（現在の有効ステップで解決） */
  pausedStepId: string;
  /** Completed outputs keyed by step id. / 完了ステップの出力（id キー） */
  stepOutputsById: Record<string, string>;
  partialForStep: string;
};

/**
 * Applies execution outcome: toasts and state setters for pause / complete / error.
 * 実行結果を適用する（トーストと pause / 完了 / エラー用の setter）。
 *
 * Terminal outcomes keep `activeRunSteps` as `validSteps` so progress rows align with `stepStatuses`
 * when the draft still contains empty placeholder steps. / 終端時も activeRunSteps を validSteps に保ち、空ステップがあっても進捗行と stepStatuses を一致させる。
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
      setActiveRunSteps(validSteps);
      setProgress((p) => (p ? { ...p, phase: "completed" } : null));
      toast({ title: t("aiChat.workflow.completed") });
      return;
    case "paused":
      setActiveRunSteps(validSteps);
      setPausedState({
        pausedStepId: result.pausedStepId,
        stepOutputsById: result.stepOutputsById,
        partialForStep: result.partialForStep,
      });
      setProgress((p) => (p ? { ...p, phase: "paused" } : null));
      toast({ title: t("aiChat.workflow.paused") });
      return;
    case "stopped":
      setPausedState(null);
      setActiveRunSteps(validSteps);
      setProgress((p) => {
        if (!p) return null;
        const stepStatuses = p.stepStatuses.map((s) => (s === "running" ? "pending" : s));
        return {
          ...p,
          phase: "aborted",
          stepStatuses,
          currentStepStreaming: "",
        };
      });
      toast({ title: t("aiChat.workflow.stopped") });
      return;
    case "error":
      setPausedState(null);
      setActiveRunSteps(validSteps);
      setProgress((p) => {
        if (!p) return null;
        const stepStatuses = p.stepStatuses.map((s) => (s === "running" ? "error" : s));
        return {
          ...p,
          phase: "aborted",
          stepStatuses,
          currentStepStreaming: "",
          lastError: result.error,
        };
      });
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
