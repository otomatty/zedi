/**
 * Claude Code unified provider implementation (Issue #457).
 * Claude Code 統一プロバイダー実装（Issue #457）。
 *
 * Wraps the Tauri sidecar bridge from Issue #456.
 * Issue #456 の Tauri sidecar ブリッジをラップする。
 */

import { getProviderById } from "@/types/ai";
import { isTauriDesktop } from "@/lib/platform";
import { useMcpConfigStore, getMcpServersForQuery } from "@/stores/mcpConfigStore";
import type { McpConnectionStatus, McpServerTool } from "@/types/mcp";
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
  let resolveWait: (() => void) | null = null;

  const wake = (): void => {
    resolveWait?.();
    resolveWait = null;
  };

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
      resolveWait = null;

      const {
        claudeQuery,
        onClaudeStreamChunk,
        onClaudeStreamComplete,
        onClaudeError,
        onClaudeToolUseStart,
        onClaudeToolUseComplete,
        onClaudeMcpStatus,
        claudeAbort,
      } = await import("@/lib/claudeCode/bridge");

      const chunks: AIStreamChunk[] = [];
      let done = false;

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

      const unlistenToolStart = await onClaudeToolUseStart((payload) => {
        if (currentRequestId && payload.id === currentRequestId) {
          chunks.push({
            type: "tool_use_start",
            content: payload.toolInput,
            toolName: payload.toolName,
          });
          wake();
        }
      });

      const unlistenToolComplete = await onClaudeToolUseComplete((payload) => {
        if (currentRequestId && payload.id === currentRequestId) {
          chunks.push({
            type: "tool_use_complete",
            content: "",
            toolName: payload.toolName,
          });
          wake();
        }
      });

      const unlistenMcpStatus = await onClaudeMcpStatus((payload) => {
        if (currentRequestId && payload.id === currentRequestId && payload.servers) {
          const store = useMcpConfigStore.getState();
          store.updateStatuses(
            payload.servers.map((s) => ({
              name: s.name,
              status: (s.status as McpConnectionStatus) || "unknown",
              error: s.error,
              tools: s.tools as McpServerTool[] | undefined,
            })),
          );
        }
      });

      try {
        const mcpServers = getMcpServersForQuery(useMcpConfigStore.getState().servers);

        const prompt = request.messages.map((m) => m.content).join("\n\n");
        currentRequestId = await claudeQuery(prompt, {
          model: request.model || undefined,
          cwd: request.options?.cwd,
          maxTurns: request.options?.maxTurns,
          allowedTools: request.options?.allowedTools,
          mcpServers: mcpServers as Record<string, Record<string, unknown>> | undefined,
        });

        while (!aborted) {
          if (signal?.aborted) {
            if (currentRequestId) await claudeAbort(currentRequestId);
            break;
          }

          if (chunks.length > 0) {
            const chunk = chunks.shift();
            if (!chunk) continue;
            yield chunk;
            if (chunk.type === "done" || chunk.type === "error") break;
          } else if (done) {
            break;
          } else {
            await new Promise<void>((resolve) => {
              resolveWait = resolve;
              const onAbort = (): void => {
                resolve();
                resolveWait = null;
              };
              signal?.addEventListener("abort", onAbort, { once: true });
              if (chunks.length > 0 || done || signal?.aborted) {
                resolve();
                resolveWait = null;
                signal?.removeEventListener("abort", onAbort);
              }
            });
          }
        }
      } finally {
        unlistenChunk();
        unlistenComplete();
        unlistenError();
        unlistenToolStart();
        unlistenToolComplete();
        unlistenMcpStatus();
        currentRequestId = null;
      }
    },

    abort() {
      aborted = true;
      wake();
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
