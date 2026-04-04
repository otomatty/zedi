/**
 * Slash command menu content (keyboard via ref). Blocks + optional Claude agent rows.
 * スラッシュコマンドメニュー本体（ref でキーボード）。ブロック＋任意の Claude エージェント行。
 */

import React, {
  useState,
  useEffect,
  useCallback,
  useImperativeHandle,
  forwardRef,
  useRef,
  useMemo,
} from "react";
import type { Editor } from "@tiptap/core";
import { useToast } from "@zedi/ui";
import { useTranslation } from "react-i18next";
import type { AgentSlashCommandId } from "@/lib/agentSlashCommands/types";
import { executeAgentSlashCommand } from "@/lib/agentSlashCommands/executeAgentSlashCommand";
import {
  matchAgentSlashByQuery,
  shouldOfferPathCompletion,
} from "@/lib/agentSlashCommands/parseAgentSlashQuery";
import { useWorkspacePathCompletions } from "./useWorkspacePathCompletions";
import { mergeSlashItems, buildNewArgsFromPick } from "./slashAgentMenuHelpers";
import { SlashMenuRows } from "./SlashMenuRows";
import { SlashPathCompletionSection } from "./SlashPathCompletionSection";
import type { SlashSuggestionHandle } from "./slashSuggestionHandle";

/** Props for {@link SlashSuggestionMenu}. / {@link SlashSuggestionMenu} の props */
export interface SlashSuggestionMenuProps {
  editor: Editor;
  query: string;
  range: { from: number; to: number };
  onClose: () => void;
  claudeAgentSlashAvailable: boolean;
  onAgentBusyChange?: (busy: boolean) => void;
}

/**
 * Slash menu with imperative keyboard handler for the editor keydown bridge.
 * エディタの keydown ブリッジ用の命令型キーボードハンドラ付きスラッシュメニュー。
 */
export const SlashSuggestionMenu = forwardRef<SlashSuggestionHandle, SlashSuggestionMenuProps>(
  ({ editor, query, range, onClose, claudeAgentSlashAvailable, onAgentBusyChange }, ref) => {
    const { t } = useTranslation();
    const { toast } = useToast();
    const [selectedIndex, setSelectedIndex] = useState(0);
    const listRef = useRef<HTMLDivElement>(null);

    const items = useMemo(
      () => mergeSlashItems(query, editor, t, claudeAgentSlashAvailable),
      [query, editor, t, claudeAgentSlashAvailable],
    );

    const pathMatch = matchAgentSlashByQuery(query);
    const pathCompletionEnabled =
      claudeAgentSlashAvailable && shouldOfferPathCompletion(query) && pathMatch !== null;
    const pathArgs = pathMatch?.args ?? "";
    const pathSuggestions = useWorkspacePathCompletions(pathArgs, pathCompletionEnabled);

    useEffect(() => {
      queueMicrotask(() => setSelectedIndex(0));
    }, [query]);

    const runAgentCommand = useCallback(
      async (id: AgentSlashCommandId) => {
        onClose();
        onAgentBusyChange?.(true);
        try {
          const err = await executeAgentSlashCommand({
            commandId: id,
            query,
            editor,
            range,
          });
          if (err) {
            toast({
              title: t("editor.slashAgent.errorTitle"),
              description: err,
              variant: "destructive",
            });
          }
        } finally {
          onAgentBusyChange?.(false);
        }
      },
      [onClose, onAgentBusyChange, query, editor, range, toast, t],
    );

    const selectItem = useCallback(
      async (index: number) => {
        const entry = items[index];
        if (!entry) return;
        if (entry.kind === "block") {
          entry.item.action(editor, range);
          onClose();
          return;
        }
        await runAgentCommand(entry.id);
      },
      [items, editor, range, onClose, runAgentCommand],
    );

    const applyPathPick = useCallback(
      (picked: string) => {
        const m = matchAgentSlashByQuery(query);
        if (!m) return;
        const newArgs = buildNewArgsFromPick(pathArgs, picked);
        const newQuery = `${m.prefix} ${newArgs}`.trim();
        editor.chain().focus().deleteRange(range).insertContent(`/${newQuery} `).run();
      },
      [editor, query, range, pathArgs],
    );

    useEffect(() => {
      if (!listRef.current) return;
      const buttons = listRef.current.querySelectorAll("button");
      const target = buttons[selectedIndex];
      if (target) {
        target.scrollIntoView({ block: "nearest" });
      }
    }, [selectedIndex]);

    useImperativeHandle(ref, () => ({
      onKeyDown: (event: KeyboardEvent) => {
        if (event.key === "ArrowUp") {
          event.preventDefault();
          setSelectedIndex((prev) => (prev <= 0 ? items.length - 1 : prev - 1));
          return true;
        }

        if (event.key === "ArrowDown") {
          event.preventDefault();
          setSelectedIndex((prev) => (prev >= items.length - 1 ? 0 : prev + 1));
          return true;
        }

        if (event.key === "Enter") {
          event.preventDefault();
          void selectItem(selectedIndex);
          return true;
        }

        if (event.key === "Escape") {
          event.preventDefault();
          onClose();
          return true;
        }

        return false;
      },
    }));

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
          <SlashPathCompletionSection suggestions={pathSuggestions} onPick={applyPathPick} t={t} />
        ) : null}
      </div>
    );
  },
);

SlashSuggestionMenu.displayName = "SlashSuggestionMenu";
