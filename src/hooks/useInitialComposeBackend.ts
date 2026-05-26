/**
 * Initializes Wiki Compose backend from AI settings (#951).
 * Wiki Compose の backend を設定画面の AI 設定から初期化する。
 */
import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { loadAISettings, AI_SETTINGS_CHANGED_EVENT } from "@/lib/aiSettings";
import { fetchUserAiCredentialsStatus } from "@/lib/userAiCredentials";
import { resolveComposeBackendFromAiSettings } from "@/lib/wikiCompose/resolveComposeBackend";
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
  return resolveComposeBackendFromAiSettings(settings, credentials);
}

export interface UseInitialComposeBackendOptions {
  /** When false, skips loading (e.g. session already started). */
  enabled?: boolean;
}

export interface UseInitialComposeBackendResult {
  backend: ComposeExecutionBackend;
  setBackend: Dispatch<SetStateAction<ComposeExecutionBackend>>;
  /** False until the first settings-based resolution finishes (when `enabled`). */
  isResolved: boolean;
}

/**
 * Returns backend state synced from AI settings until the user changes it or `enabled` is false.
 * AI 設定と同期した backend。ユーザーが変更するか `enabled` が false になるまで追従する。
 */
export function useInitialComposeBackend(
  options: UseInitialComposeBackendOptions = {},
): UseInitialComposeBackendResult {
  const { enabled = true } = options;
  const [backend, setBackend] = useState<ComposeExecutionBackend>("zedi_managed");
  const [userOverrode, setUserOverrode] = useState(false);
  const [settingsSynced, setSettingsSynced] = useState(!enabled);

  const isResolved = !enabled || userOverrode || settingsSynced;

  useEffect(() => {
    if (!enabled || userOverrode) return;

    let cancelled = false;
    void loadComposeBackendFromSettings().then((resolved) => {
      if (!cancelled) {
        setBackend(resolved);
        setSettingsSynced(true);
      }
    });

    const onSettingsChanged = () => {
      if (userOverrode) return;
      void loadComposeBackendFromSettings().then((resolved) => {
        if (!cancelled) setBackend(resolved);
      });
    };

    window.addEventListener(AI_SETTINGS_CHANGED_EVENT, onSettingsChanged);
    return () => {
      cancelled = true;
      window.removeEventListener(AI_SETTINGS_CHANGED_EVENT, onSettingsChanged);
    };
  }, [enabled, userOverrode]);

  const setBackendWithOverride: Dispatch<SetStateAction<ComposeExecutionBackend>> = (value) => {
    setUserOverrode(true);
    setSettingsSynced(true);
    setBackend(value);
  };

  return { backend, setBackend: setBackendWithOverride, isResolved };
}
