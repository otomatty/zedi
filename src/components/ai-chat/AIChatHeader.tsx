import { Sparkles, ClipboardList, Plus, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAIChatStore } from "../../stores/aiChatStore";

/**
 *
 */
export function AIChatHeader() {
  /**
   *
   */
  const { t } = useTranslation();
  /**
   *
   */
  const { closePanel, toggleConversationList, setActiveConversation } = useAIChatStore();

  /**
   *
   */
  const handleNewConversation = () => {
    setActiveConversation(null);
  };

  return (
    <div className="flex items-center justify-between border-b p-4">
      <div className="flex items-center gap-2">
        <Sparkles className="text-primary h-5 w-5" />
        <h2 className="font-semibold">{t("aiChat.title")}</h2>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={toggleConversationList}
          className="hover:bg-muted rounded-md p-2 transition-colors"
          title={t("aiChat.actions.conversationList")}
        >
          <ClipboardList className="h-4 w-4" />
        </button>
        <button
          onClick={handleNewConversation}
          className="hover:bg-muted rounded-md p-2 transition-colors"
          title={t("aiChat.actions.newConversation")}
        >
          <Plus className="h-4 w-4" />
        </button>
        <button
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
