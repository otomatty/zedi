import React from "react";
import { useTranslation } from "react-i18next";
import { statusLabelForExecutableRun } from "./executableCodeBlockI18n";
import type { ExecutableRunStatus } from "../extensions/ExecutableCodeBlockExtension";

/**
 * Props for {@link ExecutableCodeBlockOutputPanel}.
 * {@link ExecutableCodeBlockOutputPanel} のプロパティ。
 */
export interface ExecutableCodeBlockOutputPanelProps {
  runStatus: ExecutableRunStatus;
  exitCode: number | null;
  durationMs: number | null;
  claudeAvailable: boolean | null;
  errorMessage: string;
  stdout: string;
  stderr: string;
  interpretation: string;
}

/**
 * Status line, stderr/stdout, and optional Claude interpretation.
 * ステータス行、標準入出力、任意の Claude 解説。
 */
export function ExecutableCodeBlockOutputPanel({
  runStatus,
  exitCode,
  durationMs,
  claudeAvailable,
  errorMessage,
  stdout,
  stderr,
  interpretation,
}: ExecutableCodeBlockOutputPanelProps) {
  const { t } = useTranslation();

  return (
    <div className="border-border space-y-2 border-t px-3 py-2 text-xs">
      <div className="text-muted-foreground flex flex-wrap items-center gap-2">
        <span>
          {runStatus === "done" && exitCode !== null
            ? "✅ "
            : runStatus === "error"
              ? "❌ "
              : "⏳ "}
          {statusLabelForExecutableRun(t, runStatus)}
          {durationMs !== null && runStatus !== "idle" && runStatus !== "running" && (
            <span className="ml-1">
              ({t("editor.executableCode.duration", { seconds: (durationMs / 1000).toFixed(1) })})
            </span>
          )}
        </span>
        {claudeAvailable === false && (
          <span className="text-destructive">{t("editor.executableCode.claudeUnavailable")}</span>
        )}
      </div>

      {errorMessage ? (
        <pre className="bg-destructive/10 text-destructive overflow-x-auto rounded p-2 whitespace-pre-wrap">
          {errorMessage}
        </pre>
      ) : null}

      {(stdout || stderr || runStatus === "done") && (
        <div className="space-y-1">
          {stdout ? (
            <div>
              <div className="text-muted-foreground font-medium">
                {t("editor.executableCode.stdout")}
              </div>
              <pre className="bg-background overflow-x-auto rounded border p-2 whitespace-pre-wrap">
                {stdout}
              </pre>
            </div>
          ) : null}
          {stderr ? (
            <div>
              <div className="text-muted-foreground font-medium">
                {t("editor.executableCode.stderr")}
              </div>
              <pre className="bg-background overflow-x-auto rounded border p-2 whitespace-pre-wrap text-amber-800 dark:text-amber-200">
                {stderr}
              </pre>
            </div>
          ) : null}
        </div>
      )}

      {interpretation ? (
        <div className="border-border border-t pt-2">
          <div className="text-muted-foreground mb-1 font-medium">
            {t("editor.executableCode.interpretationHeading")}
          </div>
          <div className="bg-background rounded border p-2 whitespace-pre-wrap">
            {interpretation}
          </div>
        </div>
      ) : null}
    </div>
  );
}
