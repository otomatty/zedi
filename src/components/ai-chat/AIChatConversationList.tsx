import React from 'react';
import { Trash2, MessageSquare } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Conversation } from '../../types/aiChat';
import { useAIChatStore } from '../../stores/aiChatStore';

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
    <div className="absolute inset-0 z-10 bg-background flex flex-col animate-in slide-in-from-left duration-150">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <h3 className="text-sm font-semibold">{t('aiChat.actions.conversationList')}</h3>
        <button
          onClick={toggleConversationList}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          ✕
        </button>
      </div>

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto p-2">
        {conversations.length === 0 ? (
          <div className="text-center text-muted-foreground text-sm py-8">
            {t('aiChat.empty.messages')}
          </div>
        ) : (
          <div className="space-y-1">
            {conversations.map((conv) => (
              <div
                key={conv.id}
                className={`group flex items-center gap-2 p-3 rounded-lg cursor-pointer transition-colors ${
                  activeConversationId === conv.id
                    ? 'bg-primary/10 text-primary'
                    : 'hover:bg-muted'
                }`}
                onClick={() => {
                  onSelect(conv.id);
                  toggleConversationList();
                }}
              >
                <MessageSquare className="w-4 h-4 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate font-medium">
                    {conv.title || '新しい会話'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(conv.updatedAt).toLocaleDateString()}
                  </p>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(conv.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1 hover:bg-destructive/10 rounded transition-all"
                  title="削除"
                >
                  <Trash2 className="w-3.5 h-3.5 text-destructive" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
