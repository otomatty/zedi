/**
 * Builds Markdown for embedding workflow progress into a note (Issue #462).
 * ノートへ進捗を埋め込む Markdown を組み立てる（Issue #462）。
 */

import type { WorkflowStepRunStatus } from "./types";

const STATUS_PREFIX: Record<WorkflowStepRunStatus, string> = {
  pending: "⬜",
  running: "🔄",
  done: "☑",
  error: "⚠️",
};

/**
 * Formats a workflow block with step headings, optional streaming text, and outputs.
 * ステップ見出し・ストリーミングテキスト・出力付きのワークフローブロックを整形する。
 */
export function formatWorkflowNoteMarkdown(options: {
  /** Workflow title. / ワークフロー名 */
  title: string;
  /** Step titles in order. / ステップタイトル（順序どおり） */
  stepTitles: string[];
  /** Status per step. / ステップごとの状態 */
  stepStatuses: WorkflowStepRunStatus[];
  /** Final text for steps that finished successfully. / 成功完了したステップの最終テキスト */
  stepOutputs: string[];
  /** Index of the step currently streaming, or null. / ストリーム中のステップ index、なければ null */
  streamingStepIndex: number | null;
  /** Partial text for the streaming step. / ストリーム中ステップの部分テキスト */
  streamingText: string;
}): string {
  const { title, stepTitles, stepStatuses, stepOutputs, streamingStepIndex, streamingText } =
    options;

  const lines: string[] = [`## 📋 Workflow: ${title}`, ""];

  for (let i = 0; i < stepTitles.length; i += 1) {
    const status = stepStatuses[i] ?? "pending";
    const prefix = STATUS_PREFIX[status];
    lines.push(`### ${prefix} ${i + 1}. ${stepTitles[i]}`);
    lines.push("");

    if (status === "done") {
      lines.push((stepOutputs[i] ?? "").trim() || "(empty)");
      lines.push("");
    } else if (status === "running" && streamingStepIndex === i && streamingText.trim()) {
      lines.push(streamingText.trim());
      lines.push("");
    } else if (status === "error") {
      lines.push("(step failed)");
      lines.push("");
    }
  }

  return lines.join("\n").trimEnd();
}
