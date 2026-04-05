import React from "react";
import { Play, Bot, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@zedi/ui";
import { RUNNABLE_LANGUAGES } from "./executableCodeBlockI18n";
import type { ExecutableRunStatus } from "../extensions/ExecutableCodeBlockExtension";

/**
 * Props for {@link ExecutableCodeBlockToolbar}.
 * {@link ExecutableCodeBlockToolbar} のプロパティ。
 */
export interface ExecutableCodeBlockToolbarProps {
  language: string;
  runStatus: ExecutableRunStatus;
  runDisabled: boolean;
  interpretDisabled: boolean;
  interpretLoading: boolean;
  onLanguageChange: (value: string) => void;
  onRunClick: () => void;
  onInterpretClick: () => void;
}

/**
 * Language selector and Run / Interpret actions for executable code blocks.
 * 実行可能コードブロックの言語選択と実行・解説アクション。
 */
export function ExecutableCodeBlockToolbar({
  language,
  runStatus,
  runDisabled,
  interpretDisabled,
  interpretLoading,
  onLanguageChange,
  onRunClick,
  onInterpretClick,
}: ExecutableCodeBlockToolbarProps) {
  const { t } = useTranslation();

  return (
    <div className="border-border flex flex-wrap items-center gap-2 border-b px-2 py-1.5">
      <label className="text-muted-foreground flex items-center gap-1 text-xs">
        <span className="sr-only">{t("editor.executableCode.language")}</span>
        <select
          className="border-border bg-background max-w-[9rem] rounded border px-1.5 py-1 text-xs"
          value={language}
          onChange={(e) => onLanguageChange(e.target.value)}
          contentEditable={false}
        >
          {RUNNABLE_LANGUAGES.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {t(`editor.executableCode.lang.${opt.labelKey}`)}
            </option>
          ))}
        </select>
      </label>
      <div className="ml-auto flex items-center gap-1">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="h-7 gap-1 px-2 text-xs"
          contentEditable={false}
          disabled={runDisabled}
          onClick={onRunClick}
          aria-label={t("editor.executableCode.run")}
        >
          {runStatus === "running" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Play className="h-3.5 w-3.5" />
          )}
          {t("editor.executableCode.run")}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 gap-1 px-2 text-xs"
          contentEditable={false}
          disabled={interpretDisabled}
          onClick={() => void onInterpretClick()}
          aria-label={t("editor.executableCode.interpret")}
        >
          {interpretLoading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Bot className="h-3.5 w-3.5" />
          )}
          {t("editor.executableCode.interpret")}
        </Button>
      </div>
    </div>
  );
}
