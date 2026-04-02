/**
 * Google AI (Gemini) unified provider implementation (Issue #457).
 * Google AI (Gemini) 統一プロバイダー実装（Issue #457）。
 */

import { GoogleGenAI } from "@google/genai";
import { getProviderById } from "@/types/ai";
import { mergeAbortSignals } from "@/lib/mergeAbortSignals";
import type { AIRequest, AIStreamChunk, UnifiedAIProvider } from "./types";

/**
 * Google AI プロバイダーを生成する。
 * Creates a Google AI provider instance.
 */
export function createGoogleProvider(apiKey: string): UnifiedAIProvider {
  const meta = getProviderById("google");
  if (!meta) throw new Error("Google provider metadata not found");

  let abortController: AbortController | null = null;

  return {
    id: "google",
    name: meta.name,
    capabilities: meta.capabilities,

    async *query(request: AIRequest, signal?: AbortSignal): AsyncIterable<AIStreamChunk> {
      const client = new GoogleGenAI({ apiKey });
      abortController = new AbortController();
      const mergedSignal = mergeAbortSignals(signal, abortController);

      const response = await client.models.generateContentStream({
        model: request.model,
        contents: request.messages.map((m) => m.content).join("\n\n"),
        config: {
          tools: [{ googleSearch: {} }],
          maxOutputTokens: request.options?.maxTokens ?? 4000,
          temperature: request.options?.temperature ?? 0.7,
        },
      });

      for await (const chunk of response) {
        if (mergedSignal.aborted) break;
        const content = chunk.text;
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
