import { useEffect } from "react";
import type { Editor } from "@tiptap/core";

/**
 * `useEditorWikiLinkShortcuts` のオプション。
 *
 * Options for {@link useEditorWikiLinkShortcuts}.
 */
export interface UseEditorWikiLinkShortcutsOptions {
  /**
   * 対象 Tiptap エディタ。`null` の間はショートカットを無効化する。
   * The target Tiptap editor; shortcuts are disabled while it is `null`.
   */
  editor: Editor | null;
  /**
   * `Cmd/Ctrl+K` 時に Wiki Link 入力バーへフォーカスを移すコールバック。
   * 入力バーが自身の `onFocus` でエディタの選択位置を退避するため、ここでは
   * 「フォーカスを移す」だけ実装すれば十分。
   *
   * Callback invoked on `Cmd/Ctrl+K` that focuses the Wiki Link input bar.
   * The bar itself snapshots the editor selection in its own `onFocus`, so
   * this only needs to move focus.
   */
  focusInputBar: () => void;
  /**
   * `Cmd/Ctrl+Shift+L` 時に現在の選択範囲を `[[Title]]` の Wiki Link に
   * 変換する非同期コールバック。実体は通常
   * `useBubbleMenuWikiLink({editor, pageId}).convertToWikiLink` を渡す。
   *
   * Async callback that converts the current editor selection into a
   * `[[Title]]` wiki link on `Cmd/Ctrl+Shift+L`. Typically wired to
   * `useBubbleMenuWikiLink({editor, pageId}).convertToWikiLink`.
   */
  convertSelectionToWikiLink: () => Promise<void>;
  /**
   * true の間は両ショートカットを無効化する。
   * Disables both shortcuts while true.
   */
  isReadOnly?: boolean;
}

/**
 * デスクトップ向けのエディタショートカットを登録するフック（issue #928）。
 *
 * - `Cmd/Ctrl + K`: エディタフォーカス時に Wiki Link 入力バーへフォーカス。
 * - `Cmd/Ctrl + Shift + L`: エディタフォーカスかつ非空選択時に選択範囲を
 *   即 Wiki Link 化（空選択時は no-op）。
 *
 * 既存のグローバル検索（`useGlobalSearchShortcut`）および Tiptap `Link` 拡張の
 * `Mod-k` と衝突するため、リスナーは **capture phase** で登録し、消費時に
 * `preventDefault()` + `stopPropagation()` を呼ぶ。これによりエディタ
 * フォーカス時はエディタ側ハンドラが先に処理し、`useGlobalSearchShortcut`
 * 側は `defaultPrevented` を見て早期 return する契約となる。
 *
 * Desktop Wiki Link shortcut hook (issue #928):
 *
 * - `Cmd/Ctrl + K` focuses the Wiki Link input bar while the editor is
 *   focused.
 * - `Cmd/Ctrl + Shift + L` converts the current editor selection into a
 *   `[[Title]]` wiki link (no-op on empty selection).
 *
 * Listener is attached in the **capture phase** so it preempts the
 * document-level global search shortcut and the Tiptap `Link` extension's
 * `Mod-k` keymap. When consumed, the handler calls `preventDefault()` and
 * `stopPropagation()`; `useGlobalSearchShortcut` cooperates by bailing out
 * when `defaultPrevented` is already true.
 */
export function useEditorWikiLinkShortcuts({
  editor,
  focusInputBar,
  convertSelectionToWikiLink,
  isReadOnly,
}: UseEditorWikiLinkShortcutsOptions): void {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // IME 変換中はキー入力をフックしない（日本語等）。
      // Don't intercept while an IME composition is in progress (CJK input).
      if (event.isComposing) return;
      // Alt 併用は別ショートカット領域に予約する。
      // Reserve Alt-modified combinations for other shortcuts.
      if (event.altKey) return;
      if (!editor || !editor.isEditable || isReadOnly) return;
      if (!editor.isFocused) return;

      const mod = event.metaKey || event.ctrlKey;
      if (!mod) return;

      // Cmd/Ctrl + K (Shift 無し) → 入力バーへフォーカス。
      // Cmd/Ctrl + K (no Shift) → focus the Wiki Link input bar.
      if (!event.shiftKey && event.key === "k") {
        event.preventDefault();
        event.stopPropagation();
        focusInputBar();
        return;
      }

      // Cmd/Ctrl + Shift + L → 選択範囲を Wiki Link 化。
      // Shift を押すと `key` が大文字になる実装が大半だが、`l` も許容して
      // キーボードレイアウト差や synthetic イベント差に強くしておく。
      // Cmd/Ctrl + Shift + L → convert selection to wiki link. Most layouts
      // uppercase `key` while Shift is held, but accept lowercase `l` too
      // for robustness against synthetic events and layout edge cases.
      if (event.shiftKey && (event.key === "L" || event.key === "l")) {
        const { from, to } = editor.state.selection;
        // 空選択は no-op、preventDefault も呼ばない（受け入れ条件）。
        // Empty selection is a no-op; do not even preventDefault (issue #928 AC).
        if (from === to) return;
        event.preventDefault();
        event.stopPropagation();
        void convertSelectionToWikiLink();
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [editor, focusInputBar, convertSelectionToWikiLink, isReadOnly]);
}
