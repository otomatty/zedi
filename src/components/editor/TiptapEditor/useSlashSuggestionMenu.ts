/**
 * State, effects, and imperative keyboard bridge for {@link SlashSuggestionMenu}.
 * {@link SlashSuggestionMenu} の状態・副作用・命令型キーボード。
 */

import {
  useState,
  useEffect,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  type Ref,
  type RefObject,
} from "react";
import { useTranslation } from "react-i18next";
import {
  filterSlashCommandItems,
  slashCommandItems,
  type SlashCommandItem,
} from "./slashCommandItems";
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
  /** Block items matching the query. / クエリに一致するブロック項目 */
  items: SlashCommandItem[];
  /** List scroll container. / 一覧のスクロール要素 */
  listRef: RefObject<HTMLDivElement | null>;
  /** Selected row index. / 選択中の行インデックス */
  selectedIndex: number;
  /** Runs the block action for a row. / 行のブロック操作を実行する */
  selectItem: (index: number) => void;
}

/**
 * Hook implementation for the slash suggestion menu.
 * スラッシュメニュー用フック。
 *
 * @param props - Menu props (editor, query, range, …). / メニュー props
 * @param ref - Imperative handle for keydown. / keydown 用の命令型ハンドル
 * @returns Menu state and actions. / メニュー状態とアクション
 */
export function useSlashSuggestionMenu(
  props: SlashSuggestionMenuProps,
  ref: Ref<SlashSuggestionHandle>,
): UseSlashSuggestionMenuResult {
  const { editor, query, range, onClose } = props;
  const { t } = useTranslation();
  const [rawSelectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const items = useMemo(
    () => filterSlashCommandItems([...slashCommandItems], query, editor, t),
    [query, editor, t],
  );

  useEffect(() => {
    queueMicrotask(() => setSelectedIndex(0));
  }, [query]);

  // Clamp when the list shrinks, so the selection never points past the last row.
  const selectedIndex = items.length === 0 ? 0 : Math.min(rawSelectedIndex, items.length - 1);

  const selectItem = useCallback(
    (index: number) => {
      const item = items[index];
      if (!item) return;
      item.action(editor, range);
      onClose();
    },
    [items, editor, range, onClose],
  );

  useSlashMenuScrollEffects(listRef, selectedIndex);

  useImperativeHandle(
    ref,
    () => ({
      onKeyDown: (event: KeyboardEvent) =>
        handleSlashSuggestionMenuKeyDown(
          event,
          { itemsLength: items.length, selectedIndex },
          { setSelectedIndex, selectItem, onClose },
        ),
    }),
    [items.length, onClose, selectItem, selectedIndex],
  );

  return { t, items, listRef, selectedIndex, selectItem };
}
