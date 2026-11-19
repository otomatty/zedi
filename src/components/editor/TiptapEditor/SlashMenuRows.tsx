/**
 * Renders slash menu rows.
 * スラッシュメニューの行を描画する。
 */

import { cn } from "@zedi/ui";
import { slashMenuIconMap } from "./slashSuggestionIcons";
import type { SlashCommandItem } from "./slashCommandItems";

interface SlashMenuRowsProps {
  items: SlashCommandItem[];
  selectedIndex: number;
  onSelectIndex: (index: number) => void;
  t: (key: string) => string;
}

/**
 * Listbox rows for slash commands.
 * スラッシュコマンドの listbox 行。
 */
export function SlashMenuRows({ items, selectedIndex, onSelectIndex, t }: SlashMenuRowsProps) {
  return (
    <>
      {items.map((item, index) => {
        const Icon = slashMenuIconMap[item.icon];
        return (
          <button
            key={item.id}
            role="option"
            aria-selected={index === selectedIndex}
            onClick={() => onSelectIndex(index)}
            className={cn(
              "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors",
              index === selectedIndex ? "bg-accent text-accent-foreground" : "hover:bg-muted",
            )}
          >
            {Icon && <Icon className="text-muted-foreground h-4 w-4 shrink-0" />}
            <div className="flex min-w-0 flex-col">
              <span className="truncate font-medium">{t(`editor.slash.${item.id}.title`)}</span>
              <span className="text-muted-foreground truncate text-xs">
                {t(`editor.slash.${item.id}.description`)}
              </span>
            </div>
          </button>
        );
      })}
    </>
  );
}
