/**
 * Streams a Claude Code sidecar query with incremental text callbacks.
 * Claude Code sidecar のクエリをテキストチャンク単位でコールバックする。
 *
 * @see {@link runClaudeQueryToCompletion} — thin wrapper with no chunk handler.
 */

import { isTauriDesktop } from "@/lib/platform";
import {
  claudeAbort,
  claudeQuery,
  onClaudeError,
  onClaudeStreamChunk,
  onClaudeStreamComplete,
  onClaudeToolUseComplete,
  onClaudeToolUseStart,
} from "./bridge";
import type { ClaudeQueryOptions } from "./bridge";
/** Outcome of {@link streamClaudeQuery} / {@link runClaudeQueryToCompletion}. */
export type ClaudeQueryCompletionResult =
  | { ok: true; content: string }
  | { ok: false; error: string };

type PreRequestEvent =
  | { type: "chunk"; id: string; content: string }
  | { type: "complete"; id: string; result?: { content: string } }
  | { type: "error"; id: string; error: string }
  | { type: "toolStart"; id: string; toolName: string }
  | { type: "toolComplete"; id: string; toolName: string };

/**
 * Optional callbacks while streaming Claude Code output.
 * ストリーミング中の任意コールバック。
 */
export interface StreamClaudeQueryCallbacks {
  /** Each text delta from the assistant. / アシスタントからのテキスト差分 */
  onChunk?: (text: string) => void;
  /** Tool invocation started (Claude Code). / ツール呼び出し開始 */
  onToolUseStart?: (toolName: string) => void;
  /** Tool invocation finished. / ツール呼び出し完了 */
  onToolUseComplete?: (toolName: string) => void;
}

/**
 * Applies buffered sidecar events that arrived before `requestId` was known.
 * `requestId` 確定前に届いた sidecar イベントを適用する。
 */
function applyPreRequestBuffer(
  requestId: string,
  buffer: PreRequestEvent[],
  state: {
    aggregated: string;
    finished: boolean;
    errorMessage: string | null;
  },
  callbacks: StreamClaudeQueryCallbacks,
): void {
  for (const ev of buffer) {
    if (ev.id !== requestId) continue;
    if (ev.type === "chunk") {
      state.aggregated += ev.content;
      callbacks.onChunk?.(ev.content);
    } else if (ev.type === "complete") {
      state.aggregated = ev.result?.content ?? state.aggregated;
      state.finished = true;
    } else if (ev.type === "error") {
      state.errorMessage = ev.error;
      state.finished = true;
    } else if (ev.type === "toolStart") {
      callbacks.onToolUseStart?.(ev.toolName);
    } else if (ev.type === "toolComplete") {
      callbacks.onToolUseComplete?.(ev.toolName);
    }
  }
  buffer.length = 0;
}

/**
 * Sends `prompt` via the sidecar; invokes `onChunk` for each text delta; resolves with final text.
 * `prompt` を sidecar へ送り、テキスト差分ごとに `onChunk` を呼び、最終テキストで解決する。
 */
export async function streamClaudeQuery(
  prompt: string,
  options: ClaudeQueryOptions | undefined,
  signal: AbortSignal | undefined,
  callbacks: StreamClaudeQueryCallbacks,
): Promise<ClaudeQueryCompletionResult> {
  if (!isTauriDesktop()) {
    return { ok: false, error: "Claude Code is only available in the desktop app." };
  }

  let requestId: string | null = null;
  let resolveWait: (() => void) | null = null;
  let pendingAbortCleanup: (() => void) | null = null;
  const wake = (): void => {
    pendingAbortCleanup?.();
    pendingAbortCleanup = null;
    resolveWait?.();
    resolveWait = null;
  };

  let aggregated = "";
  let finished = false;
  let errorMessage: string | null = null;

  const preRequestBuffer: PreRequestEvent[] = [];

  const cleanups: Array<() => void> = [];

  try {
    cleanups.push(
      await onClaudeStreamChunk((payload) => {
        if (finished) return;
        if (requestId && payload.id === requestId) {
          aggregated += payload.content;
          callbacks.onChunk?.(payload.content);
          wake();
        } else if (!requestId) {
          preRequestBuffer.push({ type: "chunk", id: payload.id, content: payload.content });
        }
      }),
    );

    cleanups.push(
      await onClaudeStreamComplete((payload) => {
        if (finished) return;
        if (requestId && payload.id === requestId) {
          const text = payload.result?.content ?? aggregated;
          aggregated = text;
          finished = true;
          wake();
        } else if (!requestId) {
          preRequestBuffer.push({
            type: "complete",
            id: payload.id,
            result: payload.result,
          });
        }
      }),
    );

    cleanups.push(
      await onClaudeError((payload) => {
        if (finished) return;
        if (requestId && payload.id === requestId) {
          errorMessage = payload.error;
          finished = true;
          wake();
        } else if (!requestId) {
          preRequestBuffer.push({ type: "error", id: payload.id, error: payload.error });
        }
      }),
    );

    cleanups.push(
      await onClaudeToolUseStart((payload) => {
        if (finished) return;
        if (requestId && payload.id === requestId) {
          callbacks.onToolUseStart?.(payload.toolName);
        } else if (!requestId) {
          preRequestBuffer.push({
            type: "toolStart",
            id: payload.id,
            toolName: payload.toolName,
          });
        }
      }),
    );

    cleanups.push(
      await onClaudeToolUseComplete((payload) => {
        if (finished) return;
        if (requestId && payload.id === requestId) {
          callbacks.onToolUseComplete?.(payload.toolName);
        } else if (!requestId) {
          preRequestBuffer.push({
            type: "toolComplete",
            id: payload.id,
            toolName: payload.toolName,
          });
        }
      }),
    );

    if (signal?.aborted) {
      return { ok: false, error: "Aborted" };
    }
    requestId = await claudeQuery(prompt, options);

    const merged = { aggregated, finished, errorMessage };
    applyPreRequestBuffer(requestId, preRequestBuffer, merged, callbacks);
    aggregated = merged.aggregated;
    finished = merged.finished;
    errorMessage = merged.errorMessage;
    if (finished) wake();

    while (!finished) {
      if (signal?.aborted) {
        if (requestId) await claudeAbort(requestId);
        return { ok: false, error: "Aborted" };
      }

      await new Promise<void>((resolve) => {
        resolveWait = resolve;
        const onAbort = (): void => {
          pendingAbortCleanup = null;
          resolve();
          resolveWait = null;
        };
        pendingAbortCleanup = (): void => {
          signal?.removeEventListener("abort", onAbort);
        };
        signal?.addEventListener("abort", onAbort, { once: true });
        if (finished || signal?.aborted) {
          pendingAbortCleanup?.();
          pendingAbortCleanup = null;
          resolve();
          resolveWait = null;
        }
      });
    }

    if (errorMessage) {
      return { ok: false, error: errorMessage };
    }
    return { ok: true, content: aggregated };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  } finally {
    for (let i = cleanups.length - 1; i >= 0; i -= 1) {
      const unlisten = cleanups[i];
      if (!unlisten) continue;
      try {
        unlisten();
      } catch {
        /* ignore unlisten errors */
      }
    }
    requestId = null;
  }
}
