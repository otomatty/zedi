/**
 * Per-command prompt strings for agent slash (extracted to keep complexity low).
 * エージェントスラッシュ用のコマンド別プロンプト（複雑度低減のため分離）。
 */

import type { Editor } from "@tiptap/core";
import type { AgentSlashPromptCaptures } from "./types";
import { getEditorPlainText, getEditorSelectionText } from "./agentSlashEditorText";

/** Builds the `/analyze` prompt. / `/analyze` 用プロンプト */
export function buildAnalyzePrompt(trimmedArgs: string): string {
  return [
    "You are assisting inside the Zedi note app. Analyze the code at the given path in the workspace.",
    "Read the file(s), summarize structure, risks, and improvements. Output in Markdown (Japanese preferred for prose, English for identifiers).",
    trimmedArgs
      ? `Target path (relative to workspace): ${trimmedArgs}`
      : "No path was given: infer the most relevant file from the workspace or ask briefly in the output.",
  ].join("\n");
}

/** Builds the `/git-summary` prompt. / `/git-summary` 用プロンプト */
export function buildGitSummaryPrompt(): string {
  return [
    "Run `git log -n 20 --oneline` and optionally `git status -sb` in the workspace via Bash.",
    "Summarize recent commits and current working tree in Markdown bullet points (Japanese).",
  ].join("\n");
}

/** Builds the `/run` prompt. / `/run` 用プロンプト */
export function buildRunPrompt(trimmedArgs: string): string {
  return [
    "You can use Bash to run a shell command in the workspace.",
    "Run the following command, capture stdout/stderr and exit code, then return a fenced code block with the raw output and a short Japanese summary above it.",
    trimmedArgs
      ? `Command: ${trimmedArgs}`
      : "No command was given: reply with a short note asking the user to pass a command after /run.",
  ].join("\n");
}

/** Builds the `/research` prompt. / `/research` 用プロンプト */
export function buildResearchPrompt(trimmedArgs: string): string {
  return [
    "Use WebSearch (and Read if needed) to research the topic below.",
    "Produce a structured Markdown summary: overview, key facts, sources/links, and caveats. Japanese preferred.",
    trimmedArgs
      ? `Topic: ${trimmedArgs}`
      : "No topic was given: ask the user to specify a topic after /research.",
  ].join("\n");
}

/** Builds the `/review` prompt. / `/review` 用プロンプト */
export function buildReviewPrompt(trimmedArgs: string): string {
  return [
    "Perform a code review for the path below. Read files with Read tool as needed.",
    "Output Markdown with: summary, checklist of issues (severity + file:line if known), and positive notes.",
    trimmedArgs
      ? `Target path: ${trimmedArgs}`
      : "No path was given: pick a reasonable default in the repo or state that the path is missing.",
  ].join("\n");
}

/** Builds the `/test` prompt. / `/test` 用プロンプト */
export function buildTestPrompt(trimmedArgs: string): string {
  return [
    "Run tests for this repository using Bash (prefer `bun run test:run` or `bun vitest run` with the given path when applicable).",
    "Return Markdown: command(s) run, exit code, condensed output in fenced code blocks, and a brief Japanese interpretation.",
    trimmedArgs
      ? `Focus path or pattern: ${trimmedArgs}`
      : "No path: run the project's default test script from package.json if present.",
  ].join("\n");
}

/** Builds the `/explain` prompt. / `/explain` 用プロンプト */
export function buildExplainPrompt(editor: Editor, captures?: AgentSlashPromptCaptures): string {
  const sel = captures?.selectionText ?? getEditorSelectionText(editor);
  return [
    "Explain the following code or text clearly for a developer. Use Markdown.",
    sel
      ? "Selection:\n```\n" + sel + "\n```"
      : "No selection: explain that the user should select text in the editor first, in Japanese.",
  ].join("\n\n");
}

/** Builds the `/summarize` prompt. / `/summarize` 用プロンプト */
export function buildSummarizePrompt(editor: Editor, captures?: AgentSlashPromptCaptures): string {
  const body = captures?.plainText ?? getEditorPlainText(editor);
  const excerpt = body.length > 12000 ? `${body.slice(0, 12000)}\n\n…(truncated)` : body;
  return [
    "Summarize the following note content in Markdown (Japanese). Use headings and bullets.",
    excerpt ? `Note text:\n${excerpt}` : "The note appears empty.",
  ].join("\n\n");
}
