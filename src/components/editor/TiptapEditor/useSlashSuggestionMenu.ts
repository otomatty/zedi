/**
 * State, effects, and imperative keyboard bridge for {@link SlashSuggestionMenu}.
 * {@link SlashSuggestionMenu} の状態・副作用・命令型キーボード。
 */

import {
  useState,
  useEffect,
  useCallback,
  useImperativeHandle,
  useRef,
  type Ref,
  type RefObject,
} from "react";
import { useToast } from "@zedi/ui";
import { useTranslation } from "react-i18next";
import type { AgentSlashCommandId } from "@/lib/agentSlashCommands/types";
import { executeAgentSlashCommand } from "@/lib/agentSlashCommands/executeAgentSlashCommand";
import { matchAgentSlashByQuery } from "@/lib/agentSlashCommands/parseAgentSlashQuery";
import { buildNewArgsFromPick, type UnifiedSlashMenuItem } from "./slashAgentMenuHelpers";
import { useSlashSuggestionMenuData } from "./useSlashSuggestionMenuData";
import { handleSlashSuggestionMenuKeyDown } from "./slashSuggestionMenuKeyDown";
import type { SlashSuggestionHandle } from "./slashSuggestionHandle";
import { useSlashMenuScrollEffects } from "./useSlashMenuScrollEffects";
import type { SlashSuggestionMenuProps } from "./slashSuggestionMenuProps";

export type { SlashSuggestionMenuProps };

/**
 * Return shape of {@link useSlashSuggestionMenu}.
 * {@link useSlashSuggestionMenu} の戻り値。
 */
export interface UseSlashSuggestionMenuResult {
  /** i18n `t`. / i18n の `t` */
  t: (key: string) => string;
  /** Merged block + agent rows. / ブロック＋エージェント行 */
  items: UnifiedSlashMenuItem[];
  /** Main list scroll container. / メイン一覧のスクロール要素 */
  listRef: RefObject<HTMLDivElement | null>;
  /** Path section scroll container. / パス欄のスクロール要素 */
  pathSectionRef: RefObject<HTMLDivElement | null>;
  /** Selected main row index. / メイン行の選択インデックス */
  selectedIndex: number;
  /** Whether path completion is active. / パス補完が有効か */
  pathCompletionEnabled: boolean;
  /** Path name suggestions. / パス名候補 */
  pathSuggestions: string[];
  /** Whether keyboard focus is in the path section. / キーボードフォーカスがパス欄か */
  pathSectionActive: boolean;
  /** Selected path row index. / パス行の選択インデックス */
  pathSelectedIndex: number;
  /** Run block or agent action for a row. / 行のブロック／エージェントを実行 */
  selectItem: (index: number) => void | Promise<void>;
  /** Apply a path completion pick. / パス補完の確定 */
  applyPathPick: (picked: string) => void;
}

/**
 * Hook implementation for the slash suggestion menu (split for ESLint max-lines).
 * ESLint の行数制限のため分離したスラッシュメニュー用フック。
 * Further logic lives in useSlashSuggestionMenuData, useSlashMenuScrollEffects, slashSuggestionMenuKeyDown.
 *
 * @param props - Menu props (editor, query, range, …). / メニュー props
 * @param ref - Imperative handle for keydown. / keydown 用の命令型ハンドル
 * @returns Menu state and actions. / メニュー状態とアクション
 */
export function useSlashSuggestionMenu(
  props: SlashSuggestionMenuProps,
  ref: Ref<SlashSuggestionHandle>,
): UseSlashSuggestionMenuResult {
  const {
    editor,
    query,
    range,
    onClose,
    claudeAgentSlashAvailable,
    onAgentBusyChange,
    claudeWorkspaceRoot,
  } = props;
  const { t } = useTranslation();
  const { toast } = useToast();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [pathSectionActive, setPathSectionActive] = useState(false);
  const [pathSelectedIndex, setPathSelectedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const pathSectionRef = useRef<HTMLDivElement>(null);

  const { items, pathCompletionEnabled, pathArgs, pathSuggestions } = useSlashSuggestionMenuData(
    query,
    editor,
    t,
    claudeAgentSlashAvailable,
    claudeWorkspaceRoot ?? null,
  );

  useEffect(() => {
    queueMicrotask(() => setSelectedIndex(0));
    setPathSelectedIndex(0);
    setPathSectionActive(false);
  }, [query, pathCompletionEnabled]);

  useEffect(() => {
    setSelectedIndex((i) => {
      if (items.length === 0) return 0;
      return Math.min(i, items.length - 1);
    });
  }, [items.length]);

  useEffect(() => {
    setPathSelectedIndex((i) => {
      if (pathSuggestions.length === 0) return 0;
      return Math.min(i, pathSuggestions.length - 1);
    });
  }, [pathSuggestions.length]);

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
          claudeCwd: claudeWorkspaceRoot ?? undefined,
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
    [onClose, onAgentBusyChange, query, editor, range, toast, t, claudeWorkspaceRoot],
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
      if (!m) {
        onClose();
        return;
      }
      const newArgs = buildNewArgsFromPick(pathArgs, picked);
      const newQuery = `${m.prefix} ${newArgs}`.trim();
      editor.chain().focus().deleteRange(range).insertContent(`/${newQuery} `).run();
    },
    [editor, onClose, query, range, pathArgs],
  );

  useSlashMenuScrollEffects(
    listRef,
    pathSectionRef,
    selectedIndex,
    pathSectionActive,
    pathSelectedIndex,
    pathSuggestions.length,
  );

  useImperativeHandle(
    ref,
    () => ({
      onKeyDown: (event: KeyboardEvent) =>
        handleSlashSuggestionMenuKeyDown(
          event,
          {
            itemsLength: items.length,
            pathCompletionEnabled,
            pathSuggestions,
            pathSectionActive,
            pathSelectedIndex,
            selectedIndex,
          },
          {
            setPathSectionActive,
            setPathSelectedIndex,
            setSelectedIndex,
            applyPathPick,
            selectItem,
            onClose,
          },
        ),
    }),
    [
      applyPathPick,
      items.length,
      onClose,
      pathCompletionEnabled,
      pathSectionActive,
      pathSelectedIndex,
      pathSuggestions,
      selectItem,
      selectedIndex,
    ],
  );

  return {
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
  };
}
