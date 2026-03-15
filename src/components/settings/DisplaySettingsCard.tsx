import React from "react";
import { Compass } from "lucide-react";
import { Button } from "@zedi/ui";
import { Input } from "@zedi/ui";
import { Label } from "@zedi/ui";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@zedi/ui";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@zedi/ui";
import { useTranslation } from "react-i18next";
import {
  THEME_OPTIONS,
  FONT_SIZE_OPTIONS,
  type ThemeMode,
  type EditorFontSize,
} from "@/types/generalSettings";

/**
 * Props for DisplaySettingsCard. 表示設定カードのプロパティ。
 */
export interface DisplaySettingsCardProps {
  theme: ThemeMode;
  editorFontSize: EditorFontSize;
  customFontSizePx?: number;
  editorFontSizePx: number;
  updateTheme: (v: ThemeMode) => void;
  updateEditorFontSize: (v: EditorFontSize) => void;
  updateCustomFontSizePx: (px: number) => void;
  onRunTourAgain: () => void;
}

/**
 * Display and Tour cards for General settings (theme, font size, quick tour).
 * 一般設定の表示・ツアーカード
 */
export function DisplaySettingsCard({
  theme,
  editorFontSize,
  customFontSizePx,
  editorFontSizePx,
  updateTheme,
  updateEditorFontSize,
  updateCustomFontSizePx,
  onRunTourAgain,
}: DisplaySettingsCardProps) {
  const { t } = useTranslation();
  const customPxInput = editorFontSize === "custom" ? (customFontSizePx ?? 16) : 16;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{t("generalSettings.display.title")}</CardTitle>
          <CardDescription>{t("generalSettings.display.description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="theme">{t("generalSettings.theme.label")}</Label>
            <Select value={theme} onValueChange={(v) => updateTheme(v as ThemeMode)}>
              <SelectTrigger id="theme" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {THEME_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {t(`generalSettings.theme.${opt.value}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="fontSize">{t("generalSettings.fontSize.label")}</Label>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
              <div className="flex flex-col gap-2 sm:min-w-[140px]">
                <Select
                  value={editorFontSize}
                  onValueChange={(v) => updateEditorFontSize(v as EditorFontSize)}
                >
                  <SelectTrigger id="fontSize" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FONT_SIZE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {t(`generalSettings.fontSize.${opt.value}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {editorFontSize === "custom" && (
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={12}
                      max={24}
                      value={customPxInput}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (value === "") return;
                        const n = Number(value);
                        if (Number.isNaN(n)) return;
                        const clamped = Math.min(24, Math.max(12, Math.round(n)));
                        updateCustomFontSizePx(clamped);
                      }}
                      className="h-9 w-20"
                    />
                    <span className="text-sm text-muted-foreground">
                      {t("generalSettings.fontSize.customPx")}
                    </span>
                  </div>
                )}
              </div>
              <div
                className="flex min-h-[52px] flex-1 items-center rounded-md border border-border bg-muted/30 px-3 py-2"
                style={{ fontSize: editorFontSizePx }}
              >
                <span className="text-muted-foreground">
                  {t("generalSettings.fontSize.preview")}: {t("generalSettings.fontSize.sample")}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Compass className="h-5 w-5" />
            {t("generalSettings.tour.title")}
          </CardTitle>
          <CardDescription>{t("generalSettings.tour.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={onRunTourAgain}>
            {t("generalSettings.tour.runAgain")}
          </Button>
        </CardContent>
      </Card>
    </>
  );
}
