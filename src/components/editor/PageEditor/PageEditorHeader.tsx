import React from "react";
import { ArrowLeft, Trash2, MoreHorizontal, Download, Copy, History } from "lucide-react";
import { Button } from "@zedi/ui";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@zedi/ui";
import Container from "@/components/layout/Container";
import { HeaderSearchBar } from "@/components/layout/Header/HeaderSearchBar";
import { useGlobalSearchContextOptional } from "@/contexts/GlobalSearchContext";
import { useTranslation } from "react-i18next";
import { formatTimeAgo } from "@/lib/dateUtils";
import { ConnectionIndicator } from "../ConnectionIndicator";
import { UserAvatars } from "../UserAvatars";
import type { ConnectionStatus } from "@/lib/collaboration/types";
import type { UserPresence } from "@/lib/collaboration/types";
import { AIChatButton } from "@/components/layout/Header/AIChatButton";

interface PageEditorHeaderProps {
  lastSaved: number | null;
  onBack: () => void;
  onDelete: () => void;
  onExportMarkdown: () => void;
  onCopyMarkdown: () => void;
  /** 変更履歴モーダルを開く / Open version history modal */
  onOpenHistory?: () => void;
  /** リアルタイムコラボレーション状態（有効時のみ渡す） */
  collaboration?: {
    status: ConnectionStatus;
    isSynced: boolean;
    onlineUsers: UserPresence[];
    onReconnect: () => void;
  };
}

/**
 * Header component for PageEditor
 * Contains search bar, action buttons, and dropdown menu
 */
export const PageEditorHeader: React.FC<PageEditorHeaderProps> = ({
  lastSaved,
  onBack,
  onDelete,
  onExportMarkdown,
  onCopyMarkdown,
  onOpenHistory,
  collaboration,
}) => {
  const { t } = useTranslation();
  const searchContext = useGlobalSearchContextOptional();
  const hasSearchContext = searchContext != null;

  return (
    <header className="border-border bg-background/95 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50 border-b backdrop-blur">
      <Container className="flex h-16 items-center gap-4">
        <Button variant="ghost" size="icon" onClick={onBack} className="shrink-0">
          <ArrowLeft className="h-5 w-5" />
        </Button>

        {/* Center: Search bar */}
        {hasSearchContext ? (
          <div className="flex max-w-xl min-w-0 flex-1 justify-center">
            <HeaderSearchBar />
          </div>
        ) : (
          <div className="min-w-0 flex-1" aria-hidden="true" />
        )}

        <div className="flex items-center gap-2">
          {/* リアルタイムコラボ: 接続状態・オンラインユーザー */}
          {collaboration && (
            <>
              <ConnectionIndicator
                status={collaboration.status}
                isSynced={collaboration.isSynced}
                onReconnect={collaboration.onReconnect}
                className="shrink-0"
              />
              <UserAvatars users={collaboration.onlineUsers} className="shrink-0" />
            </>
          )}
          <AIChatButton />
          {lastSaved && (
            <span className="text-muted-foreground hidden text-xs sm:inline">
              {formatTimeAgo(lastSaved)}に保存
            </span>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <MoreHorizontal className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onOpenHistory && (
                <DropdownMenuItem onClick={onOpenHistory}>
                  <History className="mr-2 h-4 w-4" />
                  {t("editor.pageHistory.menuButton")}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={onExportMarkdown}>
                <Download className="mr-2 h-4 w-4" />
                Markdownでエクスポート
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onCopyMarkdown}>
                <Copy className="mr-2 h-4 w-4" />
                Markdownをコピー
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={onDelete}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                削除
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </Container>
    </header>
  );
};
