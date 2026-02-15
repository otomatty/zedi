// 一般設定を管理するカスタムフック

import { useState, useEffect, useCallback } from "react";
import { useTheme } from "next-themes";
import {
  GeneralSettings,
  DEFAULT_GENERAL_SETTINGS,
  EditorFontSize,
  ThemeMode,
  UILocale,
  FONT_SIZE_OPTIONS,
} from "@/types/generalSettings";
import {
  loadGeneralSettings,
  saveGeneralSettings,
} from "@/lib/generalSettings";
import { useTranslation } from "react-i18next";

interface UseGeneralSettingsReturn {
  settings: GeneralSettings;
  isLoading: boolean;
  isSaving: boolean;
  updateTheme: (theme: ThemeMode) => void;
  updateEditorFontSize: (fontSize: EditorFontSize) => void;
  updateLocale: (locale: UILocale) => void;
  save: () => Promise<boolean>;
  /** エディタ用のフォントサイズ px 値 */
  editorFontSizePx: number;
}

export function useGeneralSettings(): UseGeneralSettingsReturn {
  const [settings, setSettings] = useState<GeneralSettings>(
    () => loadGeneralSettings()
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const { setTheme } = useTheme();
  const { i18n } = useTranslation();

  // 初期読み込み時にテーマと言語を同期
  useEffect(() => {
    const loaded = loadGeneralSettings();
    setSettings(loaded);
    setTheme(loaded.theme);
    i18n.changeLanguage(loaded.locale);
    setIsLoading(false);
  }, [setTheme, i18n]);

  const updateTheme = useCallback(
    (theme: ThemeMode) => {
      setSettings((prev) => ({ ...prev, theme }));
      setTheme(theme);
    },
    [setTheme],
  );

  const updateEditorFontSize = useCallback((fontSize: EditorFontSize) => {
    setSettings((prev) => ({ ...prev, editorFontSize: fontSize }));
  }, []);

  const updateLocale = useCallback(
    (locale: UILocale) => {
      setSettings((prev) => ({ ...prev, locale }));
      i18n.changeLanguage(locale);
    },
    [i18n],
  );

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

  const editorFontSizePx =
    FONT_SIZE_OPTIONS.find((o) => o.value === settings.editorFontSize)?.px ?? 14;

  return {
    settings,
    isLoading,
    isSaving,
    updateTheme,
    updateEditorFontSize,
    updateLocale,
    save,
    editorFontSizePx,
  };
}
