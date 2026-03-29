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
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@zedi/ui";
import { cn } from "@zedi/ui";
import { useTranslation } from "react-i18next";
import type { Conversation } from "@/types/aiChat";
import { useDeleteAIConversation } from "@/hooks/useDeleteAIConversation";

/**
 * Where the row is rendered: sidebar list vs full page history.
 * 行の表示コンテキスト（サイドバー一覧か履歴ページか）。
 */
export type AIChatConversationListRowVariant = "sidebar" | "page";

/** Shared props for both row variants. / 両バリアント共通のプロパティ */
interface AIChatConversationListRowBaseProps {
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
}

/**
 * Row props: sidebar delegates delete confirm to parent; page variant can omit border.
 * 行のプロパティ。サイドバーは削除確認を親へ。ページ版は枠線なし可。
 */
export type AIChatConversationListRowProps =
  | (AIChatConversationListRowBaseProps & {
      variant: "sidebar";
      /** Parent shows confirm dialog (keeps valid `ul` \> `li` only). / 親で確認ダイアログを出す */
      onRequestDelete: () => void;
    })
  | (AIChatConversationListRowBaseProps & {
      variant: "page";
      /** When true, omit row border (e.g. landing list). / 行の枠線を付けない（ランディング等） */
      borderless?: boolean;
    });

/**
 * One AI conversation row with overflow menu (delete). Page variant includes confirm dialog;
 * sidebar delegates confirmation to the parent so the menu stays valid HTML (`ul` \> `li` only).
 * 削除メニュー付き会話行。ページ版は確認ダイアログ内蔵。サイドバー版は親が確認（ul の構造を保つ）。
 */
export function AIChatConversationListRow(props: AIChatConversationListRowProps) {
  const { conversation, variant, isActive, onOpen, dateLabel, titleLabel } = props;
  const borderless =
    variant === "page" &&
    Boolean((props as Extract<AIChatConversationListRowProps, { variant: "page" }>).borderless);
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
   * Callback to open delete confirm (sidebar delegates to parent, page opens inline dialog).
   * Deferred via `queueMicrotask` so the Radix dropdown closes before the alert dialog opens.
   * 削除確認を開く。ドロップダウンが閉じ切ってから開くため queueMicrotask で遅延。
   */
  const requestDeleteConfirm =
    variant === "sidebar"
      ? (props as Extract<AIChatConversationListRowProps, { variant: "sidebar" }>).onRequestDelete
      : () => setConfirmOpen(true);

  const scheduleOpenDeleteConfirm = () => {
    queueMicrotask(requestDeleteConfirm);
  };

  const menuTrigger = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {variant === "sidebar" ? (
          <SidebarMenuAction
            type="button"
            showOnHover
            onClick={(e) => e.stopPropagation()}
            aria-label={t("aiChat.history.openMenu", "Open menu")}
          >
            <MoreHorizontal className="size-4" />
          </SidebarMenuAction>
        ) : (
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
        )}
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
  );

  const alertDialog =
    variant === "page" ? (
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
    ) : null;

  if (variant === "sidebar") {
    return (
      <SidebarMenuItem>
        <SidebarMenuButton
          type="button"
          size="sm"
          isActive={isActive}
          tooltip={titleLabel}
          className="h-auto min-h-8 flex-col items-stretch gap-0.5 py-1.5 pr-8"
          onClick={onOpen}
        >
          <span className="w-full truncate text-left font-medium">{titleLabel}</span>
          <span className="text-muted-foreground w-full truncate text-left text-[11px] font-normal">
            {dateLabel}
          </span>
        </SidebarMenuButton>
        {menuTrigger}
      </SidebarMenuItem>
    );
  }

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
        <div className="flex shrink-0 items-center pr-1">{menuTrigger}</div>
      </div>
      {alertDialog}
    </>
  );
}
