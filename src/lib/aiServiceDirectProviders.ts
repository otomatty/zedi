/**
 * AI サービス — プロバイダー直接呼び出し。
 * AI service — direct provider SDK calls.
 */

import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import type { AISettings } from "@/types/ai";
import type { AIServiceRequest, AIServiceCallbacks } from "./aiService";

// ---------------------------------------------------------------------------
// OpenAI
// ---------------------------------------------------------------------------

async function callOpenAIStream(
  client: OpenAI,
  request: AIServiceRequest,
  callbacks: AIServiceCallbacks,
  abortSignal?: AbortSignal,
): Promise<void> {
  const stream = await client.chat.completions.create(
    {
      model: request.model,
      messages: request.messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      })),
      max_tokens: request.options?.maxTokens ?? 4000,
      temperature: request.options?.temperature ?? 0.7,
      stream: true,
      web_search_options: request.options?.webSearchOptions,
    },
    { signal: abortSignal },
  );
  let fullContent = "";
  for await (const chunk of stream) {
    if (abortSignal?.aborted) {
      throw new Error("ABORTED");
    }
    const content = chunk.choices[0]?.delta?.content || "";
    if (content) {
      fullContent += content;
      callbacks.onChunk?.(content);
    }
  }
  callbacks.onComplete?.({
    content: fullContent,
    finishReason: "stop",
  });
}

async function callOpenAINonStream(
  client: OpenAI,
  request: AIServiceRequest,
  callbacks: AIServiceCallbacks,
  abortSignal?: AbortSignal,
): Promise<void> {
  const response = await client.chat.completions.create(
    {
      model: request.model,
      messages: request.messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      })),
      max_tokens: request.options?.maxTokens ?? 4000,
      temperature: request.options?.temperature ?? 0.7,
      stream: false,
    },
    { signal: abortSignal },
  );
  const content = response.choices[0]?.message?.content || "";
  callbacks.onComplete?.({
    content,
    finishReason: response.choices[0]?.finish_reason,
  });
}

/**
 * OpenAI API 呼び出し / OpenAI API call
 */
export async function callOpenAI(
  settings: AISettings,
  request: AIServiceRequest,
  callbacks: AIServiceCallbacks,
  abortSignal?: AbortSignal,
): Promise<void> {
  const client = new OpenAI({
    apiKey: settings.apiKey,
    dangerouslyAllowBrowser: true,
  });
  if (request.options?.stream) {
    await callOpenAIStream(client, request, callbacks, abortSignal);
  } else {
    await callOpenAINonStream(client, request, callbacks, abortSignal);
  }
}

// ---------------------------------------------------------------------------
// Anthropic
// ---------------------------------------------------------------------------

/**
 * Anthropic API 呼び出し / Anthropic API call
 */
export async function callAnthropic(
  settings: AISettings,
  request: AIServiceRequest,
  callbacks: AIServiceCallbacks,
  abortSignal?: AbortSignal,
): Promise<void> {
  const client = new Anthropic({
    apiKey: settings.apiKey,
  });

  const isClaudeWebSearchSupported = (model: string): boolean => {
    const supportedPatterns = [
      "claude-opus-4",
      "claude-sonnet-4",
      "claude-sonnet-3.7",
      "claude-3-5-sonnet",
      "claude-haiku-3.5",
      "claude-3-5-haiku",
    ];
    return supportedPatterns.some((pattern) => model.toLowerCase().includes(pattern.toLowerCase()));
  };

  const useWebSearch = request.options?.useWebSearch ?? isClaudeWebSearchSupported(request.model);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const requestParams: any = {
    model: request.model,
    max_tokens: request.options?.maxTokens ?? 4000,
    messages: request.messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
    })),
  };

  if (useWebSearch) {
    requestParams.tools = [
      {
        type: "web_search_20250305",
        name: "web_search",
        max_uses: 5,
      },
    ];
  }

  if (request.options?.stream) {
    const stream = client.messages.stream(requestParams, { signal: abortSignal });

    let fullContent = "";

    for await (const event of stream) {
      if (abortSignal?.aborted) {
        throw new Error("ABORTED");
      }

      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        const content = event.delta.text;
        fullContent += content;
        callbacks.onChunk?.(content);
      }
    }

    callbacks.onComplete?.({
      content: fullContent,
      finishReason: "stop",
    });
  } else {
    const response = await client.messages.create(requestParams, {
      signal: abortSignal,
    });

    const textBlock = response.content.find((block) => block.type === "text");
    const content = textBlock && textBlock.type === "text" ? textBlock.text : "";

    callbacks.onComplete?.({
      content,
      finishReason: response.stop_reason,
    });
  }
}

// ---------------------------------------------------------------------------
// Google
// ---------------------------------------------------------------------------

/**
 * Google AI API 呼び出し / Google AI API call
 */
export async function callGoogle(
  settings: AISettings,
  request: AIServiceRequest,
  callbacks: AIServiceCallbacks,
  abortSignal?: AbortSignal,
): Promise<void> {
  const client = new GoogleGenAI({ apiKey: settings.apiKey });

  const useGoogleSearch = request.options?.useGoogleSearch ?? true;

  const tools = useGoogleSearch
    ? [
        {
          googleSearch: {},
        },
      ]
    : undefined;

  if (request.options?.stream) {
    const response = await client.models.generateContentStream({
      model: request.model,
      contents: request.messages.map((msg) => msg.content).join("\n\n"),
      config: {
        tools,
        maxOutputTokens: request.options?.maxTokens ?? 4000,
        temperature: request.options?.temperature ?? 0.7,
      },
    });

    let fullContent = "";

    for await (const chunk of response) {
      if (abortSignal?.aborted) {
        throw new Error("ABORTED");
      }

      const content = chunk.text;
      if (content) {
        fullContent += content;
        callbacks.onChunk?.(content);
      }
    }

    callbacks.onComplete?.({
      content: fullContent,
      finishReason: "stop",
    });
  } else {
    const response = await client.models.generateContent({
      model: request.model,
      contents: request.messages.map((msg) => msg.content).join("\n\n"),
      config: {
        tools,
        temperature: request.options?.temperature ?? 0.7,
      },
    });

    const content = response.text || "";
    callbacks.onComplete?.({
      content,
      finishReason: "stop",
    });
  }
}
