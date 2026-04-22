import { useCallback, useMemo } from "react";
import { flushSync } from "react-dom";
import { useNavigate, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { formatDistanceToNow } from "date-fns";
import { enUS, ja } from "date-fns/locale";
import Container from "@/components/layout/Container";
import { AIChatInput } from "@/components/ai-chat/AIChatInput";
import { AIChatConversationListRow } from "@/components/ai-chat/AIChatConversationListRow";
import { useAIChatConversations } from "@/hooks/useAIChatConversations";
import { useAIChatStore } from "@/stores/aiChatStore";
import type { AIChatDetailLocationState, ReferencedPage } from "@/types/aiChat";
import {
  aiChatConversationPath,
  aiChatInitialPayloadStorageKey,
  AI_CHAT_HISTORY_PATH,
} from "@/constants/aiChatSidebar";

const RECENT_LIMIT = 5;

/**
 * AI chat landing page (`/ai`). Input is vertically centered above the recent list.
 * Sending a message creates a conversation and navigates to `/ai/:id` with state for the first send.
 * AI チャットのランディング（`/ai`）。入力欄は上段エリアの縦中央、下に最近5件（スクロール）。
 * 送信で会話を作成し、初回送信用の state を付けて `/ai/:id` へ遷移する。
 */
export default function AIChatLanding() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { conversations, createConversation } = useAIChatConversations();
  const { activeConversationId, setActiveConversation } = useAIChatStore();
  const dateLocale = i18n.language?.startsWith("ja") ? ja : enUS;

  const recentChats = useMemo(
    () => [...conversations].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, RECENT_LIMIT),
    [conversations],
  );

  const handleSendMessage = useCallback(
    (content: string, referencedPages: ReferencedPage[] = []) => {
      let convId = "";
      flushSync(() => {
        const conv = createConversation();
        convId = conv.id;
        setActiveConversation(conv.id);
      });
      const state: AIChatDetailLocationState = {
        initialMessage: content,
        initialReferencedPages: referencedPages,
      };
      try {
        if (typeof sessionStorage !== "undefined") {
          sessionStorage.setItem(
            aiChatInitialPayloadStorageKey(convId),
            JSON.stringify({ initialMessage: content, initialReferencedPages: referencedPages }),
          );
        }
      } catch {
        // ignore quota / private mode
      }
      navigate(aiChatConversationPath(convId), { state });
    },
    [createConversation, setActiveConversation, navigate],
  );

  const handleStopStreaming = useCallback(() => {}, []);

  return (
    // Fill main below header (parent shell uses h-svh + overflow-hidden). / ヘッダー下のメイン領域を埋める
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
      {/* Input: vertically centered in the flex-1 region above history / 履歴より上の領域で縦中央 */}
      <div className="bg-background flex min-h-0 flex-1 flex-col justify-center px-4 py-4">
        <Container className="mx-auto w-full max-w-2xl">
          <AIChatInput
            onSendMessage={handleSendMessage}
            onStopStreaming={handleStopStreaming}
            placeholderOverride={t("aiChat.landing.placeholder")}
            formClassName="p-3"
            editorClassName="min-h-[120px] max-h-[min(40vh,280px)] text-base"
            emptyOverlayClassName="text-base"
          />
        </Container>
      </div>

      {/* Recent chats (scrollable, capped height so the input area keeps vertical balance) / 履歴は高さ制限付きでスクロール */}
      <div className="scrollbar-none bg-background max-h-[min(42vh,320px)] min-h-0 shrink-0 overflow-y-auto">
        <Container className="mx-auto max-w-2xl pb-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
              {t("aiChat.landing.recentChats")}
            </h2>
            {conversations.length > 0 && (
              <Link
                to={AI_CHAT_HISTORY_PATH}
                className="text-primary hover:text-primary/80 text-xs transition-colors"
              >
                {t("aiChat.landing.viewAll")}
              </Link>
            )}
          </div>

          {recentChats.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("aiChat.landing.noRecentChats")}</p>
          ) : (
            <div className="flex max-w-2xl flex-col gap-2">
              {recentChats.map((conv) => {
                const titleLabel =
                  conv.title.trim().length > 0 ? conv.title : t("nav.untitledChat", "New chat");
                const dateLabel = formatDistanceToNow(new Date(conv.updatedAt), {
                  addSuffix: true,
                  locale: dateLocale,
                });
                return (
                  <AIChatConversationListRow
                    key={conv.id}
                    conversation={conv}
                    borderless
                    isActive={activeConversationId === conv.id}
                    onOpen={() => navigate(aiChatConversationPath(conv.id))}
                    dateLabel={dateLabel}
                    titleLabel={titleLabel}
                  />
                );
              })}
            </div>
          )}
        </Container>
      </div>
    </div>
  );
}
