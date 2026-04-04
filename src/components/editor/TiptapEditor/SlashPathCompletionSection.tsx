/**
 * Workspace path completion list below the main slash menu.
 * メインスラッシュメニュー下のワークスペースパス補完一覧。
 */

import React from "react";

interface SlashPathCompletionSectionProps {
  suggestions: string[];
  onPick: (name: string) => void;
  t: (key: string) => string;
}

/**
 * Secondary list of path name suggestions (Tauri workspace).
 * パス名候補のセカンダリ一覧（Tauri ワークスペース）。
 */
export function SlashPathCompletionSection({
  suggestions,
  onPick,
  t,
}: SlashPathCompletionSectionProps) {
  if (suggestions.length === 0) return null;
  return (
    <div
      className="border-border max-h-[160px] overflow-y-auto border-t p-1"
      role="listbox"
      aria-label={t("editor.slashPathCompletionAriaLabel")}
    >
      <div className="text-muted-foreground px-2 py-1 text-xs">
        {t("editor.slashPathCompletionHint")}
      </div>
      {suggestions.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => onPick(p)}
          className="hover:bg-muted block w-full truncate rounded px-2 py-1.5 text-left text-sm"
        >
          {p}
        </button>
      ))}
    </div>
  );
}
