import { Monitor, Moon, Palette, Sun, Type } from "lucide-react";
import { Input } from "@zedi/ui";
import { Label } from "@zedi/ui";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@zedi/ui";
import { cn } from "@zedi/ui";
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
}

/**
 * Display card for General settings (theme, font size).
 * 一般設定の表示カード（テーマ・フォントサイズ）。
 */
export function DisplaySettingsCard({
  theme,
  editorFontSize,
  customFontSizePx,
  editorFontSizePx,
  updateTheme,
  updateEditorFontSize,
  updateCustomFontSizePx,
}: DisplaySettingsCardProps) {
  const { t } = useTranslation();
  const customPxInput = editorFontSize === "custom" ? (customFontSizePx ?? 16) : 16;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Palette className="h-5 w-5" />
          {t("generalSettings.display.title")}
        </CardTitle>
        <CardDescription>{t("generalSettings.display.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-col items-start gap-2">
          <Label id="theme-label" className="block">
            {t("generalSettings.theme.label")}
          </Label>
          <div
            role="group"
            aria-labelledby="theme-label"
            className="bg-muted inline-flex w-fit gap-0.5 rounded-md p-0.5"
          >
            {THEME_OPTIONS.map((opt) => {
              const isSelected = theme === opt.value;
              const icon =
                opt.value === "system" ? (
                  <Monitor className="h-4 w-4" aria-hidden />
                ) : opt.value === "light" ? (
                  <Sun className="h-4 w-4" aria-hidden />
                ) : (
                  <Moon className="h-4 w-4" aria-hidden />
                );
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => updateTheme(opt.value)}
                  aria-pressed={isSelected}
                  className={cn(
                    "inline-flex items-center justify-center gap-2 rounded-sm px-3 py-2 text-sm font-medium transition-colors",
                    "focus-visible:ring-ring focus-visible:ring-offset-background focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
                    isSelected
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-background/50 hover:text-foreground",
                  )}
                >
                  {icon}
                  {t(`generalSettings.theme.${opt.value}`)}
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex flex-col items-start gap-3">
          <Label id="fontSize-label" className="block">
            {t("generalSettings.fontSize.label")}
          </Label>
          <div
            role="group"
            aria-labelledby="fontSize-label"
            className="bg-muted inline-flex w-fit flex-wrap gap-0.5 rounded-md p-0.5"
          >
            {FONT_SIZE_OPTIONS.map((opt) => {
              const isSelected = editorFontSize === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => updateEditorFontSize(opt.value)}
                  aria-pressed={isSelected}
                  className={cn(
                    "inline-flex items-center justify-center gap-1.5 rounded-sm px-2.5 py-2 text-sm font-medium transition-colors",
                    "focus-visible:ring-ring focus-visible:ring-offset-background focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
                    isSelected
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-background/50 hover:text-foreground",
                  )}
                >
                  <Type className="h-4 w-4 shrink-0" aria-hidden />
                  {t(`generalSettings.fontSize.${opt.value}`)}
                </button>
              );
            })}
          </div>
          {editorFontSize === "custom" && (
            <div className="flex items-center gap-2">
              <Label htmlFor="fontSize-custom-px" className="shrink-0 text-sm">
                {t("generalSettings.fontSize.customPx")}
              </Label>
              <Input
                id="fontSize-custom-px"
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
            </div>
          )}
          <div
            className="border-border bg-muted/30 rounded-md border px-3 py-3"
            style={{ fontSize: editorFontSizePx }}
          >
            <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              {t("generalSettings.fontSize.preview")}
            </p>
            <p className="text-foreground mt-1.5">{t("generalSettings.fontSize.previewText")}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
