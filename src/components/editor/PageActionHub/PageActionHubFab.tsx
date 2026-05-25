import React from "react";
import { Menu } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger, cn } from "@zedi/ui";

/** 入力バーと FAB の高さを揃えるための共有値。 / Shared height aligned with the Wiki Link input bar. */
export const PAGE_ACTION_HUB_FAB_SIZE_CLASS = "h-12 w-12";

interface PageActionHubFabProps {
  /** クリック時に `PageActionHub.open()` を叩くためのハンドラ。 / Opens the hub. */
  onOpen: () => void;
  /** 編集権限がなければ FAB 自体を出さない。 / Hides the FAB when the page is read-only. */
  canEdit: boolean;
  /** 未サインインでは出さない。 / Hides the FAB when signed out. */
  isSignedIn: boolean;
}

/**
 * ノートページ編集画面専用の単一ボタン FAB。クリックで `PageActionHub` を開く。
 * 既存 `FloatingActionButton`（ノート一覧でメニュー型として使用）とは独立した
 * コンポーネントで、Phase 1 では新規ページ作成や WebClipper の起動は担わない。
 *
 * Single-button FAB used on the note page editor screen. Clicking it opens
 * the `PageActionHub`. Independent from the existing menu-style
 * `FloatingActionButton` used on the note-list screen.
 */
export const PageActionHubFab: React.FC<PageActionHubFabProps> = ({
  onOpen,
  canEdit,
  isSignedIn,
}) => {
  const { t } = useTranslation();
  if (!canEdit || !isSignedIn) return null;

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            data-testid="page-action-hub-fab"
            aria-label={t("editor.pageActionHub.openAriaLabel")}
            onClick={onOpen}
            variant="ghost"
            className={cn(
              "pointer-events-auto shrink-0 rounded-full p-0",
              PAGE_ACTION_HUB_FAB_SIZE_CLASS,
              "bg-secondary/80 text-secondary-foreground shadow-lg backdrop-blur-sm",
              "border border-transparent",
              "transition-colors duration-150",
              "hover:bg-secondary hover:text-secondary-foreground",
              "[&_svg]:size-5",
            )}
          >
            <Menu />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">{t("editor.pageActionHub.openAriaLabel")}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
