import { Trash2, MessageSquare } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Conversation } from "../../types/aiChat";
import { useAIChatStore } from "../../stores/aiChatStore";

interface AIChatConversationListProps {
  conversations: Conversation[];
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}

/**
 *
 */
export function AIChatConversationList({
  conversations,
  onSelect,
  onDelete,
}: AIChatConversationListProps) {
  /**
   *
   */
  const { t } = useTranslation();
  /**
   *
   */
  const { activeConversationId, toggleConversationList } = useAIChatStore();

  return (
    <div className="bg-background animate-in slide-in-from-left absolute inset-0 z-10 flex flex-col duration-150">
      {/* Header */}
      <div className="flex items-center justify-between border-b p-4">
        <h3 className="text-sm font-semibold">{t("aiChat.actions.conversationList")}</h3>
        <button
          onClick={toggleConversationList}
          className="text-muted-foreground hover:text-foreground text-xs transition-colors"
        >
          ✕
        </button>
      </div>

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto p-2">
        {conversations.length === 0 ? (
          <div className="text-muted-foreground py-8 text-center text-sm">
            {t("aiChat.empty.pageConversations")}
          </div>
        ) : (
          <div className="space-y-1">
            {conversations.map((conv) => (
              <div
                key={conv.id}
                className={`group flex cursor-pointer items-center gap-2 rounded-lg p-3 transition-colors ${
                  activeConversationId === conv.id ? "bg-primary/10 text-primary" : "hover:bg-muted"
                }`}
                onClick={() => {
                  onSelect(conv.id);
                  toggleConversationList();
                }}
              >
                <MessageSquare className="h-4 w-4 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{conv.title || "新しい会話"}</p>
                  <p className="text-muted-foreground text-xs">
                    {new Date(conv.updatedAt).toLocaleDateString()}
                  </p>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(conv.id);
                  }}
                  className="hover:bg-destructive/10 rounded p-1 opacity-0 transition-all group-hover:opacity-100"
                  title="削除"
                >
                  <Trash2 className="text-destructive h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
