/**
 * AI Provider service — calls OpenAI, Anthropic, Google APIs via native fetch.
 * Migrated from workers/ai-api/src/services/aiProviders.ts
 *
 * Key additions over the Cloudflare Worker version:
 * - Token usage extraction from provider responses
 * - SSE writer accepts a Node.js WritableStream
 */

import type { AIChatRequest, AIChatResponse, TokenUsage, SSEPayload } from "../types/index.js";
import { consumeProviderSSE, writeSSE } from "../utils/sse.js";

// =============================================================================
// OpenAI
// =============================================================================

export async function fetchOpenAI(
  apiKey: string,
  request: AIChatRequest
): Promise<AIChatResponse & { tokenUsage: TokenUsage }> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: request.model,
      messages: request.messages,
      max_tokens: request.options?.maxTokens,
      temperature: request.options?.temperature,
      stream: false,
      web_search_options: request.options?.webSearchOptions,
    }),
  });

  const data = await response.json() as Record<string, unknown>;
  if (!response.ok) {
    const message = (data?.error as Record<string, string>)?.message || "OpenAI API error";
    throw new Error(message);
  }

  const choices = data?.choices as Array<Record<string, unknown>> | undefined;
  const usage = data?.usage as { prompt_tokens?: number; completion_tokens?: number } | undefined;

  return {
    content: (choices?.[0]?.message as Record<string, string>)?.content || "",
    finishReason: choices?.[0]?.finish_reason as string | undefined,
    tokenUsage: {
      inputTokens: usage?.prompt_tokens ?? 0,
      outputTokens: usage?.completion_tokens ?? 0,
    },
  };
}

export async function streamOpenAI(
  apiKey: string,
  request: AIChatRequest,
  stream: NodeJS.WritableStream,
  writeFn: (payload: SSEPayload) => void
): Promise<TokenUsage> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: request.model,
      messages: request.messages,
      max_tokens: request.options?.maxTokens,
      temperature: request.options?.temperature,
      stream: true,
      stream_options: { include_usage: true },
      web_search_options: request.options?.webSearchOptions,
    }),
  });

  if (!response.ok) {
    const data = await response.json() as Record<string, unknown>;
    const message = (data?.error as Record<string, string>)?.message || "OpenAI API error";
    throw new Error(message);
  }

  const body = response.body;
  if (!body) throw new Error("OpenAI stream body is empty");

  let finishReason: string | undefined;
  let tokenUsage: TokenUsage = { inputTokens: 0, outputTokens: 0 };

  await consumeProviderSSE(body, (raw) => {
    const payload = JSON.parse(raw);
    const choice = payload?.choices?.[0];
    const delta = choice?.delta?.content;
    if (delta) {
      writeFn({ content: delta });
    }
    if (choice?.finish_reason) {
      finishReason = choice.finish_reason;
    }
    // stream_options: { include_usage: true } gives usage in the final chunk
    if (payload?.usage) {
      tokenUsage = {
        inputTokens: payload.usage.prompt_tokens ?? 0,
        outputTokens: payload.usage.completion_tokens ?? 0,
      };
    }
  });

  writeFn({ done: true, finishReason });
  return tokenUsage;
}

// =============================================================================
// Anthropic
// =============================================================================

export async function fetchAnthropic(
  apiKey: string,
  request: AIChatRequest
): Promise<AIChatResponse & { tokenUsage: TokenUsage }> {
  const systemPrompt = request.messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n");
  const messages = request.messages.filter((m) => m.role !== "system");

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: request.model,
      max_tokens: request.options?.maxTokens ?? 4000,
      temperature: request.options?.temperature,
      system: systemPrompt || undefined,
      messages,
      tools: request.options?.useWebSearch
        ? [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }]
        : undefined,
      stream: false,
    }),
  });

  const data = await response.json() as Record<string, unknown>;
  if (!response.ok) {
    const message = (data?.error as Record<string, string>)?.message || "Anthropic API error";
    throw new Error(message);
  }

  const content = data?.content as Array<{ type: string; text?: string }> | undefined;
  const textBlock = content?.find((b) => b.type === "text");
  const usage = data?.usage as { input_tokens?: number; output_tokens?: number } | undefined;

  return {
    content: textBlock?.text || "",
    finishReason: data?.stop_reason as string | undefined,
    tokenUsage: {
      inputTokens: usage?.input_tokens ?? 0,
      outputTokens: usage?.output_tokens ?? 0,
    },
  };
}

export async function streamAnthropic(
  apiKey: string,
  request: AIChatRequest,
  stream: NodeJS.WritableStream,
  writeFn: (payload: SSEPayload) => void
): Promise<TokenUsage> {
  const systemPrompt = request.messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n");
  const messages = request.messages.filter((m) => m.role !== "system");

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: request.model,
      max_tokens: request.options?.maxTokens ?? 4000,
      temperature: request.options?.temperature,
      system: systemPrompt || undefined,
      messages,
      tools: request.options?.useWebSearch
        ? [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }]
        : undefined,
      stream: true,
    }),
  });

  if (!response.ok) {
    const data = await response.json() as Record<string, unknown>;
    const message = (data?.error as Record<string, string>)?.message || "Anthropic API error";
    throw new Error(message);
  }

  const body = response.body;
  if (!body) throw new Error("Anthropic stream body is empty");

  let finishReason: string | undefined;
  let tokenUsage: TokenUsage = { inputTokens: 0, outputTokens: 0 };

  await consumeProviderSSE(body, (raw) => {
    const payload = JSON.parse(raw);

    if (payload?.type === "message_start" && payload?.message?.usage) {
      tokenUsage.inputTokens = payload.message.usage.input_tokens ?? 0;
    }

    if (payload?.type === "content_block_delta" && payload?.delta?.type === "text_delta") {
      const delta = payload.delta.text;
      if (delta) {
        writeFn({ content: delta });
      }
    }

    if (payload?.type === "message_delta") {
      if (payload?.delta?.stop_reason) {
        finishReason = payload.delta.stop_reason;
      }
      if (payload?.usage?.output_tokens) {
        tokenUsage.outputTokens = payload.usage.output_tokens;
      }
    }
  });

  writeFn({ done: true, finishReason });
  return tokenUsage;
}

// =============================================================================
// Google
// =============================================================================

export async function fetchGoogle(
  apiKey: string,
  request: AIChatRequest
): Promise<AIChatResponse & { tokenUsage: TokenUsage }> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${request.model}:generateContent?key=${apiKey}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: request.messages.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      })),
      generationConfig: {
        temperature: request.options?.temperature,
        maxOutputTokens: request.options?.maxTokens,
      },
      tools: request.options?.useGoogleSearch ? [{ googleSearch: {} }] : undefined,
    }),
  });

  const data = await response.json() as Record<string, unknown>;
  if (!response.ok) {
    const message = (data?.error as Record<string, string>)?.message || "Google AI API error";
    throw new Error(message);
  }

  const candidates = data?.candidates as Array<Record<string, unknown>> | undefined;
  const parts = (candidates?.[0]?.content as Record<string, unknown>)?.parts as Array<{ text?: string }> | undefined;
  const content = parts?.map((p) => p.text).filter(Boolean).join("") ?? "";

  const usageMetadata = data?.usageMetadata as {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
  } | undefined;

  return {
    content,
    finishReason: candidates?.[0]?.finishReason as string | undefined,
    tokenUsage: {
      inputTokens: usageMetadata?.promptTokenCount ?? 0,
      outputTokens: usageMetadata?.candidatesTokenCount ?? 0,
    },
  };
}

/**
 * Google streaming via SSE. Google Gemini supports server-sent events via
 * the streamGenerateContent endpoint.
 */
export async function streamGoogle(
  apiKey: string,
  request: AIChatRequest,
  stream: NodeJS.WritableStream,
  writeFn: (payload: SSEPayload) => void
): Promise<TokenUsage> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${request.model}:streamGenerateContent?alt=sse&key=${apiKey}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: request.messages.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      })),
      generationConfig: {
        temperature: request.options?.temperature,
        maxOutputTokens: request.options?.maxTokens,
      },
      tools: request.options?.useGoogleSearch ? [{ googleSearch: {} }] : undefined,
    }),
  });

  if (!response.ok) {
    const data = await response.json() as Record<string, unknown>;
    const message = (data?.error as Record<string, string>)?.message || "Google AI API error";
    throw new Error(message);
  }

  const body = response.body;
  if (!body) throw new Error("Google stream body is empty");

  let tokenUsage: TokenUsage = { inputTokens: 0, outputTokens: 0 };

  await consumeProviderSSE(body, (raw) => {
    const payload = JSON.parse(raw);
    const candidates = payload?.candidates;
    if (candidates?.[0]?.content?.parts) {
      for (const part of candidates[0].content.parts) {
        if (part.text) {
          writeFn({ content: part.text });
        }
      }
    }
    if (payload?.usageMetadata) {
      tokenUsage = {
        inputTokens: payload.usageMetadata.promptTokenCount ?? tokenUsage.inputTokens,
        outputTokens: payload.usageMetadata.candidatesTokenCount ?? tokenUsage.outputTokens,
      };
    }
  });

  writeFn({ done: true, finishReason: "stop" });
  return tokenUsage;
}
