/**
 * Prompt builders for Claude Code executable notebook cells.
 * Claude Code 実行可能ノートブックセル用のプロンプトビルダー。
 *
 * Builds prompts for Bash execution and for plain-text interpretation (no tools).
 * Bash 実行用とプレーンテキスト解説用（ツールなし）のプロンプトを組み立てる。
 */

/**
 * Builds the run prompt for the Bash tool.
 * Bash ツール向けの実行プロンプトを返す。
 *
 * @param language - Editor language id (e.g. bash, python, javascript).
 * @param code - Raw source to execute.
 */
export function buildExecutableCodeRunPrompt(language: string, code: string): string {
  const lang = (language || "bash").trim() || "bash";
  const body = code.trimEnd();

  return `You are Zedi's notebook runner. Execute the user's code using the Bash tool and capture stdout and stderr.

Rules:
- Use the Bash tool to run the code. Prefer a single Bash invocation when possible.
- Language hint: "${lang}".
  - For bash, shell, or sh: run as a shell script (e.g. bash with a heredoc or temp file if needed).
  - For python: use python3.
  - For javascript or js: use node.
  - For typescript or ts: use npx tsx, bun, or ts-node if available; otherwise report the error in stderr.
  - For other languages: choose a reasonable command-line runner or explain failure in stderr.
- Do not ask the user questions; perform the run.
- Do not include markdown code fences in your final answer.

After execution, reply with ONLY the following plain-text sections in this exact order (no extra prose before or after):
---ZEDI_STDOUT---
<paste stdout here, may be empty>
---ZEDI_STDERR---
<paste stderr here, may be empty>
---ZEDI_EXIT---
<single integer exit code>

User code:
${body}`;
}

/**
 * Builds a prompt that asks Claude to explain prior command output (no Bash).
 * 直前のコマンド出力を解説させるプロンプト（Bash は使わない）。
 */
export function buildExecutableCodeInterpretPrompt(
  stdout: string,
  stderr: string,
  exitCode: number,
): string {
  return `You are helping inside Zedi notes. Briefly explain what the following command output means for the user.
Respond in the same language as the UI would expect: concise Japanese with key English technical terms where natural.

stdout:
${stdout || "(empty)"}

stderr:
${stderr || "(empty)"}

exit code: ${exitCode}`;
}
