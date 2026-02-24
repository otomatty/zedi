import { Trash2, MessageSquare } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Conversation } from "../../types/aiChat";
import { useAIChatStore } from "../../stores/aiChatStore";

interface AIChatConversationListProps {
  conversations: Conversation[];
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}

export function AIChatConversationList({
  conversations,
  onSelect,
  onDelete,
}: AIChatConversationListProps) {
  const { t } = useTranslation();
  const { activeConversationId, toggleConversationList } = useAIChatStore();

  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-background duration-150 animate-in slide-in-from-left">
      {/* Header */}
      <div className="flex items-center justify-between border-b p-4">
        <h3 className="text-sm font-semibold">{t("aiChat.actions.conversationList")}</h3>
        <button
          onClick={toggleConversationList}
          className="text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          ✕
        </button>
      </div>

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto p-2">
        {conversations.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
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
                  <p className="text-xs text-muted-foreground">
                    {new Date(conv.updatedAt).toLocaleDateString()}
                  </p>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(conv.id);
                  }}
                  className="rounded p-1 opacity-0 transition-all hover:bg-destructive/10 group-hover:opacity-100"
                  title="削除"
                >
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
