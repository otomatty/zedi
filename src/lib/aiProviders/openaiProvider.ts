/**
 * OpenAI unified provider implementation (Issue #457).
 * OpenAI 統一プロバイダー実装（Issue #457）。
 */

import OpenAI from "openai";
import { getProviderById } from "@/types/ai";
import { mergeAbortSignals } from "@/lib/mergeAbortSignals";
import type { AIRequest, AIStreamChunk, UnifiedAIProvider } from "./types";

/**
 * OpenAI API プロバイダーを生成する。
 * Creates an OpenAI API provider instance.
 */
export function createOpenAIProvider(apiKey: string): UnifiedAIProvider {
  const meta = getProviderById("openai");
  if (!meta) throw new Error("OpenAI provider metadata not found");

  let abortController: AbortController | null = null;

  return {
    id: "openai",
    name: meta.name,
    capabilities: meta.capabilities,

    async *query(request: AIRequest, signal?: AbortSignal): AsyncIterable<AIStreamChunk> {
      const client = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });
      abortController = new AbortController();
      const mergedSignal = mergeAbortSignals(signal, abortController);

      const stream = await client.chat.completions.create(
        {
          model: request.model,
          messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
          max_tokens: request.options?.maxTokens ?? 4000,
          temperature: request.options?.temperature ?? 0.7,
          stream: true,
        },
        { signal: mergedSignal },
      );

      for await (const chunk of stream) {
        if (mergedSignal.aborted) break;
        const content = chunk.choices[0]?.delta?.content ?? "";
        if (content) {
          yield { type: "text", content };
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
