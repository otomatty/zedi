/**
 * Renders block + agent slash menu rows.
 * ブロック＋エージェントのスラッシュ行を描画する。
 */

import React from "react";
import { cn } from "@zedi/ui";
import { Bot } from "lucide-react";
import { slashMenuIconMap, agentSlashIconName } from "./slashSuggestionIcons";
import type { UnifiedSlashMenuItem } from "./slashAgentMenuHelpers";
interface SlashMenuRowsProps {
  items: UnifiedSlashMenuItem[];
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
      {items.map((entry, index) => {
        if (entry.kind === "block") {
          const item = entry.item;
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
        }
        const Icon = slashMenuIconMap[agentSlashIconName[entry.id]] ?? Bot;
        return (
          <button
            key={entry.id}
            role="option"
            aria-selected={index === selectedIndex}
            onClick={() => onSelectIndex(index)}
            className={cn(
              "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors",
              index === selectedIndex ? "bg-accent text-accent-foreground" : "hover:bg-muted",
            )}
          >
            <Icon className="text-muted-foreground h-4 w-4 shrink-0" />
            <div className="flex min-w-0 flex-col">
              <span className="truncate font-medium">{t(`editor.slash.${entry.id}.title`)}</span>
              <span className="text-muted-foreground truncate text-xs">
                {t(`editor.slash.${entry.id}.description`)}
              </span>
            </div>
          </button>
        );
      })}
    </>
  );
}
