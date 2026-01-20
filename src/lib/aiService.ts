// AIサービス抽象化レイヤー
// モードに応じて適切な方法でAPIを呼び出す

import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import { AISettings, AIProviderType, APIMode } from "@/types/ai";
import { createAIClient, OllamaClient } from "./aiClient";

export interface AIServiceRequest {
  provider: AIProviderType;
  model: string;
  messages: Array<{ role: "user" | "assistant" | "system"; content: string }>;
  options?: {
    temperature?: number;
    maxTokens?: number;
    stream?: boolean;
    // OpenAI固有のオプション
    webSearchOptions?: { search_context_size: "medium" | "low" | "high" };
    // Anthropic固有のオプション
    useWebSearch?: boolean;
    // Google固有のオプション
    useGoogleSearch?: boolean;
  };
}

export interface AIServiceResponse {
  content: string;
  finishReason?: string;
}

export interface AIServiceCallbacks {
  onChunk?: (chunk: string) => void;
  onComplete?: (response: AIServiceResponse) => void;
  onError?: (error: Error) => void;
}

/**
 * 有効なAPIモードを取得（後方互換性対応）
 */
export function getEffectiveAPIMode(settings: AISettings): APIMode {
  // 既存の設定にapiModeがない場合の後方互換性
  if (!settings.apiMode) {
    // apiKeyが設定されている場合はuser_api_key、そうでなければapi_server
    return settings.apiKey.trim() !== "" ? "user_api_key" : "api_server";
  }
  return settings.apiMode;
}

/**
 * ユーザーAPIキーを使用するかどうかを判定
 */
export function shouldUseUserAPIKey(settings: AISettings): boolean {
  return getEffectiveAPIMode(settings) === "user_api_key";
}

/**
 * ストリーミング対応のAIサービス呼び出し
 */
export async function callAIService(
  settings: AISettings,
  request: AIServiceRequest,
  callbacks: AIServiceCallbacks,
  abortSignal?: AbortSignal
): Promise<void> {
  const apiMode = getEffectiveAPIMode(settings);

  if (apiMode === "user_api_key") {
    // 既存の実装を使用（直接API呼び出し）
    return await callAIWithUserKey(settings, request, callbacks, abortSignal);
  } else {
    // APIサーバー経由（Phase 2で実装）
    throw new Error(
      "APIサーバー経由モードはまだ実装されていません。Phase 2で実装予定です。"
    );
  }
}

/**
 * ユーザーAPIキーで直接呼び出し
 */
async function callAIWithUserKey(
  settings: AISettings,
  request: AIServiceRequest,
  callbacks: AIServiceCallbacks,
  abortSignal?: AbortSignal
): Promise<void> {
  try {
    switch (settings.provider) {
      case "openai":
        await callOpenAI(settings, request, callbacks, abortSignal);
        break;
      case "anthropic":
        await callAnthropic(settings, request, callbacks, abortSignal);
        break;
      case "google":
        await callGoogle(settings, request, callbacks, abortSignal);
        break;
      case "ollama":
        await callOllama(settings, request, callbacks, abortSignal);
        break;
      default:
        throw new Error(`Unknown provider: ${settings.provider}`);
    }
  } catch (error) {
    callbacks.onError?.(
      error instanceof Error ? error : new Error("AI API呼び出しエラー")
    );
  }
}

/**
 * OpenAI API呼び出し
 */
async function callOpenAI(
  settings: AISettings,
  request: AIServiceRequest,
  callbacks: AIServiceCallbacks,
  abortSignal?: AbortSignal
): Promise<void> {
  const client = new OpenAI({
    apiKey: settings.apiKey,
    dangerouslyAllowBrowser: true,
  });

  if (request.options?.stream) {
    // ストリーミング処理
    const stream = await client.chat.completions.create(
      {
        model: request.model,
        messages: request.messages.map((msg) => ({
          role: msg.role,
          content: msg.content,
        })),
        max_tokens: request.options.maxTokens ?? 4000,
        temperature: request.options.temperature ?? 0.7,
        stream: true,
        web_search_options: request.options.webSearchOptions,
      },
      { signal: abortSignal }
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
  } else {
    // 非ストリーミング処理
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
      { signal: abortSignal }
    );

    const content = response.choices[0]?.message?.content || "";
    callbacks.onComplete?.({
      content,
      finishReason: response.choices[0]?.finish_reason,
    });
  }
}

/**
 * Anthropic API呼び出し
 */
async function callAnthropic(
  settings: AISettings,
  request: AIServiceRequest,
  callbacks: AIServiceCallbacks,
  abortSignal?: AbortSignal
): Promise<void> {
  const client = new Anthropic({
    apiKey: settings.apiKey,
  });

  // Web検索をサポートするClaudeモデルかどうかを判定
  const isClaudeWebSearchSupported = (model: string): boolean => {
    const supportedPatterns = [
      "claude-opus-4",
      "claude-sonnet-4",
      "claude-sonnet-3.7",
      "claude-sonnet-3-5-sonnet",
      "claude-3-5-sonnet",
      "claude-haiku-3.5",
      "claude-3-5-haiku",
    ];
    return supportedPatterns.some((pattern) =>
      model.toLowerCase().includes(pattern.toLowerCase())
    );
  };

  const useWebSearch =
    request.options?.useWebSearch ?? isClaudeWebSearchSupported(request.model);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const requestParams: any = {
    model: request.model,
    max_tokens: request.options?.maxTokens ?? 4000,
    messages: request.messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
    })),
  };

  // Web検索対応モデルの場合、Web検索ツールを追加
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
    // ストリーミング処理
    const stream = client.messages.stream(requestParams, { signal: abortSignal });

    let fullContent = "";

    for await (const event of stream) {
      if (abortSignal?.aborted) {
        throw new Error("ABORTED");
      }

      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
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
    // 非ストリーミング処理
    const response = await client.messages.create(requestParams, {
      signal: abortSignal,
    });

    const textBlock = response.content.find((block) => block.type === "text");
    const content =
      textBlock && textBlock.type === "text" ? textBlock.text : "";

    callbacks.onComplete?.({
      content,
      finishReason: response.stop_reason,
    });
  }
}

/**
 * Google AI API呼び出し
 */
async function callGoogle(
  settings: AISettings,
  request: AIServiceRequest,
  callbacks: AIServiceCallbacks,
  abortSignal?: AbortSignal
): Promise<void> {
  const client = new GoogleGenAI({ apiKey: settings.apiKey });

  const useGoogleSearch = request.options?.useGoogleSearch ?? true;

  // Google Search ツール（Gemini 2.0以降で推奨）
  const tools = useGoogleSearch
    ? [
        {
          googleSearch: {},
        },
      ]
    : undefined;

  if (request.options?.stream) {
    // ストリーミング処理
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
    // 非ストリーミング処理
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

/**
 * Ollama API呼び出し
 */
async function callOllama(
  settings: AISettings,
  request: AIServiceRequest,
  callbacks: AIServiceCallbacks,
  abortSignal?: AbortSignal
): Promise<void> {
  const client = new OllamaClient(settings.ollamaEndpoint);

  // Ollamaは常にストリーミング（stream: falseでも内部的にはストリーミング）
  const response = await client.chat(
    request.model,
    request.messages,
    {
      temperature: request.options?.temperature ?? 0.7,
      maxTokens: request.options?.maxTokens ?? 2048,
    }
  );

  // Ollamaは非ストリーミングAPIなので、一度に結果を返す
  callbacks.onComplete?.({
    content: response,
    finishReason: "stop",
  });
}
