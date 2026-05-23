import { useCallback, useSyncExternalStore } from "react";
import type { Editor } from "@tiptap/core";

/**
 * `MobileSelectionSheet` の表示判定を計算する内部フック。
 *
 * デスクトップ用 `EditorBubbleMenu` の `shouldShow` と同じ条件を素直に
 * 移植している（issue #929 §「BubbleMenu はキーボードと干渉するため
 * モバイルでは非表示」）。
 *
 * - 編集可能 (`isEditable`)
 * - エディタにフォーカスがある (`view.hasFocus()`)
 * - 選択が空ではない、または `wikiLink` マーク内にキャレットがある
 * - `codeBlock` 内にキャレットがない
 *
 * `selectionUpdate` / `focus` / `blur` / `transaction` を購読して
 * エディタ状態の変化を React に反映する。`useSyncExternalStore` を
 * 使うことで「subscribe / unsubscribe」と「現在値の読み出し」を
 * React の規約通り分離し、effect 内で `setState` を呼ばずに済む
 * （`react-hooks/set-state-in-effect`）。
 *
 * Computes visibility for {@link MobileSelectionSheet}. Mirrors the
 * `shouldShow` predicate used by the desktop `EditorBubbleMenu` so the
 * mobile sheet appears in the exact same situations the bubble menu would
 * on desktop (issue #929: the bubble menu is hidden on mobile because it
 * collides with the on-screen keyboard). Uses `useSyncExternalStore` so
 * subscribe / read are split per React's contract and we don't call
 * `setState` inside an effect body (`react-hooks/set-state-in-effect`).
 *
 * @param editor - 操作対象のエディタ。`null` の間は常に `false`。 / Editor instance, or `null` while initializing.
 * @returns シートを表示すべきか。 / Whether the mobile sheet should be visible.
 */
export function useMobileSelectionVisible(editor: Editor | null): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!editor) return noop;
      editor.on("selectionUpdate", onChange);
      editor.on("focus", onChange);
      editor.on("blur", onChange);
      editor.on("transaction", onChange);
      return () => {
        editor.off("selectionUpdate", onChange);
        editor.off("focus", onChange);
        editor.off("blur", onChange);
        editor.off("transaction", onChange);
      };
    },
    [editor],
  );

  const getSnapshot = useCallback(() => computeVisible(editor), [editor]);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

function computeVisible(editor: Editor | null): boolean {
  if (!editor) return false;
  if (!editor.isEditable) return false;
  if (!editor.view?.hasFocus?.()) return false;
  if (editor.isActive("codeBlock")) return false;
  if (!editor.state.selection.empty) return true;
  return editor.isActive("wikiLink");
}

function noop(): void {
  // no-op cleanup used while editor is null.
}

function getServerSnapshot(): boolean {
  // SSR: editors are never focused. / SSR has no editor focus.
  return false;
}
