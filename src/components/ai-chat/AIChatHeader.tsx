import { Sparkles, ClipboardList, Plus, X, Maximize2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useAIChatStore } from "../../stores/aiChatStore";
import { AI_CHAT_BASE_PATH, aiChatConversationPath } from "@/constants/aiChatSidebar";

/**
 * AI chat dock header: list, new chat, open full page, close.
 * AI チャットドックのヘッダー（一覧・新規・フルページで開く・閉じる）。
 */
export function AIChatHeader() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { closePanel, toggleConversationList, setActiveConversation, activeConversationId } =
    useAIChatStore();

  const handleNewConversation = () => {
    setActiveConversation(null);
  };

  const handleOpenFullPage = () => {
    if (activeConversationId) {
      navigate(aiChatConversationPath(activeConversationId));
    } else {
      navigate(AI_CHAT_BASE_PATH);
    }
    closePanel();
  };

  return (
    <div className="flex items-center justify-between border-b p-4">
      <div className="flex items-center gap-2">
        <Sparkles className="text-primary h-5 w-5" />
        <h2 className="font-semibold">{t("aiChat.title")}</h2>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={toggleConversationList}
          className="hover:bg-muted rounded-md p-2 transition-colors"
          title={t("aiChat.actions.conversationList")}
        >
          <ClipboardList className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={handleNewConversation}
          className="hover:bg-muted rounded-md p-2 transition-colors"
          title={t("aiChat.actions.newConversation")}
        >
          <Plus className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={handleOpenFullPage}
          className="hover:bg-muted rounded-md p-2 transition-colors"
          title={t("aiChat.actions.openInPage", "Open in full page")}
        >
          <Maximize2 className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={closePanel}
          className="hover:bg-muted rounded-md p-2 transition-colors"
          title={t("aiChat.actions.close")}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
