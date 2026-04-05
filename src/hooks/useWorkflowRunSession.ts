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
  const [pausedState, setPausedState] = useState<{
    pausedAtStepIndex: number;
    stepOutputs: string[];
    partialForStep: string;
  } | null>(null);

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
      baseSnapshotRef.current = pageContext?.pageFullContent ?? "";

      const startIndex = mode === "resume" && pausedState ? pausedState.pausedAtStepIndex : 0;
      const initialOutputs = mode === "resume" && pausedState ? [...pausedState.stepOutputs] : [];
      const resumePartial =
        mode === "resume" && pausedState ? pausedState.partialForStep : undefined;

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
