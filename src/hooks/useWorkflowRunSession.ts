/**
 * Claude Code multi-step workflow execution for the workflow panel (Issue #462).
 * ワークフローパネル向け Claude Code マルチステップ実行（Issue #462）。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "@zedi/ui";
import { useAIChatContext } from "@/contexts/AIChatContext";
import { isTauriDesktop } from "@/lib/platform";
import { runWorkflowExecution } from "@/lib/workflow/runWorkflowExecution";
import type {
  WorkflowDefinition,
  WorkflowRunProgress,
  WorkflowStepDefinition,
} from "@/lib/workflow/types";
import { applyWorkflowRunOutcome } from "./workflowRunOutcomeHandlers";

/** Snapshot while paused (step id + outputs by id). / 一時停止中のスナップショット */
type PausedSnapshot = {
  pausedStepId: string;
  stepOutputsById: Record<string, string>;
  partialForStep: string;
};

/**
 * Maps paused snapshot onto current valid steps; returns null if the paused step id is missing.
 * 現在の有効ステップへ一時停止状態を写す。paused ステップが無ければ null。
 */
function resolveResumeFromPaused(
  paused: PausedSnapshot,
  validSteps: WorkflowStepDefinition[],
): { startIndex: number; initialOutputs: string[]; resumePartial: string } | null {
  const j = validSteps.findIndex((s) => s.id === paused.pausedStepId);
  if (j === -1) return null;
  return {
    startIndex: j,
    initialOutputs: validSteps.map((s, k) => (k < j ? (paused.stepOutputsById[s.id] ?? "") : "")),
    resumePartial: paused.partialForStep,
  };
}

/**
 * Runs, pauses, and resumes workflows against the current note context.
 * 現在のノート文脈に対してワークフローを実行・一時停止・再開する。
 */
export function useWorkflowRunSession(draft: WorkflowDefinition) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { pageContext, contentAppendHandlerRef } = useAIChatContext();

  const [progress, setProgress] = useState<WorkflowRunProgress | null>(null);
  const [activeRunSteps, setActiveRunSteps] = useState<WorkflowStepDefinition[] | null>(null);
  const [pausedState, setPausedState] = useState<PausedSnapshot | null>(null);

  const workflowAbortRef = useRef<AbortController | null>(null);
  const currentStepAbortRef = useRef<AbortController | null>(null);
  const baseSnapshotRef = useRef<string>("");

  const isEditor = pageContext?.type === "editor";
  const cwd = pageContext?.claudeWorkspaceRoot;
  const pageExcerpt =
    pageContext?.pageFullContent?.slice(0, 12_000) ??
    pageContext?.pageContent?.slice(0, 12_000) ??
    "";

  useEffect(() => {
    return () => {
      workflowAbortRef.current?.abort();
      currentStepAbortRef.current?.abort();
    };
  }, []);

  const applyNoteContent = useCallback(
    (fullMarkdown: string) => {
      const fn = contentAppendHandlerRef.current;
      if (fn) fn(fullMarkdown);
    },
    [contentAppendHandlerRef],
  );

  const runExecution = useCallback(
    async (mode: "fresh" | "resume") => {
      if (!isTauriDesktop()) {
        toast({ title: t("aiChat.workflow.desktopOnly"), variant: "destructive" });
        return;
      }
      if (!isEditor) {
        toast({ title: t("aiChat.workflow.editorRequired"), variant: "destructive" });
        return;
      }
      if (mode === "resume" && !pausedState) {
        toast({ title: t("aiChat.workflow.nothingToResume"), variant: "destructive" });
        return;
      }
      if (!draft.name.trim()) {
        toast({ title: t("aiChat.workflow.nameRequired"), variant: "destructive" });
        return;
      }
      const validSteps = draft.steps.filter((s) => s.title.trim() && s.instruction.trim());
      if (validSteps.length === 0) {
        toast({ title: t("aiChat.workflow.stepsRequired"), variant: "destructive" });
        return;
      }

      const def: WorkflowDefinition = {
        ...draft,
        steps: validSteps,
        updatedAt: Date.now(),
      };

      workflowAbortRef.current = new AbortController();
      if (mode === "fresh") {
        baseSnapshotRef.current = pageContext?.pageFullContent ?? "";
      }

      let startIndex = 0;
      let initialOutputs: string[] = [];
      let resumePartial: string | undefined;
      if (mode === "resume" && pausedState) {
        const resolved = resolveResumeFromPaused(pausedState, validSteps);
        if (!resolved) {
          toast({ title: t("aiChat.workflow.pausedStepNotFound"), variant: "destructive" });
          setPausedState(null);
          return;
        }
        ({ startIndex, initialOutputs, resumePartial } = resolved);
      }

      if (mode === "fresh") {
        setPausedState(null);
      }

      setActiveRunSteps(validSteps);

      setProgress({
        phase: "running",
        currentStepIndex: startIndex,
        stepStatuses: validSteps.map((_, i) =>
          i < startIndex ? "done" : i === startIndex ? "running" : "pending",
        ),
        stepOutputs: initialOutputs.length
          ? initialOutputs
          : Array.from({ length: validSteps.length }, () => ""),
        currentStepStreaming: resumePartial ?? "",
      });

      const result = await runWorkflowExecution({
        definition: def,
        cwd,
        pageExcerpt,
        workflowSignal: workflowAbortRef.current.signal,
        createStepAbort: () => {
          const c = new AbortController();
          currentStepAbortRef.current = c;
          return c;
        },
        startStepIndex: startIndex,
        stepOutputs: initialOutputs.length
          ? initialOutputs
          : Array.from({ length: validSteps.length }, () => ""),
        resumePartialForCurrentStep: resumePartial,
        onProgress: setProgress,
        onNoteMarkdown: applyNoteContent,
        baseContentBeforeWorkflow: baseSnapshotRef.current,
      });

      applyWorkflowRunOutcome(result, validSteps, {
        t,
        toast,
        setPausedState,
        setActiveRunSteps,
        setProgress,
      });
    },
    [
      applyNoteContent,
      cwd,
      draft,
      isEditor,
      pageContext?.pageFullContent,
      pageExcerpt,
      pausedState,
      t,
      toast,
    ],
  );

  const handlePause = useCallback(() => {
    currentStepAbortRef.current?.abort();
  }, []);

  const handleStop = useCallback(() => {
    workflowAbortRef.current?.abort();
    currentStepAbortRef.current?.abort();
  }, []);

  const running = progress?.phase === "running";

  return {
    progress,
    activeRunSteps,
    pausedState,
    isEditor,
    running,
    runExecution,
    handlePause,
    handleStop,
  };
}
