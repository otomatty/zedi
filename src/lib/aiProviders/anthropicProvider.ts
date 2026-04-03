/**
 * Anthropic unified provider implementation (Issue #457).
 * Anthropic 統一プロバイダー実装（Issue #457）。
 */

import Anthropic from "@anthropic-ai/sdk";
import { getProviderById } from "@/types/ai";
import { mergeAbortSignals } from "@/lib/mergeAbortSignals";
import type { AIRequest, AIStreamChunk, UnifiedAIProvider } from "./types";

/**
 * Anthropic API プロバイダーを生成する。
 * Creates an Anthropic API provider instance.
 */
export function createAnthropicProvider(apiKey: string): UnifiedAIProvider {
  const meta = getProviderById("anthropic");
  if (!meta) throw new Error("Anthropic provider metadata not found");

  let abortController: AbortController | null = null;

  return {
    id: "anthropic",
    name: meta.name,
    capabilities: meta.capabilities,

    async *query(request: AIRequest, signal?: AbortSignal): AsyncIterable<AIStreamChunk> {
      const client = new Anthropic({ apiKey });
      abortController = new AbortController();
      const mergedSignal = mergeAbortSignals(signal, abortController);

      const systemMessages = request.messages.filter((m) => m.role === "system");
      const chatMessages = request.messages.filter((m) => m.role !== "system");

      const stream = client.messages.stream(
        {
          model: request.model,
          max_tokens: request.options?.maxTokens ?? 4000,
          messages: chatMessages.map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          })),
          ...(systemMessages.length > 0 && {
            system: systemMessages.map((m) => m.content).join("\n\n"),
          }),
        },
        { signal: mergedSignal },
      );

      for await (const event of stream) {
        if (mergedSignal.aborted) break;
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          yield { type: "text", content: event.delta.text };
        }
      }
      yield { type: "done", content: "" };
    },

    abort() {
      abortController?.abort();
      abortController = null;
    },

    async isAvailable(): Promise<boolean> {
      return !!apiKey;
    },
  };
}
