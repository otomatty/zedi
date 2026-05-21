import React from "react";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger, cn } from "@zedi/ui";

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
            className={cn(
              "pointer-events-auto h-16 w-16 rounded-full",
              "shadow-elevated",
              "transition-all duration-300 ease-in-out",
              "hover:bg-primary hover:scale-105",
              "[&_svg]:size-4",
            )}
          >
            <Plus />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left">{t("editor.pageActionHub.openAriaLabel")}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
