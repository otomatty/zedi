import { useCallback, useState } from "react";
import type { PageActionView } from "./types";

/**
 * `PageActionHub` の純粋な状態マシン。レジストリには依存せず、開閉と
 * 一覧/詳細ビューの遷移のみを担う。閉じる操作（X / Esc / Drawer ドラッグダウン）
 * は常に view を list に戻し、次回オープン時に詳細ビューが残らないようにする。
 *
 * Pure state machine for `PageActionHub`. Has no registry knowledge — owns
 * only open/close state and the list/detail view transition. Any close action
 * resets the view to `list` so reopening always lands on the list.
 */
export function usePageActionHub() {
  const [isOpen, setIsOpen] = useState(false);
  const [view, setView] = useState<PageActionView>({ kind: "list" });

  const open = useCallback(() => {
    setView({ kind: "list" });
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    setView({ kind: "list" });
  }, []);

  const selectAction = useCallback((actionId: string) => {
    setView({ kind: "detail", actionId });
  }, []);

  const backToList = useCallback(() => {
    setView({ kind: "list" });
  }, []);

  const handleOpenChange = useCallback((next: boolean) => {
    setIsOpen(next);
    if (!next) setView({ kind: "list" });
  }, []);

  return {
    isOpen,
    view,
    open,
    close,
    selectAction,
    backToList,
    handleOpenChange,
  };
}
