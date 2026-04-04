// 一般設定を管理するカスタムフック

import { useState, useEffect, useCallback } from "react";
import { useTheme } from "next-themes";
import {
  GeneralSettings,
  EditorFontSize,
  ThemeMode,
  UILocale,
  FONT_SIZE_OPTIONS,
} from "@/types/generalSettings";
import { loadGeneralSettings, saveGeneralSettings } from "@/lib/generalSettings";
import { useTranslation } from "react-i18next";

interface UseGeneralSettingsReturn {
  settings: GeneralSettings;
  isLoading: boolean;
  isSaving: boolean;
  updateTheme: (theme: ThemeMode) => void;
  updateEditorFontSize: (fontSize: EditorFontSize) => void;
  updateCustomFontSizePx: (px: number) => void;
  updateLocale: (locale: UILocale) => void;
  /** Toggle confirmation before running executable code blocks (Claude Code). */
  updateExecutableCodeConfirmBeforeRun: (value: boolean) => void;
  save: () => Promise<boolean>;
  /** エディタ用のフォントサイズ px 値 */
  editorFontSizePx: number;
}

/**
 *
 */
export function useGeneralSettings(): UseGeneralSettingsReturn {
  /**
   *
   */
  const [settings, setSettings] = useState<GeneralSettings>(() => loadGeneralSettings());
  /**
   *
   */
  const [isLoading, setIsLoading] = useState(true);
  /**
   *
   */
  const [isSaving, setIsSaving] = useState(false);
  /**
   *
   */
  const { setTheme } = useTheme();
  /**
   *
   */
  const { i18n } = useTranslation();

  // 初期読み込み時にテーマと言語を同期
  useEffect(() => {
    /**
     *
     */
    const loaded = loadGeneralSettings();
    setSettings(loaded);
    setTheme(loaded.theme);
    i18n.changeLanguage(loaded.locale);
    setIsLoading(false);
  }, [setTheme, i18n]);

  /**
   *
   */
  const updateTheme = useCallback(
    (theme: ThemeMode) => {
      setSettings((prev) => {
        /**
         *
         */
        const next = { ...prev, theme };
        saveGeneralSettings(next);
        return next;
      });
      setTheme(theme);
    },
    [setTheme],
  );

  /**
   *
   */
  const updateEditorFontSize = useCallback((fontSize: EditorFontSize) => {
    setSettings((prev) => {
      /**
       *
       */
      const next = { ...prev, editorFontSize: fontSize };
      saveGeneralSettings(next);
      return next;
    });
  }, []);

  /**
   *
   */
  const updateCustomFontSizePx = useCallback((px: number) => {
    /**
     *
     */
    const clamped = Math.min(24, Math.max(12, px));
    setSettings((prev) => {
      /**
       *
       */
      const next = { ...prev, customFontSizePx: clamped };
      saveGeneralSettings(next);
      return next;
    });
  }, []);

  /**
   *
   */
  const updateLocale = useCallback(
    (locale: UILocale) => {
      setSettings((prev) => {
        /**
         *
         */
        const next = { ...prev, locale };
        saveGeneralSettings(next);
        return next;
      });
      i18n.changeLanguage(locale);
    },
    [i18n],
  );

  /**
   *
   */
  const updateExecutableCodeConfirmBeforeRun = useCallback((value: boolean) => {
    setSettings((prev) => {
      /**
       *
       */
      const next = { ...prev, executableCodeConfirmBeforeRun: value };
      saveGeneralSettings(next);
      return next;
    });
  }, []);

  /**
   *
   */
  const save = useCallback(async (): Promise<boolean> => {
    setIsSaving(true);
    try {
      saveGeneralSettings(settings);
      return true;
    } catch (error) {
      console.error("Failed to save general settings:", error);
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [settings]);

  /**
   *
   */
  const resolvedPx =
    settings.editorFontSize === "custom"
      ? (settings.customFontSizePx ?? 16)
      : (FONT_SIZE_OPTIONS.find((o) => o.value === settings.editorFontSize)?.px ?? 16);
  /**
   *
   */
  const editorFontSizePx = typeof resolvedPx === "number" ? resolvedPx : 16;

  return {
    settings,
    isLoading,
    isSaving,
    updateTheme,
    updateEditorFontSize,
    updateCustomFontSizePx,
    updateLocale,
    updateExecutableCodeConfirmBeforeRun,
    save,
    editorFontSizePx,
  };
}
