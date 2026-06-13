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
 * Backends accepted by Wiki Compose while the graph pins LLM calls to a Google model (#990).
 * Wiki Compose が Google 固定モデル運用中に受け付ける backend。
 */
export function isWikiComposeAllowedBackend(backend: ComposeExecutionBackend): boolean {
  return backend === "zedi_managed" || backend === "user_google";
}

/**
 * Map a settings-derived backend to one the Wiki Compose API accepts.
 * 設定由来の backend を Wiki Compose API が受け付ける値に矯正する。
 */
export function coerceWikiComposeBackend(
  preferred: ComposeExecutionBackend,
  credentials: UserAiCredentialsStatus,
): ComposeExecutionBackend {
  if (isWikiComposeAllowedBackend(preferred) && isComposeBackendAvailable(preferred, credentials)) {
    return preferred;
  }
  if (isComposeBackendAvailable("user_google", credentials)) {
    return "user_google";
  }
  return "zedi_managed";
}

/**
 * Resolve compose backend from AI settings, falling back when BYOK is unavailable
 * or incompatible with the fixed Google Wiki Compose model (#990).
 * AI 設定から backend を決め、BYOK 不可・非 Google BYOK は zedi_managed / user_google に落とす。
 */
export function resolveComposeBackendFromAiSettings(
  settings: AISettings,
  credentials: UserAiCredentialsStatus,
): ComposeExecutionBackend {
  const preferred = resolvePreferredComposeBackend(settings);
  return coerceWikiComposeBackend(preferred, credentials);
}
