import type { Env } from "../types/env";
import type { AIChatRequest, AIChatResponse } from "../types/api";
import type { SSEWriter } from "../utils/sse";
import { consumeSSEStream } from "../utils/sse";

function getRequiredEnv(key: keyof Env, env: Env): string {
  const value = env[key];
  if (!value) {
    throw new Error(`${key} is not configured`);
  }
  return value;
}

export async function fetchOpenAI(
  env: Env,
  request: AIChatRequest
): Promise<AIChatResponse> {
  const apiKey = getRequiredEnv("OPENAI_API_KEY", env);
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

  const data = await response.json();
  if (!response.ok) {
    const message = data?.error?.message || "OpenAI API error";
    throw new Error(message);
  }

  return {
    content: data?.choices?.[0]?.message?.content || "",
    finishReason: data?.choices?.[0]?.finish_reason,
  };
}

export async function streamOpenAI(
  env: Env,
  request: AIChatRequest,
  writer: SSEWriter,
  abortSignal?: AbortSignal
): Promise<void> {
  const apiKey = getRequiredEnv("OPENAI_API_KEY", env);
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
      web_search_options: request.options?.webSearchOptions,
    }),
    signal: abortSignal,
  });

  if (!response.ok) {
    const data = await response.json();
    const message = data?.error?.message || "OpenAI API error";
    throw new Error(message);
  }

  const body = response.body;
  if (!body) {
    throw new Error("OpenAI stream body is empty");
  }

  let finishReason: string | undefined;

  await consumeSSEStream(
    body,
    (raw) => {
      const payload = JSON.parse(raw);
      const choice = payload?.choices?.[0];
      const delta = choice?.delta?.content;
      if (delta) {
        writer.send({ content: delta });
      }
      if (choice?.finish_reason) {
        finishReason = choice.finish_reason;
      }
    },
    abortSignal
  );

  writer.send({ done: true, finishReason });
}

export async function fetchAnthropic(
  env: Env,
  request: AIChatRequest
): Promise<AIChatResponse> {
  const apiKey = getRequiredEnv("ANTHROPIC_API_KEY", env);
  const systemPrompt = request.messages
    .filter((message) => message.role === "system")
    .map((message) => message.content)
    .join("\n");
  const messages = request.messages.filter((message) => message.role !== "system");

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
        ? [
            {
              type: "web_search_20250305",
              name: "web_search",
              max_uses: 5,
            },
          ]
        : undefined,
      stream: false,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    const message = data?.error?.message || "Anthropic API error";
    throw new Error(message);
  }

  const textBlock = data?.content?.find((block: { type: string }) => block.type === "text");
  return {
    content: textBlock?.text || "",
    finishReason: data?.stop_reason,
  };
}

export async function streamAnthropic(
  env: Env,
  request: AIChatRequest,
  writer: SSEWriter,
  abortSignal?: AbortSignal
): Promise<void> {
  const apiKey = getRequiredEnv("ANTHROPIC_API_KEY", env);
  const systemPrompt = request.messages
    .filter((message) => message.role === "system")
    .map((message) => message.content)
    .join("\n");
  const messages = request.messages.filter((message) => message.role !== "system");

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
        ? [
            {
              type: "web_search_20250305",
              name: "web_search",
              max_uses: 5,
            },
          ]
        : undefined,
      stream: true,
    }),
    signal: abortSignal,
  });

  if (!response.ok) {
    const data = await response.json();
    const message = data?.error?.message || "Anthropic API error";
    throw new Error(message);
  }

  const body = response.body;
  if (!body) {
    throw new Error("Anthropic stream body is empty");
  }

  let finishReason: string | undefined;

  await consumeSSEStream(
    body,
    (raw) => {
      const payload = JSON.parse(raw);
      if (
        payload?.type === "content_block_delta" &&
        payload?.delta?.type === "text_delta"
      ) {
        const delta = payload.delta.text;
        if (delta) {
          writer.send({ content: delta });
        }
      }

      if (payload?.type === "message_delta" && payload?.delta?.stop_reason) {
        finishReason = payload.delta.stop_reason;
      }
    },
    abortSignal
  );

  writer.send({ done: true, finishReason });
}

export async function fetchGoogle(
  env: Env,
  request: AIChatRequest
): Promise<AIChatResponse> {
  const apiKey = getRequiredEnv("GOOGLE_AI_API_KEY", env);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${request.model}:generateContent?key=${apiKey}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: request.messages.map((message) => ({
        role: message.role === "assistant" ? "model" : "user",
        parts: [{ text: message.content }],
      })),
      generationConfig: {
        temperature: request.options?.temperature,
        maxOutputTokens: request.options?.maxTokens,
      },
      tools: request.options?.useGoogleSearch ? [{ googleSearch: {} }] : undefined,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    const message = data?.error?.message || "Google AI API error";
    throw new Error(message);
  }

  const parts = data?.candidates?.[0]?.content?.parts ?? [];
  const content = parts
    .map((part: { text?: string }) => part.text)
    .filter(Boolean)
    .join("");

  return {
    content,
    finishReason: data?.candidates?.[0]?.finishReason,
  };
}
