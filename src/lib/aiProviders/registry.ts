/**
 * AI provider registry (Issue #457).
 * AI プロバイダーレジストリ（Issue #457）。
 *
 * Manages provider instances and availability checking.
 * プロバイダーインスタンスの管理と利用可否の判定を行う。
 */

import { AI_PROVIDERS, type AIProviderType, type AISettings, isAPIProvider } from "@/types/ai";
import { isTauriDesktop } from "@/lib/platform";
import type { ProviderAvailability, UnifiedAIProvider } from "./types";
import { createOpenAIProvider } from "./openaiProvider";
import { createAnthropicProvider } from "./anthropicProvider";
import { createGoogleProvider } from "./googleProvider";
import { createClaudeCodeProvider } from "./claudeCodeProvider";

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
    case "claude-code":
      return createClaudeCodeProvider();
    default: {
      const _exhaustive: never = settings.provider;
      throw new Error(`Unknown provider: ${_exhaustive}`);
    }
  }
}

/**
 * 現在の環境で表示可能なプロバイダー一覧を返す。
 * Web 環境では desktopOnly プロバイダーを除外する。
 * Returns the list of providers visible in the current environment.
 * Excludes desktopOnly providers when not in a Tauri desktop.
 */
export function getVisibleProviders(): typeof AI_PROVIDERS {
  const isDesktop = isTauriDesktop();
  return AI_PROVIDERS.filter((p) => !p.desktopOnly || isDesktop);
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

  for (const providerMeta of visible) {
    let available: boolean;

    if (isAPIProvider(providerMeta.id)) {
      available = providerMeta.requiresApiKey ? !!settings.apiKey?.trim() : true;
    } else {
      const providerSettings: AISettings = { ...settings, provider: providerMeta.id };
      const instance = createProvider(providerSettings);
      available = await instance.isAvailable();
    }

    let reason: string | undefined;
    if (!available) {
      if (providerMeta.desktopOnly && !isTauriDesktop()) {
        reason = "デスクトップアプリでのみ利用可能 / Desktop app only";
      } else if (
        isAPIProvider(providerMeta.id) &&
        providerMeta.requiresApiKey &&
        !settings.apiKey
      ) {
        reason = "API キーが未設定 / API key not configured";
      } else if (providerMeta.id === "claude-code") {
        reason = "Claude Code がインストールされていません / Claude Code not installed";
      }
    }

    results.push({ providerId: providerMeta.id, available, reason });
  }

  return results;
}

/**
 * 特定のプロバイダーの利用可否を判定する。
 * Checks if a specific provider is available.
 */
export async function isProviderAvailable(
  providerId: AIProviderType,
  settings: AISettings,
): Promise<boolean> {
  const providerSettings: AISettings = { ...settings, provider: providerId };
  const instance = createProvider(providerSettings);
  return instance.isAvailable();
}
