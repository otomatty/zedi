/**
 * AI サービス抽象化レイヤー。モードに応じて適切な方法で API を呼び出す。
 * AI service abstraction layer. Dispatches API calls based on mode.
 */

import i18n from "@/i18n";
import {
  type AISettings,
  type APIMode,
  type AIProviderType,
  type AIResponseUsage,
} from "@/types/ai";
import { callOpenAI, callAnthropic, callGoogle } from "./aiServiceDirectProviders";
import { callAIWithServer } from "./aiServiceServer";

/**
 * `callAIService` へ渡すリクエスト本文。
 * Request body passed to `callAIService`.
 */
export interface AIServiceRequest {
  provider: AIProviderType;
  model: string;
  messages: Array<{ role: "user" | "assistant" | "system"; content: string }>;
  options?: {
    temperature?: number;
    maxTokens?: number;
    stream?: boolean;
    feature?: string; // "wiki_generation" | "mermaid_generation" | "chat"
    webSearchOptions?: { search_context_size: "medium" | "low" | "high" };
    useWebSearch?: boolean;
    useGoogleSearch?: boolean;
  };
}

/**
 * 非ストリーミング完了時のレスポンス。
 * Response for non-streaming completion.
 */
export interface AIServiceResponse {
  content: string;
  finishReason?: string;
  usage?: AIResponseUsage;
}

/**
 * ストリーミング／完了時のコールバック。
 * Callbacks for streaming and completion.
 */
export interface AIServiceCallbacks {
  onChunk?: (chunk: string) => void;
  onComplete?: (response: AIServiceResponse) => void;
  onError?: (error: Error) => void;
  onUsageUpdate?: (usage: AIResponseUsage) => void;
}

/**
 * 有効な API モードを取得（後方互換性対応）。
 * apiMode が未設定の場合は、apiKey の有無に関わらず api_server をデフォルトとする。
 *
 * Returns the effective API mode with backward compatibility.
 * When apiMode is unset, default to `api_server` regardless of whether an
 * apiKey is present — users who want their own key must opt in explicitly.
 */
export function getEffectiveAPIMode(settings: AISettings): APIMode {
  return settings.apiMode ?? "api_server";
}

/**
 * ユーザー API キーを使用するかどうかを判定。
 * Whether to use the user's own API key.
 */
export function shouldUseUserAPIKey(settings: AISettings): boolean {
  return getEffectiveAPIMode(settings) === "user_api_key";
}

/**
 * ストリーミング対応の AI サービス呼び出し。
 * Streaming-capable AI service call.
 */
export async function callAIService(
  settings: AISettings,
  request: AIServiceRequest,
  callbacks: AIServiceCallbacks,
  abortSignal?: AbortSignal,
): Promise<void> {
  const apiMode = getEffectiveAPIMode(settings);

  if (apiMode === "user_api_key") {
    return await callAIWithUserKey(settings, request, callbacks, abortSignal);
  }

  return await callAIWithServer(
    { ...request, model: settings.modelId ?? request.model },
    callbacks,
    abortSignal,
  );
}

/**
 * ユーザー API キーで直接呼び出し。
 * Direct call with user API key.
 */
async function callAIWithUserKey(
  settings: AISettings,
  request: AIServiceRequest,
  callbacks: AIServiceCallbacks,
  abortSignal?: AbortSignal,
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
      default: {
        const _exhaustive: never = settings.provider;
        throw new Error(`Unknown provider: ${_exhaustive}`);
      }
    }
  } catch (error) {
    callbacks.onError?.(
      error instanceof Error ? error : new Error(i18n.t("errors.aiApiCallError")),
    );
  }
}

// Re-export from sub-modules for backward compatibility
// サブモジュールからの再エクスポート（後方互換性）
export { FetchServerModelsError, fetchServerModels, fetchUsage } from "./aiServiceModels";
