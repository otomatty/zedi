/**
 * AI サービス抽象化レイヤー。モードに応じて適切な方法で API を呼び出す。
 * AI service abstraction layer. Dispatches API calls based on mode.
 */

import {
  type AISettings,
  type APIMode,
  type AIProviderType,
  type AIResponseUsage,
  isAPIProvider,
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
    /** Claude Code sidecar cwd (note-linked workspace, desktop only). */
    cwd?: string;
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
  /**
   * ツール実行開始時のコールバック（Claude Code のみ）。
   * Callback when a tool starts executing (Claude Code only).
   */
  onToolUseStart?: (toolName: string) => void;
  /**
   * ツール実行完了時のコールバック（Claude Code のみ）。
   * Callback when a tool finishes executing (Claude Code only).
   */
  onToolUseComplete?: (toolName: string) => void;
}

/**
 * 有効な API モードを取得（後方互換性対応）。
 * Returns the effective API mode, with backward compatibility.
 */
export function getEffectiveAPIMode(settings: AISettings): APIMode {
  if (!settings.apiMode) {
    return settings.apiKey.trim() !== "" ? "user_api_key" : "api_server";
  }
  return settings.apiMode;
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
  if (settings.provider === "claude-code") {
    return await callAIWithClaudeCode(settings, request, callbacks, abortSignal);
  }

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
  if (!isAPIProvider(settings.provider)) {
    callbacks.onError?.(new Error(`${settings.provider} は直接 API プロバイダーではありません`));
    return;
  }
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
    callbacks.onError?.(error instanceof Error ? error : new Error("AI API呼び出しエラー"));
  }
}

/**
 * Claude Code sidecar 経由で呼び出し (Issue #457)。
 * 統一プロバイダーの AsyncIterable をコールバックに変換する。
 *
 * Calls the Claude Code sidecar via the unified provider interface.
 * Adapts AsyncIterable to the existing callback pattern.
 */
async function callAIWithClaudeCode(
  _settings: AISettings,
  request: AIServiceRequest,
  callbacks: AIServiceCallbacks,
  abortSignal?: AbortSignal,
): Promise<void> {
  try {
    const { createClaudeCodeProvider } = await import("@/lib/aiProviders/claudeCodeProvider");
    const provider = createClaudeCodeProvider();

    const available = await provider.isAvailable();
    if (!available) {
      throw new Error(
        "Claude Code が利用できません。デスクトップアプリで Claude Code がインストールされていることを確認してください。",
      );
    }

    let fullContent = "";
    for await (const chunk of provider.query(
      {
        prompt: request.messages.map((m) => m.content).join("\n\n"),
        model: request.model,
        messages: request.messages,
        options: {
          maxTokens: request.options?.maxTokens,
          temperature: request.options?.temperature,
          stream: request.options?.stream,
          cwd: request.options?.cwd,
        },
      },
      abortSignal,
    )) {
      if (abortSignal?.aborted) throw new Error("ABORTED");

      switch (chunk.type) {
        case "text":
          fullContent += chunk.content;
          callbacks.onChunk?.(chunk.content);
          break;
        case "tool_use_start":
          callbacks.onToolUseStart?.(chunk.toolName ?? "unknown");
          break;
        case "tool_use_complete":
          callbacks.onToolUseComplete?.(chunk.toolName ?? "unknown");
          break;
        case "error":
          throw new Error(chunk.content);
        case "done":
          callbacks.onComplete?.({ content: fullContent, finishReason: "stop" });
          return;
      }
    }

    callbacks.onComplete?.({ content: fullContent, finishReason: fullContent ? "stop" : "abort" });
  } catch (error) {
    callbacks.onError?.(error instanceof Error ? error : new Error("Claude Code 呼び出しエラー"));
  }
}

// Re-export from sub-modules for backward compatibility
// サブモジュールからの再エクスポート（後方互換性）
export { FetchServerModelsError, fetchServerModels, fetchUsage } from "./aiServiceModels";
