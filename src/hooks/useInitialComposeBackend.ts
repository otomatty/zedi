/**
 * Initializes Wiki Compose backend from AI settings (#951).
 * Wiki Compose の backend を設定画面の AI 設定から初期化する。
 */
import { useEffect, useState } from "react";
import { loadAISettings, AI_SETTINGS_CHANGED_EVENT } from "@/lib/aiSettings";
import { fetchUserAiCredentialsStatus } from "@/lib/userAiCredentials";
import { resolveWikiComposeBackendFromAiSettings } from "@/lib/wikiCompose/resolveComposeBackend";
import type { ComposeExecutionBackend } from "@/lib/wikiCompose/backends";
import { DEFAULT_AI_SETTINGS } from "@/types/ai";

const EMPTY_CREDENTIALS = {
  storageEnabled: false,
  providers: [
    { provider: "anthropic" as const, configured: false },
    { provider: "openai" as const, configured: false },
    { provider: "google" as const, configured: false },
  ],
};

/**
 * Load compose backend from persisted AI settings and BYOK credential status.
 * 永続化された AI 設定と BYOK credential 状態から compose backend を読み込む。
 */
async function loadComposeBackendFromSettings(): Promise<ComposeExecutionBackend> {
  const settings = (await loadAISettings()) ?? DEFAULT_AI_SETTINGS;
  const credentials = await fetchUserAiCredentialsStatus().catch(() => EMPTY_CREDENTIALS);
  return resolveWikiComposeBackendFromAiSettings(settings, credentials);
}

export interface UseInitialComposeBackendOptions {
  /** When false, skips loading (e.g. session already started). */
  enabled?: boolean;
}

export interface UseInitialComposeBackendResult {
  backend: ComposeExecutionBackend;
  /** False until the first settings-based resolution finishes (when `enabled`). */
  isResolved: boolean;
}

/**
 * Returns backend state synced from AI settings while `enabled` is true.
 * `enabled` が true の間、AI 設定と同期した backend を返す。
 */
export function useInitialComposeBackend(
  options: UseInitialComposeBackendOptions = {},
): UseInitialComposeBackendResult {
  const { enabled = true } = options;
  const [backend, setBackend] = useState<ComposeExecutionBackend>("zedi_managed");
  const [isResolved, setIsResolved] = useState(!enabled);

  useEffect(() => {
    if (!enabled) {
      setIsResolved(true);
      return;
    }

    let cancelled = false;
    let loadGeneration = 0;

    const applyFromSettings = () => {
      const generation = ++loadGeneration;
      void loadComposeBackendFromSettings().then((resolved) => {
        if (cancelled || generation !== loadGeneration) return;
        setBackend(resolved);
        setIsResolved(true);
      });
    };

    setIsResolved(false);
    applyFromSettings();

    const onSettingsChanged = () => {
      applyFromSettings();
    };

    window.addEventListener(AI_SETTINGS_CHANGED_EVENT, onSettingsChanged);
    return () => {
      cancelled = true;
      loadGeneration += 1;
      window.removeEventListener(AI_SETTINGS_CHANGED_EVENT, onSettingsChanged);
    };
  }, [enabled]);

  return { backend, isResolved };
}
