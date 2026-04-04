import { useCallback, useState } from "react";
import type { NodeViewProps } from "@tiptap/react";
import { toast } from "@zedi/ui/components/sonner";
import { loadGeneralSettings } from "@/lib/generalSettings";
import {
  interpretExecutableCodeOutput,
  runExecutableCodeInNotebook,
} from "@/lib/executableCode/executeExecutableCode";
import type { ExecutableRunStatus } from "../extensions/ExecutableCodeBlockExtension";

/**
 * Parameters for {@link useExecutableCodeBlockController}.
 * {@link useExecutableCodeBlockController} の引数。
 */
export interface UseExecutableCodeBlockControllerParams {
  updateAttributes: NodeViewProps["updateAttributes"];
  language: string;
  codeText: string;
  runStatus: ExecutableRunStatus;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  claudeAvailable: boolean | null;
}

/**
 * Run / confirm / interpret logic for {@link ExecutableCodeBlockNodeView}.
 * {@link ExecutableCodeBlockNodeView} の実行・確認・解説ロジック。
 */
export function useExecutableCodeBlockController({
  updateAttributes,
  language,
  codeText,
  runStatus,
  exitCode,
  stdout,
  stderr,
  claudeAvailable,
}: UseExecutableCodeBlockControllerParams) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [interpretLoading, setInterpretLoading] = useState(false);

  const runImpl = useCallback(async () => {
    updateAttributes({
      runStatus: "running" as ExecutableRunStatus,
      errorMessage: "",
      stdout: "",
      stderr: "",
      exitCode: null,
      durationMs: null,
    });
    const started = performance.now();
    const result = await runExecutableCodeInNotebook(language, codeText);
    const durationMsNext = Math.round(performance.now() - started);

    if (!result.ok) {
      updateAttributes({
        runStatus: "error" as ExecutableRunStatus,
        errorMessage: result.error,
        durationMs: durationMsNext,
      });
      return;
    }

    updateAttributes({
      runStatus: "done" as ExecutableRunStatus,
      stdout: result.result.stdout,
      stderr: result.result.stderr,
      exitCode: result.result.exitCode,
      durationMs: durationMsNext,
      errorMessage: "",
    });
  }, [codeText, language, updateAttributes]);

  const handleRunClick = useCallback(() => {
    if (claudeAvailable !== true || runStatus === "running") return;
    const { executableCodeConfirmBeforeRun } = loadGeneralSettings();
    if (executableCodeConfirmBeforeRun !== false) {
      setConfirmOpen(true);
      return;
    }
    void runImpl();
  }, [claudeAvailable, runStatus, runImpl]);

  const handleConfirmRun = useCallback(() => {
    setConfirmOpen(false);
    void runImpl();
  }, [runImpl]);

  const handleInterpret = useCallback(async () => {
    if (claudeAvailable !== true || interpretLoading || runStatus !== "done") return;
    if (exitCode === null) return;
    setInterpretLoading(true);
    updateAttributes({ interpretation: "" });
    try {
      const out = await interpretExecutableCodeOutput(stdout, stderr, exitCode);
      if (out.ok) {
        updateAttributes({ interpretation: out.text });
      } else {
        toast.error(out.error);
      }
    } finally {
      setInterpretLoading(false);
    }
  }, [claudeAvailable, exitCode, interpretLoading, runStatus, stderr, stdout, updateAttributes]);

  const runDisabled =
    claudeAvailable !== true || runStatus === "running" || codeText.trim().length === 0;
  const interpretDisabled =
    claudeAvailable !== true || interpretLoading || runStatus !== "done" || exitCode === null;

  return {
    confirmOpen,
    setConfirmOpen,
    interpretLoading,
    handleRunClick,
    handleConfirmRun,
    handleInterpret,
    runDisabled,
    interpretDisabled,
  };
}
