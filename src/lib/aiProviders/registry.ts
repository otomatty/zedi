/**
 * AI provider registry (Issue #457).
 * AI プロバイダーレジストリ（Issue #457）。
 *
 * Manages provider instances and availability checking.
 * プロバイダーインスタンスの管理と利用可否の判定を行う。
 */

import { AI_PROVIDERS, type AISettings } from "@/types/ai";
import type { ProviderAvailability, UnifiedAIProvider } from "./types";
import { createOpenAIProvider } from "./openaiProvider";
import { createAnthropicProvider } from "./anthropicProvider";
import { createGoogleProvider } from "./googleProvider";

/**
 * 設定に基づいてプロバイダーインスタンスを生成する。
 * Creates a provider instance based on settings.
 */
export function createProvider(settings: AISettings): UnifiedAIProvider {
  switch (settings.provider) {
    case "openai":
      return createOpenAIProvider(settings.apiKey);
    case "anthropic":
      return createAnthropicProvider(settings.apiKey);
    case "google":
      return createGoogleProvider(settings.apiKey);
    default: {
      const _exhaustive: never = settings.provider;
      throw new Error(`Unknown provider: ${_exhaustive}`);
    }
  }
}

/**
 * 設定画面に表示するプロバイダー一覧を返す。
 * Returns the providers shown in settings.
 */
export function getVisibleProviders(): typeof AI_PROVIDERS {
  return AI_PROVIDERS;
}

/**
 * 全プロバイダーの利用可否を一括判定する。
 * Checks availability of all visible providers at once.
 */
export async function checkAllProviderAvailability(
  settings: AISettings,
): Promise<ProviderAvailability[]> {
  const visible = getVisibleProviders();
  const results: ProviderAvailability[] = [];

  const isServerMode = settings.apiMode === "api_server";

  for (const providerMeta of visible) {
    const available = isServerMode || !providerMeta.requiresApiKey || !!settings.apiKey?.trim();
    const reason = available ? undefined : "API キーが未設定 / API key not configured";
    results.push({ providerId: providerMeta.id, available, reason });
  }

  return results;
}
