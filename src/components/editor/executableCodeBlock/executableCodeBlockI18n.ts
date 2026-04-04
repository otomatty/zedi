import type { ExecutableRunStatus } from "../extensions/ExecutableCodeBlockExtension";

/**
 * Runnable language values for the executable cell selector (runner hints).
 * 実行セル選択用の言語値（ランナーへのヒント）。
 */
export const RUNNABLE_LANGUAGES: { value: string; labelKey: string }[] = [
  { value: "bash", labelKey: "bash" },
  { value: "shell", labelKey: "shell" },
  { value: "python", labelKey: "python" },
  { value: "javascript", labelKey: "javascript" },
  { value: "typescript", labelKey: "typescript" },
];

/**
 * Localized label for the run status indicator.
 * 実行状態インジケータ用のローカライズ済みラベル。
 */
export function statusLabelForExecutableRun(
  t: (k: string, o?: Record<string, string | number>) => string,
  status: ExecutableRunStatus,
): string {
  switch (status) {
    case "idle":
      return t("editor.executableCode.status.idle");
    case "running":
      return t("editor.executableCode.status.running");
    case "done":
      return t("editor.executableCode.status.done");
    case "error":
      return t("editor.executableCode.status.error");
    default:
      return typeof status === "string" ? status : "";
  }
}
