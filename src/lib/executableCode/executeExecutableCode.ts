/**
 * Runs executable-notebook code via Claude Code (Bash tool) and parses the result.
 * Claude Code（Bash ツール）経由でノートブック用コードを実行し、結果をパースする。
 */

import { runClaudeQueryToCompletion } from "@/lib/claudeCode/runQueryToCompletion";
import {
  buildExecutableCodeInterpretPrompt,
  buildExecutableCodeRunPrompt,
} from "./buildExecutionPrompt";
import { parseExecutionModelOutput, type ParsedZediExecution } from "./parseExecutionResult";

/**
 * Successful run with parsed stdout/stderr/exit.
 * 成功時のパース済み stdout / stderr / 終了コード。
 */
export interface ExecutableCodeRunOutcome {
  ok: true;
  result: ParsedZediExecution;
  rawContent: string;
}

/**
 * Failed run (sidecar error, parse failure, etc.).
 * 失敗時（sidecar エラー、パース失敗など）。
 */
export interface ExecutableCodeRunFailure {
  ok: false;
  error: string;
  rawContent?: string;
}

/**
 * Union of success or failure for notebook execution.
 * ノートブック実行の成功／失敗のユニオン。
 */
export type ExecutableCodeRunResult = ExecutableCodeRunOutcome | ExecutableCodeRunFailure;

/**
 * Executes user code in the notebook cell flow (desktop + Claude Code only).
 * ノートブックセル用フローでユーザーコードを実行する（デスクトップ + Claude Code のみ）。
 */
export async function runExecutableCodeInNotebook(
  language: string,
  code: string,
  signal?: AbortSignal,
): Promise<ExecutableCodeRunResult> {
  const prompt = buildExecutableCodeRunPrompt(language, code);
  const completion = await runClaudeQueryToCompletion(
    prompt,
    {
      maxTurns: 12,
      allowedTools: ["Bash"],
    },
    signal,
  );

  if (!completion.ok) {
    return { ok: false, error: completion.error };
  }

  const rawContent = completion.content.trim();
  const result = parseExecutionModelOutput(rawContent);
  return { ok: true, result, rawContent };
}

/**
 * Requests a short interpretation of stdout/stderr (no Bash tools).
 * stdout/stderr の短い解説を依頼する（Bash ツールは使わない）。
 */
export async function interpretExecutableCodeOutput(
  stdout: string,
  stderr: string,
  exitCode: number,
  signal?: AbortSignal,
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const prompt = buildExecutableCodeInterpretPrompt(stdout, stderr, exitCode);
  const completion = await runClaudeQueryToCompletion(
    prompt,
    {
      maxTurns: 6,
      allowedTools: [],
    },
    signal,
  );

  if (!completion.ok) {
    return { ok: false, error: completion.error };
  }
  return { ok: true, text: completion.content.trim() };
}
