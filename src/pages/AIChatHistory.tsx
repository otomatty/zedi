import { useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import Container from "@/components/layout/Container";
import { ContentWithAIChat } from "@/components/ai-chat/ContentWithAIChat";
import { AIChatConversationListRow } from "@/components/ai-chat/AIChatConversationListRow";
import { useAIChatConversations } from "@/hooks/useAIChatConversations";
import { useAIChatStore } from "@/stores/aiChatStore";
import { aiChatConversationPath } from "@/constants/aiChatSidebar";
import { useTranslation } from "react-i18next";
import { formatDistanceToNow } from "date-fns";
import { enUS, ja } from "date-fns/locale";

/**
 * Full list of AI chat conversations (localStorage-backed). Open / delete like the sidebar.
 * AI チャット会話の一覧ページ（ローカル保存）。サイドバーと同様に開く・削除できる。
 */
export default function AIChatHistory() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { conversations } = useAIChatConversations();
  const { activeConversationId } = useAIChatStore();
  const dateLocale = i18n.language?.startsWith("ja") ? ja : enUS;

  const sorted = useMemo(
    () => [...conversations].sort((a, b) => b.updatedAt - a.updatedAt),
    [conversations],
  );

  const handleOpen = useCallback(
    (id: string) => {
      navigate(aiChatConversationPath(id));
    },
    [navigate],
  );

  return (
    <AppLayout>
      <ContentWithAIChat>
        <main className="min-h-0 flex-1 overflow-y-auto py-6">
          <Container>
            <h1 className="text-foreground text-2xl font-semibold tracking-tight">
              {t("aiChat.history.pageTitle", "AI chat history")}
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              {t(
                "aiChat.history.pageDescription",
                "Open a conversation in the AI panel or delete it from this list.",
              )}
            </p>
            <div className="mt-6 flex max-w-2xl flex-col gap-2">
              {sorted.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  {t("aiChat.history.empty", "No conversations yet")}
                </p>
              ) : (
                sorted.map((conv) => {
                  const titleLabel =
                    conv.title.trim().length > 0
                      ? conv.title
                      : t("nav.sidebarUntitledChat", "New chat");
                  const dateLabel = formatDistanceToNow(new Date(conv.updatedAt), {
                    addSuffix: true,
                    locale: dateLocale,
                  });
                  return (
                    <AIChatConversationListRow
                      key={conv.id}
                      conversation={conv}
                      variant="page"
                      isActive={activeConversationId === conv.id}
                      onOpen={() => handleOpen(conv.id)}
                      dateLabel={dateLabel}
                      titleLabel={titleLabel}
                    />
                  );
                })
              )}
            </div>
          </Container>
        </main>
      </ContentWithAIChat>
    </AppLayout>
  );
}
