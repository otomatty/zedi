/**
 * Workspace path completion list below the main slash menu.
 * メインスラッシュメニュー下のワークスペースパス補完一覧。
 */

import React, { forwardRef } from "react";
import { cn } from "@zedi/ui";

interface SlashPathCompletionSectionProps {
  suggestions: string[];
  onPick: (name: string) => void;
  t: (key: string) => string;
  /** Highlighted row when navigating with keyboard (-1 = none). / キーボード選択行（-1 でなし） */
  selectedIndex: number;
}

/**
 * Secondary list of path name suggestions (Tauri workspace).
 * パス名候補のセカンダリ一覧（Tauri ワークスペース）。
 */
export const SlashPathCompletionSection = forwardRef<
  HTMLDivElement,
  SlashPathCompletionSectionProps
>(function SlashPathCompletionSection({ suggestions, onPick, t, selectedIndex }, ref) {
  if (suggestions.length === 0) return null;
  return (
    <div
      ref={ref}
      className="border-border max-h-[160px] overflow-y-auto border-t p-1"
      role="group"
      aria-label={t("editor.slashPathCompletionAriaLabel")}
    >
      <div className="text-muted-foreground px-2 py-1 text-xs">
        {t("editor.slashPathCompletionHint")}
      </div>
      {suggestions.map((p, i) => (
        <button
          key={p}
          type="button"
          onClick={() => onPick(p)}
          className={cn(
            "hover:bg-muted block w-full truncate rounded px-2 py-1.5 text-left text-sm",
            selectedIndex === i && "bg-muted",
          )}
        >
          {p}
        </button>
      ))}
    </div>
  );
});

SlashPathCompletionSection.displayName = "SlashPathCompletionSection";
