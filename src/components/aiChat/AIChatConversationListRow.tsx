import { useState, useCallback } from "react";
import { MoreHorizontal } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@zedi/ui";
import { cn } from "@zedi/ui";
import { useTranslation } from "react-i18next";
import type { Conversation } from "@/types/aiChat";
import { useDeleteAIConversation } from "@/hooks/useDeleteAIConversation";

/**
 * AI conversation row props (page-level list).
 * AI 会話行のプロパティ（ページ内一覧用）。
 */
export interface AIChatConversationListRowProps {
  /** Conversation row data. / 会話行データ */
  conversation: Conversation;
  /** Whether this conversation is the active one in the chat panel. / チャットパネルで選択中か */
  isActive: boolean;
  /** Called when the user opens this conversation (main click). / 行の主クリックで開く */
  onOpen: () => void;
  /** Relative time label (e.g. “5 minutes ago”). / 相対時刻ラベル */
  dateLabel: string;
  /** Display title (resolved untitled). / 表示タイトル */
  titleLabel: string;
  /** When true, omit row border (e.g. landing list). / 行の枠線を付けない（ランディング等） */
  borderless?: boolean;
}

/**
 * One AI conversation row with overflow menu (delete) and an inline confirm dialog.
 * Used in the AI chat history page and landing list (the sidebar variant has been removed).
 *
 * 削除メニューと確認ダイアログを内蔵した AI 会話行。AI チャット履歴ページとランディング一覧で利用する
 * （旧サイドバー版は削除済み）。
 */
export function AIChatConversationListRow({
  conversation,
  isActive,
  onOpen,
  dateLabel,
  titleLabel,
  borderless = false,
}: AIChatConversationListRowProps) {
  const { t } = useTranslation();
  const deleteConversation = useDeleteAIConversation();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleConfirmDelete = useCallback(() => {
    deleteConversation(conversation.id);
    setConfirmOpen(false);
  }, [conversation.id, deleteConversation]);

  const deleteLabel = t("aiChat.history.delete", "Delete");
  const confirmTitle = t("aiChat.history.deleteConfirmTitle", "Delete this conversation?");
  const confirmDescription = t("aiChat.history.deleteConfirmDescription", "This cannot be undone.");

  /**
   * Defer opening the confirm dialog via `queueMicrotask` so the Radix dropdown
   * closes before the alert dialog opens (otherwise focus management collides).
   * Radix のドロップダウンが閉じてから確認ダイアログを開くため queueMicrotask で遅延する。
   */
  const scheduleOpenDeleteConfirm = () => {
    queueMicrotask(() => setConfirmOpen(true));
  };

  return (
    <>
      <div
        className={cn(
          "flex items-stretch gap-1 rounded-md",
          borderless
            ? isActive && "bg-accent/50"
            : cn("border-border border", isActive && "bg-accent/50 border-border"),
        )}
      >
        <button
          type="button"
          className="hover:bg-muted/50 flex min-w-0 flex-1 flex-col items-start gap-0.5 rounded-md px-3 py-2 text-left text-sm transition-colors"
          onClick={onOpen}
        >
          <span className="w-full truncate font-medium">{titleLabel}</span>
          <span className="text-muted-foreground w-full truncate text-xs">{dateLabel}</span>
        </button>
        <div className="flex shrink-0 items-center pr-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                aria-label={t("aiChat.history.openMenu", "Open menu")}
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={() => scheduleOpenDeleteConfirm()}
              >
                {deleteLabel}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmTitle}</AlertDialogTitle>
            <AlertDialogDescription>{confirmDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("aiChat.actions.cancel", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleConfirmDelete}
            >
              {deleteLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
