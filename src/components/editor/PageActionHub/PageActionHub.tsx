import React, { useEffect, useMemo } from "react";
import type { MutableRefObject } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  useIsMobile,
} from "@zedi/ui";
import { PageActionList } from "./PageActionList";
import { usePageActionHub } from "./usePageActionHub";
import { getAvailablePageActions, getPageActionById } from "./registry";
import type { PageActionContext, PageActionHubHandle } from "./types";

/**
 * `PageActionHub` のレンダリングに必要な props。
 * Render-time props for `PageActionHub`.
 */
export interface PageActionHubProps {
  ctx: PageActionContext;
  /**
   * 親 (FAB) からハブを開閉するための ref。`insertAtCursorRef` と同様、
   * マウント後に `useEffect` で `ref.current` に handle を代入する。
   *
   * Imperative handle so the FAB can open/close the hub. Mirrors the
   * `insertAtCursorRef` pattern of assigning into `ref.current` on mount.
   */
  hubRef?: MutableRefObject<PageActionHubHandle | null>;
}

/**
 * ページ編集画面用のアクションハブ。デスクトップでは Dialog、モバイルでは
 * Drawer に切り替えてアクション一覧 (list) と詳細 (detail) の二階建てを表示する。
 *
 * Page-edit action hub. Renders as a Dialog on desktop and a Drawer on
 * mobile, with a two-step navigation (list → detail) inside.
 */
export const PageActionHub: React.FC<PageActionHubProps> = ({ ctx, hubRef }) => {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const { isOpen, view, open, close, selectAction, backToList, handleOpenChange } =
    usePageActionHub();

  const availableActions = useMemo(() => getAvailablePageActions(ctx), [ctx]);

  // 親からハブを命令的に開閉できるよう ref に handle を代入する。
  // Expose imperative open/close to the parent through the ref.
  useEffect(() => {
    if (!hubRef) return;
    hubRef.current = { open, close };
    return () => {
      hubRef.current = null;
    };
  }, [hubRef, open, close]);

  const detailAction = view.kind === "detail" ? getPageActionById(view.actionId) : undefined;
  const headerLabel =
    view.kind === "detail" && detailAction
      ? t(detailAction.labelI18nKey)
      : t("editor.pageActionHub.title");

  const body =
    view.kind === "detail" && detailAction ? (
      <detailAction.Component ctx={ctx} onClose={close} onBackToList={backToList} />
    ) : (
      <PageActionList ctx={ctx} actions={availableActions} onSelect={selectAction} />
    );

  const header = (
    <div className="flex items-center gap-2">
      {view.kind === "detail" && (
        <Button type="button" size="sm" variant="ghost" className="-ml-2" onClick={backToList}>
          <ChevronLeft className="mr-1 h-4 w-4" />
          {t("editor.pageActionHub.back")}
        </Button>
      )}
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={isOpen} onOpenChange={handleOpenChange}>
        <DrawerContent data-testid="page-action-hub-drawer">
          <DrawerHeader>
            <DrawerTitle>{headerLabel}</DrawerTitle>
            {header}
          </DrawerHeader>
          <div className="px-4 pb-6">{body}</div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg" data-testid="page-action-hub-dialog">
        <DialogHeader>
          <DialogTitle>{headerLabel}</DialogTitle>
          {header}
        </DialogHeader>
        <div>{body}</div>
      </DialogContent>
    </Dialog>
  );
};
