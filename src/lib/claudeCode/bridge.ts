/**
 * Tauri invoke/listen wrappers for the Claude Code sidecar (Issue #456).
 * Claude Code sidecar 向け `invoke` / `listen` ラッパー（Issue #456）。
 *
 * Requires the Zedi desktop shell (`__TAURI_INTERNALS__`).
 * Zedi デスクトップ（`__TAURI_INTERNALS__`）が必要。
 */

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  CLAUDE_ERROR_EVENT,
  CLAUDE_STREAM_CHUNK_EVENT,
  CLAUDE_STREAM_COMPLETE_EVENT,
  CLAUDE_TOOL_USE_START_EVENT,
  CLAUDE_TOOL_USE_COMPLETE_EVENT,
  type ClaudeErrorPayload,
  type ClaudeInstallationResult,
  type ClaudeStreamChunkPayload,
  type ClaudeStreamCompletePayload,
  type ClaudeStatusResult,
  type ClaudeToolUseStartPayload,
  type ClaudeToolUseCompletePayload,
} from "./types";

/** Throws if not running inside a Tauri WebView. / Tauri WebView 外なら例外 */
function assertTauriWebview(): void {
  if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) {
    throw new Error(
      "Claude Code sidecar is only available in the Zedi desktop app. / Claude Code sidecar は Zedi デスクトップアプリでのみ利用できます。",
    );
  }
}

/** Optional arguments for {@link claudeQuery}. / {@link claudeQuery} の任意引数 */
export interface ClaudeQueryOptions {
  cwd?: string;
  maxTurns?: number;
  allowedTools?: string[];
  /** SDK session resume id. / SDK のセッション再開 ID */
  resume?: string;
}

/**
 * Sends a prompt; returns the request id to correlate stream events.
 * プロンプトを送り、ストリームイベントと突き合わせるリクエスト ID を返す。
 */
export async function claudeQuery(prompt: string, options?: ClaudeQueryOptions): Promise<string> {
  assertTauriWebview();
  return invoke<string>("claude_query", {
    prompt,
    cwd: options?.cwd ?? null,
    maxTurns: options?.maxTurns ?? null,
    allowedTools: options?.allowedTools ?? null,
    resume: options?.resume ?? null,
  });
}

/**
 * Aborts a running query by the id returned from {@link claudeQuery}.
 * {@link claudeQuery} で返った ID で実行中クエリを中断する。
 */
export async function claudeAbort(requestId: string): Promise<void> {
  assertTauriWebview();
  await invoke("claude_abort", { requestId });
}

/**
 * Sidecar idle/processing snapshot (RPC via sidecar).
 * sidecar 経由の RPC でアイドル／処理中のスナップショットを取得する。
 */
export async function claudeStatus(): Promise<ClaudeStatusResult> {
  assertTauriWebview();
  return invoke<ClaudeStatusResult>("claude_status");
}

/**
 * Whether `claude` CLI is on PATH (`claude --version`).
 * `claude` CLI が PATH にあるか（`claude --version`）。
 */
export async function checkClaudeInstallation(): Promise<ClaudeInstallationResult> {
  assertTauriWebview();
  return invoke<ClaudeInstallationResult>("check_claude_installation");
}

/**
 * Subscribe to streaming chunks for all queries; filter by `payload.id` if needed.
 * 全クエリのストリームチャンクを購読する。必要なら `payload.id` でフィルタする。
 */
export function onClaudeStreamChunk(
  callback: (payload: ClaudeStreamChunkPayload) => void,
): Promise<UnlistenFn> {
  assertTauriWebview();
  return listen<ClaudeStreamChunkPayload>(CLAUDE_STREAM_CHUNK_EVENT, (event) => {
    callback(event.payload);
  });
}

/**
 * Subscribe to query completion events.
 * クエリ完了イベントを購読する。
 */
export function onClaudeStreamComplete(
  callback: (payload: ClaudeStreamCompletePayload) => void,
): Promise<UnlistenFn> {
  assertTauriWebview();
  return listen<ClaudeStreamCompletePayload>(CLAUDE_STREAM_COMPLETE_EVENT, (event) => {
    callback(event.payload);
  });
}

/**
 * Subscribe to sidecar / SDK errors.
 * sidecar / SDK エラーを購読する。
 */
export function onClaudeError(
  callback: (payload: ClaudeErrorPayload) => void,
): Promise<UnlistenFn> {
  assertTauriWebview();
  return listen<ClaudeErrorPayload>(CLAUDE_ERROR_EVENT, (event) => {
    callback(event.payload);
  });
}

/**
 * Subscribe to tool use start events (when the agent begins using a tool).
 * ツール使用開始イベントを購読する。
 */
export function onClaudeToolUseStart(
  callback: (payload: ClaudeToolUseStartPayload) => void,
): Promise<UnlistenFn> {
  assertTauriWebview();
  return listen<ClaudeToolUseStartPayload>(CLAUDE_TOOL_USE_START_EVENT, (event) => {
    callback(event.payload);
  });
}

/**
 * Subscribe to tool use complete events (when the agent finishes using a tool).
 * ツール使用完了イベントを購読する。
 */
export function onClaudeToolUseComplete(
  callback: (payload: ClaudeToolUseCompletePayload) => void,
): Promise<UnlistenFn> {
  assertTauriWebview();
  return listen<ClaudeToolUseCompletePayload>(CLAUDE_TOOL_USE_COMPLETE_EVENT, (event) => {
    callback(event.payload);
  });
}
