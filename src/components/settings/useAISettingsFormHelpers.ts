/**
 * Helper hooks extracted from useAISettingsForm to respect max-lines-per-function.
 * useAISettingsForm から分離したヘルパーフック。
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { toast as sonnerToast } from "@zedi/ui/components/sonner";
import { isTauriDesktop } from "@/lib/platform";
import { fetchServerModels, FetchServerModelsError } from "@/lib/aiService";
import type { AIModel } from "@/types/ai";

const SAVED_INDICATOR_MS = 3000;

/**
 * Manages the "saved" indicator state with an auto-dismiss timer.
 * 保存インジケーターの状態とタイマーを管理する。
 */
export function useSavedIndicator() {
  const { t } = useTranslation();
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    },
    [],
  );

  const clear = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setSavedAt(null);
  }, []);

  const markSaved = useCallback(
    (success: boolean) => {
      if (success) {
        setSavedAt(Date.now());
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => {
          setSavedAt(null);
          timeoutRef.current = null;
        }, SAVED_INDICATOR_MS);
      } else {
        sonnerToast.error(t("common.error"), {
          description: t("aiSettings.saveFailedToastDescription"),
        });
      }
    },
    [t],
  );

  return { savedAt, clear, markSaved };
}

/**
 * Checks Claude Code availability once on mount (Tauri desktop only).
 * マウント時に Claude Code の利用可否を判定する（Tauri デスクトップのみ）。
 */
export function useClaudeCodeAvailability(): boolean | null {
  const [available, setAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    if (!isTauriDesktop()) {
      setAvailable(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { checkClaudeInstallation } = await import("@/lib/claudeCode/bridge");
        const result = await checkClaudeInstallation();
        if (!cancelled) setAvailable(result.installed);
      } catch {
        if (!cancelled) setAvailable(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return available;
}

/**
 * Loads server-provided AI models with caching and error handling.
 * サーバー提供の AI モデル一覧を取得する（キャッシュ・エラーハンドリング付き）。
 */
export function useServerModels() {
  const { t } = useTranslation();
  const [models, setModels] = useState<AIModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (forceRefresh = false) => {
      setError(null);
      setLoading(true);
      try {
        const { models: fetched } = await fetchServerModels(forceRefresh);
        setModels(fetched ?? []);
        if (!fetched?.length) {
          setError(t("aiSettings.modelsEmpty"));
        }
      } catch (e) {
        const message =
          e instanceof FetchServerModelsError
            ? e.message
            : e instanceof Error
              ? e.message
              : String(e);
        setError(message);
        setModels([]);
      } finally {
        setLoading(false);
      }
    },
    [t],
  );

  return { models, loading, error, load };
}
