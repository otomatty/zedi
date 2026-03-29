import { useMemo, useCallback, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { MessageSquare } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { enUS, ja } from "date-fns/locale";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@zedi/ui";
import { useTranslation } from "react-i18next";
import { useAIChatConversations } from "@/hooks/useAIChatConversations";
import { useAIChatStore } from "@/stores/aiChatStore";
import { AIChatConversationListRow } from "@/components/ai-chat/AIChatConversationListRow";
import {
  AI_CHAT_HISTORY_PATH,
  SIDEBAR_AI_CHAT_RECENT_LIMIT,
  aiChatConversationPath,
} from "@/constants/aiChatSidebar";
import { useDeleteAIConversation } from "@/hooks/useDeleteAIConversation";

/**
 * AI chat history block for AppSidebar (recent 5, see-all link, delete rows).
 * Always rendered in AppSidebar, including on `/ai` routes without dock context.
 * AppSidebar 用の AI チャット履歴（直近5件・すべて表示・削除）。`/ai` 上でも常に表示。
 */
export function AppSidebarAiChatSection() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { conversations } = useAIChatConversations();
  const { activeConversationId } = useAIChatStore();
  const deleteConversation = useDeleteAIConversation();
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const dateLocale = i18n.language?.startsWith("ja") ? ja : enUS;

  const deleteLabel = t("aiChat.history.delete", "Delete");
  const confirmTitle = t("aiChat.history.deleteConfirmTitle", "Delete this conversation?");
  const confirmDescription = t("aiChat.history.deleteConfirmDescription", "This cannot be undone.");

  const sortedConversations = useMemo(
    () => [...conversations].sort((a, b) => b.updatedAt - a.updatedAt),
    [conversations],
  );

  const recentConversations = useMemo(
    () => sortedConversations.slice(0, SIDEBAR_AI_CHAT_RECENT_LIMIT),
    [sortedConversations],
  );

  const handleOpenConversation = useCallback(
    (id: string) => {
      navigate(aiChatConversationPath(id));
    },
    [navigate],
  );

  const handleConfirmDelete = useCallback(() => {
    if (pendingDeleteId) {
      deleteConversation(pendingDeleteId);
    }
    setPendingDeleteId(null);
  }, [pendingDeleteId, deleteConversation]);

  return (
    <SidebarGroup>
      <SidebarGroupLabel className="flex items-center gap-2">
        <MessageSquare className="size-3.5 shrink-0" aria-hidden />
        {t("nav.sidebarAiChatHistory", "AI chat history")}
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {sortedConversations.length === 0 && (
            <p className="text-muted-foreground px-2 py-1.5 text-xs">
              {t("nav.sidebarNoAiConversations", "No conversations yet")}
            </p>
          )}
          {recentConversations.map((conv) => {
            const titleLabel =
              conv.title.trim().length > 0 ? conv.title : t("nav.sidebarUntitledChat", "New chat");
            const dateLabel = formatDistanceToNow(new Date(conv.updatedAt), {
              addSuffix: true,
              locale: dateLocale,
            });
            return (
              <AIChatConversationListRow
                key={conv.id}
                conversation={conv}
                variant="sidebar"
                isActive={activeConversationId === conv.id}
                onOpen={() => handleOpenConversation(conv.id)}
                onRequestDelete={() => setPendingDeleteId(conv.id)}
                dateLabel={dateLabel}
                titleLabel={titleLabel}
              />
            );
          })}
          {sortedConversations.length > SIDEBAR_AI_CHAT_RECENT_LIMIT && (
            <SidebarMenuItem>
              <SidebarMenuButton asChild size="sm" tooltip={t("aiChat.history.seeAll", "See all")}>
                <Link
                  to={AI_CHAT_HISTORY_PATH}
                  className="text-muted-foreground hover:text-sidebar-accent-foreground"
                >
                  {t("aiChat.history.seeAll", "See all")}
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
        </SidebarMenu>
      </SidebarGroupContent>

      <AlertDialog
        open={pendingDeleteId != null}
        onOpenChange={(open) => !open && setPendingDeleteId(null)}
      >
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
    </SidebarGroup>
  );
}
