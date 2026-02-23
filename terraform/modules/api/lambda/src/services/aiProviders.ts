/**
 * AI プロバイダー — OpenAI / Anthropic / Google
 *
 * 既存 ai-api/lambda/src/services/aiProviders.ts の Drizzle 移植版
 */
import type { AIMessage, AIProviderType, AIChatOptions, TokenUsage } from "../types";

// ── OpenAI ──────────────────────────────────────────────────────────────────

export async function callOpenAI(
  apiKey: string,
  model: string,
  messages: AIMessage[],
  options: AIChatOptions = {},
): Promise<{ content: string; usage: TokenUsage; finishReason: string }> {
  const body: Record<string, unknown> = {
    model,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    temperature: options.temperature ?? 0.7,
    max_tokens: options.maxTokens ?? 4096,
    stream: false,
  };

  if (options.useWebSearch && options.webSearchOptions) {
    body.web_search_options = options.webSearchOptions;
  }

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`OpenAI API failed: ${res.status} - ${text}`);
  }

  const data = (await res.json()) as {
    choices: Array<{ message: { content: string }; finish_reason: string }>;
    usage: { prompt_tokens: number; completion_tokens: number };
  };

  return {
    content: data.choices[0]?.message?.content ?? "",
    usage: {
      inputTokens: data.usage?.prompt_tokens ?? 0,
      outputTokens: data.usage?.completion_tokens ?? 0,
    },
    finishReason: data.choices[0]?.finish_reason ?? "stop",
  };
}

export async function* streamOpenAI(
  apiKey: string,
  model: string,
  messages: AIMessage[],
  options: AIChatOptions = {},
): AsyncGenerator<{ content?: string; done?: boolean; finishReason?: string }> {
  const body: Record<string, unknown> = {
    model,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    temperature: options.temperature ?? 0.7,
    max_tokens: options.maxTokens ?? 4096,
    stream: true,
  };

  if (options.useWebSearch && options.webSearchOptions) {
    body.web_search_options = options.webSearchOptions;
  }

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`OpenAI API failed: ${res.status} - ${text}`);
  }

  yield* parseSSEStream(res.body!, (raw) => {
    const data = JSON.parse(raw) as {
      choices: Array<{ delta: { content?: string }; finish_reason?: string | null }>;
    };
    const choice = data.choices[0];
    if (!choice) return null;
    if (choice.finish_reason) return { done: true, finishReason: choice.finish_reason };
    if (choice.delta?.content) return { content: choice.delta.content };
    return null;
  });
}

// ── Anthropic ───────────────────────────────────────────────────────────────

export async function callAnthropic(
  apiKey: string,
  model: string,
  messages: AIMessage[],
  options: AIChatOptions = {},
): Promise<{ content: string; usage: TokenUsage; finishReason: string }> {
  const systemMessages = messages.filter((m) => m.role === "system");
  const nonSystemMessages = messages.filter((m) => m.role !== "system");

  const body: Record<string, unknown> = {
    model,
    messages: nonSystemMessages.map((m) => ({ role: m.role, content: m.content })),
    max_tokens: options.maxTokens ?? 4096,
    temperature: options.temperature ?? 0.7,
  };

  if (systemMessages.length > 0) {
    body.system = systemMessages.map((m) => m.content).join("\n\n");
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Anthropic API failed: ${res.status} - ${text}`);
  }

  const data = (await res.json()) as {
    content: Array<{ text: string }>;
    stop_reason: string;
    usage: { input_tokens: number; output_tokens: number };
  };

  return {
    content: data.content.map((c) => c.text).join(""),
    usage: {
      inputTokens: data.usage?.input_tokens ?? 0,
      outputTokens: data.usage?.output_tokens ?? 0,
    },
    finishReason: data.stop_reason ?? "end_turn",
  };
}

export async function* streamAnthropic(
  apiKey: string,
  model: string,
  messages: AIMessage[],
  options: AIChatOptions = {},
): AsyncGenerator<{ content?: string; done?: boolean; finishReason?: string }> {
  const systemMessages = messages.filter((m) => m.role === "system");
  const nonSystemMessages = messages.filter((m) => m.role !== "system");

  const body: Record<string, unknown> = {
    model,
    messages: nonSystemMessages.map((m) => ({ role: m.role, content: m.content })),
    max_tokens: options.maxTokens ?? 4096,
    temperature: options.temperature ?? 0.7,
    stream: true,
  };

  if (systemMessages.length > 0) {
    body.system = systemMessages.map((m) => m.content).join("\n\n");
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Anthropic API failed: ${res.status} - ${text}`);
  }

  yield* parseSSEStream(res.body!, (raw) => {
    const event = JSON.parse(raw) as {
      type: string;
      delta?: { text?: string; stop_reason?: string };
    };
    if (event.type === "content_block_delta" && event.delta?.text) {
      return { content: event.delta.text };
    }
    if (event.type === "message_delta" && event.delta?.stop_reason) {
      return { done: true, finishReason: event.delta.stop_reason };
    }
    return null;
  });
}

// ── Google (Gemini) ─────────────────────────────────────────────────────────

export async function callGoogle(
  apiKey: string,
  model: string,
  messages: AIMessage[],
  options: AIChatOptions = {},
): Promise<{ content: string; usage: TokenUsage; finishReason: string }> {
  const contents = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

  const systemInstruction = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");

  const body: Record<string, unknown> = {
    contents,
    generationConfig: {
      temperature: options.temperature ?? 0.7,
      maxOutputTokens: options.maxTokens ?? 4096,
    },
  };

  if (systemInstruction) {
    body.systemInstruction = { parts: [{ text: systemInstruction }] };
  }

  if (options.useGoogleSearch) {
    body.tools = [{ googleSearch: {} }];
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: {
        "x-goog-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Google AI API failed: ${res.status} - ${text}`);
  }

  const data = (await res.json()) as {
    candidates: Array<{
      content: { parts: Array<{ text: string }> };
      finishReason: string;
    }>;
    usageMetadata?: { promptTokenCount: number; candidatesTokenCount: number };
  };

  const candidate = data.candidates?.[0];

  return {
    content: candidate?.content?.parts?.map((p) => p.text).join("") ?? "",
    usage: {
      inputTokens: data.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
    },
    finishReason: candidate?.finishReason ?? "STOP",
  };
}

export async function* streamGoogle(
  apiKey: string,
  model: string,
  messages: AIMessage[],
  options: AIChatOptions = {},
): AsyncGenerator<{ content?: string; done?: boolean; finishReason?: string }> {
  const contents = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

  const systemInstruction = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");

  const body: Record<string, unknown> = {
    contents,
    generationConfig: {
      temperature: options.temperature ?? 0.7,
      maxOutputTokens: options.maxTokens ?? 4096,
    },
  };

  if (systemInstruction) {
    body.systemInstruction = { parts: [{ text: systemInstruction }] };
  }

  if (options.useGoogleSearch) {
    body.tools = [{ googleSearch: {} }];
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`,
    {
      method: "POST",
      headers: {
        "x-goog-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Google AI API failed: ${res.status} - ${text}`);
  }

  yield* parseSSEStream(res.body!, (raw) => {
    const data = JSON.parse(raw) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
        finishReason?: string;
      }>;
    };
    const candidate = data.candidates?.[0];
    if (!candidate) return null;
    const text = candidate.content?.parts?.[0]?.text;
    if (candidate.finishReason && candidate.finishReason !== "STOP") {
      return { done: true, finishReason: candidate.finishReason };
    }
    if (text) return { content: text };
    if (candidate.finishReason === "STOP") return { done: true, finishReason: "STOP" };
    return null;
  });
}

// ── SSE ストリームパーサー (共通) ───────────────────────────────────────────

async function* parseSSEStream<T>(
  body: ReadableStream<Uint8Array>,
  parse: (raw: string) => T | null,
): AsyncGenerator<T> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      let newlineIndex = buffer.indexOf("\n");

      while (newlineIndex !== -1) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);

        if (line.startsWith("data:")) {
          const payload = line.slice(5).trim();
          if (payload && payload !== "[DONE]") {
            try {
              const result = parse(payload);
              if (result) yield result;
            } catch {
              // skip invalid JSON
            }
          }
        }
        newlineIndex = buffer.indexOf("\n");
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// ── ディスパッチャー ────────────────────────────────────────────────────────

export function getProviderApiKeyName(provider: AIProviderType): string {
  switch (provider) {
    case "openai":
      return "OPENAI_API_KEY";
    case "anthropic":
      return "ANTHROPIC_API_KEY";
    case "google":
      return "GOOGLE_AI_API_KEY";
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

export async function callProvider(
  provider: AIProviderType,
  apiKey: string,
  model: string,
  messages: AIMessage[],
  options: AIChatOptions = {},
): Promise<{ content: string; usage: TokenUsage; finishReason: string }> {
  switch (provider) {
    case "openai":
      return callOpenAI(apiKey, model, messages, options);
    case "anthropic":
      return callAnthropic(apiKey, model, messages, options);
    case "google":
      return callGoogle(apiKey, model, messages, options);
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

export function streamProvider(
  provider: AIProviderType,
  apiKey: string,
  model: string,
  messages: AIMessage[],
  options: AIChatOptions = {},
): AsyncGenerator<{ content?: string; done?: boolean; finishReason?: string }> {
  switch (provider) {
    case "openai":
      return streamOpenAI(apiKey, model, messages, options);
    case "anthropic":
      return streamAnthropic(apiKey, model, messages, options);
    case "google":
      return streamGoogle(apiKey, model, messages, options);
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}
