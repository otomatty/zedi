import { useEffect } from "react";

/**
 * グローバル検索を `Cmd/Ctrl + K` で開くショートカット。
 *
 * Hook to handle global keyboard shortcut for opening search.
 * Cmd+K on Mac, Ctrl+K on Windows/Linux.
 *
 * 衝突契約 / collision contract:
 * - エディタ用 `useEditorWikiLinkShortcuts` が capture phase で `Cmd+K` を
 *   消費する場合、こちらは bubble phase で `event.defaultPrevented` を
 *   見て早期 return する（issue #928）。これによりエディタフォーカス時は
 *   入力バーが優先され、それ以外ではグローバル検索が動く。
 * - When `useEditorWikiLinkShortcuts` (capture phase) consumes `Cmd+K`
 *   inside a focused editor, this bubble-phase handler bails out via
 *   `event.defaultPrevented` (issue #928). Result: editor-focused → focus
 *   the Wiki Link input bar; otherwise → open global search.
 *
 * @param onOpen - Callback function when shortcut is triggered
 */
export function useGlobalSearchShortcut(onOpen: () => void) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+K (Mac) or Ctrl+K (Windows/Linux)
      if (!((e.metaKey || e.ctrlKey) && e.key === "k")) return;
      // capture phase の他リスナー（エディタショートカット等）が消費済みなら
      // グローバル検索は呼ばない（issue #928 の衝突回避）。
      // Skip when an earlier capture-phase listener already consumed the
      // event (issue #928 collision guard).
      if (e.defaultPrevented) return;
      e.preventDefault();
      onOpen();
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onOpen]);
}
