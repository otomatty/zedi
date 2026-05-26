/**
 * Map persisted AI settings to Wiki Compose execution backends (#951).
 * 設定画面の AI 設定から Wiki Compose の backend を導出する。
 */
import type { AISettings } from "@/types/ai";
import { getInteractionMode, isAPIProvider } from "@/types/ai";
import type { ComposeExecutionBackend } from "./backends";
import type { UserAiCredentialProvider, UserAiCredentialsStatus } from "@/lib/userAiCredentials";

/** Map API provider id to BYOK compose backend. */
export function apiProviderToComposeBackend(
  provider: UserAiCredentialProvider,
): Exclude<ComposeExecutionBackend, "zedi_managed"> {
  switch (provider) {
    case "anthropic":
      return "user_anthropic";
    case "openai":
      return "user_openai";
    case "google":
      return "user_google";
  }
}

/**
 * Preferred backend from settings alone (no credential availability check).
 * 設定のみから見た希望 backend（credential 有無は未確認）。
 */
export function resolvePreferredComposeBackend(settings: AISettings): ComposeExecutionBackend {
  const mode = getInteractionMode(settings);
  if (mode === "user_api_key" && isAPIProvider(settings.provider)) {
    return apiProviderToComposeBackend(settings.provider);
  }
  return "zedi_managed";
}

/** Whether the backend can be selected in Compose UI. */
export function isComposeBackendAvailable(
  backend: ComposeExecutionBackend,
  credentials: UserAiCredentialsStatus,
): boolean {
  if (backend === "zedi_managed") return true;
  if (!credentials.storageEnabled) return false;
  const provider = backend.replace("user_", "") as UserAiCredentialProvider;
  return credentials.providers.some((p) => p.provider === provider && p.configured);
}

/**
 * Resolve compose backend from AI settings, falling back when BYOK is unavailable.
 * AI 設定から backend を決め、BYOK が使えない場合は zedi_managed にフォールバックする。
 */
export function resolveComposeBackendFromAiSettings(
  settings: AISettings,
  credentials: UserAiCredentialsStatus,
): ComposeExecutionBackend {
  const preferred = resolvePreferredComposeBackend(settings);
  if (isComposeBackendAvailable(preferred, credentials)) {
    return preferred;
  }
  return "zedi_managed";
}

/**
 * Wiki Compose backend: only `user_google` BYOK or `zedi_managed` match the pinned
 * Google compose model (`google:gemini-3.5-flash`). Other BYOK providers fall back.
 *
 * Wiki Compose は Google 固定モデルのため、Google BYOK か zedi_managed のみ使う。
 */
export function resolveWikiComposeBackendFromAiSettings(
  settings: AISettings,
  credentials: UserAiCredentialsStatus,
): ComposeExecutionBackend {
  const preferred = resolvePreferredComposeBackend(settings);
  if (preferred === "user_google" && isComposeBackendAvailable("user_google", credentials)) {
    return "user_google";
  }
  return "zedi_managed";
}
