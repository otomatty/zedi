/**
 * Runs one Claude Code sidecar query and returns the final assistant text.
 * Claude Code sidecar のクエリを 1 回実行し、最終アシスタントテキストを返す。
 *
 * Used by executable code blocks and similar flows that need a full result string.
 * 実行可能コードブロックなど、完全な結果文字列が必要なフローで使用する。
 *
 * Events that arrive after listeners are registered but before `claudeQuery` resolves
 * its request id are buffered and replayed for the matching id (avoids losing early chunks).
 * リスナー登録後〜`claudeQuery` が ID を返すまでに届くイベントはバッファし、同一 ID で再生する（早期チャンク欠落を防ぐ）。
 */

import { isTauriDesktop } from "@/lib/platform";
import {
  claudeAbort,
  claudeQuery,
  onClaudeError,
  onClaudeStreamChunk,
  onClaudeStreamComplete,
} from "./bridge";
import type { ClaudeQueryOptions } from "./bridge";

/** Outcome of {@link runClaudeQueryToCompletion}. / {@link runClaudeQueryToCompletion} の結果。 */
export type ClaudeQueryCompletionResult =
  | { ok: true; content: string }
  | { ok: false; error: string };

type PreRequestEvent =
  | { type: "chunk"; id: string; content: string }
  | { type: "complete"; id: string; result?: { content: string } }
  | { type: "error"; id: string; error: string };

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
): void {
  for (const ev of buffer) {
    if (ev.id !== requestId) continue;
    if (ev.type === "chunk") {
      state.aggregated += ev.content;
    } else if (ev.type === "complete") {
      state.aggregated = ev.result?.content ?? state.aggregated;
      state.finished = true;
    } else if (ev.type === "error") {
      state.errorMessage = ev.error;
      state.finished = true;
    }
  }
  buffer.length = 0;
}

/**
 * Sends `prompt` via the sidecar and resolves when the stream completes or errors.
 * `prompt` を sidecar 経由で送り、ストリーム完了またはエラーで解決する。
 */
export async function runClaudeQueryToCompletion(
  prompt: string,
  options?: ClaudeQueryOptions,
  signal?: AbortSignal,
): Promise<ClaudeQueryCompletionResult> {
  if (!isTauriDesktop()) {
    return { ok: false, error: "Claude Code is only available in the desktop app." };
  }

  let requestId: string | null = null;
  let resolveWait: (() => void) | null = null;
  const wake = (): void => {
    resolveWait?.();
    resolveWait = null;
  };

  let aggregated = "";
  let finished = false;
  let errorMessage: string | null = null;

  const preRequestBuffer: PreRequestEvent[] = [];

  const unlistenChunk = await onClaudeStreamChunk((payload) => {
    if (finished) return;
    if (requestId && payload.id === requestId) {
      aggregated += payload.content;
      wake();
    } else if (!requestId) {
      preRequestBuffer.push({ type: "chunk", id: payload.id, content: payload.content });
    }
  });

  const unlistenComplete = await onClaudeStreamComplete((payload) => {
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
  });

  const unlistenError = await onClaudeError((payload) => {
    if (finished) return;
    if (requestId && payload.id === requestId) {
      errorMessage = payload.error;
      finished = true;
      wake();
    } else if (!requestId) {
      preRequestBuffer.push({ type: "error", id: payload.id, error: payload.error });
    }
  });

  try {
    requestId = await claudeQuery(prompt, options);

    const merged = { aggregated, finished, errorMessage };
    applyPreRequestBuffer(requestId, preRequestBuffer, merged);
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
          resolve();
          resolveWait = null;
        };
        signal?.addEventListener("abort", onAbort, { once: true });
        if (finished || signal?.aborted) {
          resolve();
          resolveWait = null;
          signal?.removeEventListener("abort", onAbort);
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
    unlistenChunk();
    unlistenComplete();
    unlistenError();
    requestId = null;
  }
}
