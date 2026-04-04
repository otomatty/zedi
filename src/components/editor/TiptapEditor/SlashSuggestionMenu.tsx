/**
 * Slash command menu content (keyboard via ref). Blocks + optional Claude agent rows.
 * スラッシュコマンドメニュー本体（ref でキーボード）。ブロック＋任意の Claude エージェント行。
 */

import React, { forwardRef } from "react";
import { SlashMenuRows } from "./SlashMenuRows";
import { SlashPathCompletionSection } from "./SlashPathCompletionSection";
import type { SlashSuggestionHandle } from "./slashSuggestionHandle";
import { useSlashSuggestionMenu } from "./useSlashSuggestionMenu";
import type { SlashSuggestionMenuProps } from "./slashSuggestionMenuProps";

export type { SlashSuggestionMenuProps };

/**
 * Slash menu with imperative keyboard handler for the editor keydown bridge.
 * エディタの keydown ブリッジ用の命令型キーボードハンドラ付きスラッシュメニュー。
 */
export const SlashSuggestionMenu = forwardRef<SlashSuggestionHandle, SlashSuggestionMenuProps>(
  (props, ref) => {
    const {
      t,
      items,
      listRef,
      pathSectionRef,
      selectedIndex,
      pathCompletionEnabled,
      pathSuggestions,
      pathSectionActive,
      pathSelectedIndex,
      selectItem,
      applyPathPick,
    } = useSlashSuggestionMenu(props, ref);

    if (items.length === 0) {
      return (
        <div className="shadow-elevated animate-fade-in border-border bg-popover min-w-[240px] overflow-hidden rounded-lg border">
          <div className="text-muted-foreground px-3 py-2 text-sm">
            {t("editor.slashNoResults")}
          </div>
        </div>
      );
    }

    return (
      <div className="shadow-elevated animate-fade-in border-border bg-popover max-w-[min(420px,90vw)] min-w-[240px] overflow-hidden rounded-lg border">
        <div
          ref={listRef}
          className="max-h-[320px] overflow-y-auto p-1"
          role="listbox"
          aria-label={t("editor.slashMenuAriaLabel")}
        >
          <SlashMenuRows
            items={items}
            selectedIndex={selectedIndex}
            onSelectIndex={(i) => void selectItem(i)}
            t={t}
          />
        </div>
        {pathCompletionEnabled && pathSuggestions.length > 0 ? (
          <SlashPathCompletionSection
            ref={pathSectionRef}
            suggestions={pathSuggestions}
            onPick={applyPathPick}
            t={t}
            selectedIndex={pathSectionActive ? pathSelectedIndex : -1}
          />
        ) : null}
      </div>
    );
  },
);

SlashSuggestionMenu.displayName = "SlashSuggestionMenu";
