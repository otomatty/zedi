/**
 * Claude Code unified provider implementation (Issue #457).
 * Claude Code 統一プロバイダー実装（Issue #457）。
 *
 * Wraps the Tauri sidecar bridge from Issue #456.
 * Issue #456 の Tauri sidecar ブリッジをラップする。
 */

import { getProviderById } from "@/types/ai";
import { isTauriDesktop } from "@/lib/platform";
import type { AIRequest, AIStreamChunk, UnifiedAIProvider } from "./types";

/**
 * Claude Code プロバイダーを生成する。デスクトップ環境（Tauri）でのみ動作する。
 * Creates a Claude Code provider. Only works in a desktop (Tauri) environment.
 */
export function createClaudeCodeProvider(): UnifiedAIProvider {
  const meta = getProviderById("claude-code");
  if (!meta) throw new Error("Claude Code provider metadata not found");

  let currentRequestId: string | null = null;
  let aborted = false;

  return {
    id: "claude-code",
    name: meta.name,
    capabilities: meta.capabilities,

    async *query(request: AIRequest, signal?: AbortSignal): AsyncIterable<AIStreamChunk> {
      if (!isTauriDesktop()) {
        yield { type: "error", content: "Claude Code はデスクトップアプリでのみ利用可能です。" };
        return;
      }

      aborted = false;

      const {
        claudeQuery,
        onClaudeStreamChunk,
        onClaudeStreamComplete,
        onClaudeError,
        claudeAbort,
      } = await import("@/lib/claudeCode/bridge");

      const chunks: AIStreamChunk[] = [];
      let done = false;
      let resolveWait: (() => void) | null = null;

      const wake = () => {
        resolveWait?.();
        resolveWait = null;
      };

      const unlistenChunk = await onClaudeStreamChunk((payload) => {
        if (currentRequestId && payload.id === currentRequestId) {
          chunks.push({ type: "text", content: payload.content });
          wake();
        }
      });

      const unlistenComplete = await onClaudeStreamComplete((payload) => {
        if (currentRequestId && payload.id === currentRequestId) {
          chunks.push({ type: "done", content: "" });
          done = true;
          wake();
        }
      });

      const unlistenError = await onClaudeError((payload) => {
        if (currentRequestId && payload.id === currentRequestId) {
          chunks.push({ type: "error", content: payload.error });
          done = true;
          wake();
        }
      });

      try {
        const prompt = request.messages.map((m) => m.content).join("\n\n");
        currentRequestId = await claudeQuery(prompt, {
          cwd: request.options?.cwd,
          maxTurns: request.options?.maxTurns,
          allowedTools: request.options?.allowedTools,
        });

        while (!done && !aborted) {
          if (signal?.aborted) {
            if (currentRequestId) await claudeAbort(currentRequestId);
            break;
          }

          if (chunks.length > 0) {
            const chunk = chunks.shift();
            if (!chunk) continue;
            yield chunk;
            if (chunk.type === "done" || chunk.type === "error") break;
          } else {
            await new Promise<void>((resolve) => {
              resolveWait = resolve;
              if (chunks.length > 0 || done) {
                resolve();
                resolveWait = null;
              }
            });
          }
        }
      } finally {
        unlistenChunk();
        unlistenComplete();
        unlistenError();
        currentRequestId = null;
      }
    },

    abort() {
      aborted = true;
      const reqId = currentRequestId;
      if (reqId && isTauriDesktop()) {
        void import("@/lib/claudeCode/bridge").then(({ claudeAbort }) => {
          claudeAbort(reqId);
        });
      }
    },

    async isAvailable(): Promise<boolean> {
      if (!isTauriDesktop()) return false;
      try {
        const { checkClaudeInstallation } = await import("@/lib/claudeCode/bridge");
        const result = await checkClaudeInstallation();
        return result.installed;
      } catch {
        return false;
      }
    },
  };
}
