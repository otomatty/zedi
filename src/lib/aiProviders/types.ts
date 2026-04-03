/**
 * Unified AI provider runtime interface (Issue #457).
 * 統一 AI プロバイダーランタイムインターフェース（Issue #457）。
 *
 * Each concrete provider wraps either a direct-API SDK or the Claude Code sidecar.
 * 各具体プロバイダーは直接 API SDK または Claude Code sidecar をラップする。
 */

import type { AICapabilities, AIProviderType } from "@/types/ai";

/**
 * AI リクエスト。プロバイダーに送る問い合わせ。
 * AI request sent to a provider.
 */
export interface AIRequest {
  prompt: string;
  /** 使用するモデル名 / Model name to use */
  model: string;
  messages: Array<{ role: "user" | "assistant" | "system"; content: string }>;
  options?: {
    temperature?: number;
    maxTokens?: number;
    stream?: boolean;
    cwd?: string;
    maxTurns?: number;
    allowedTools?: string[];
  };
}

/**
 * ストリーミングで返されるチャンク。
 * A chunk yielded during streaming.
 */
export interface AIStreamChunk {
  type: "text" | "tool_use" | "error" | "done";
  content: string;
}

/**
 * 統一 AI プロバイダーインターフェース。
 * Unified AI provider interface (Issue #457).
 *
 * @remarks
 * `query()` returns an `AsyncIterable` for natural streaming consumption.
 * Existing callback-based flows can use {@link consumeProviderStream} adapter.
 */
export interface UnifiedAIProvider {
  /** プロバイダー ID / Provider identifier */
  readonly id: AIProviderType;
  /** 表示名 / Display name */
  readonly name: string;
  /** ケーパビリティ / Feature capabilities */
  readonly capabilities: AICapabilities;
  /**
   * ストリーミング問い合わせ。AsyncIterable でチャンクを返す。
   * Streaming query. Yields chunks via AsyncIterable.
   */
  query(request: AIRequest, signal?: AbortSignal): AsyncIterable<AIStreamChunk>;
  /**
   * 実行中のクエリを中断する。
   * Abort any running query.
   */
  abort(): void;
  /**
   * このプロバイダーが現在の環境で利用可能か判定する。
   * Whether this provider is available in the current environment.
   */
  isAvailable(): Promise<boolean>;
}

/**
 * プロバイダーの利用可能性の詳細。
 * Detailed availability status for a provider.
 */
export interface ProviderAvailability {
  providerId: AIProviderType;
  available: boolean;
  /** 利用不可の理由（未インストール、Web環境、APIキー未設定など） / Reason if unavailable */
  reason?: string;
}
