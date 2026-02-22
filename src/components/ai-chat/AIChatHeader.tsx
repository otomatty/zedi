import React from 'react';
import { Sparkles, ClipboardList, Plus, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAIChatStore } from '../../stores/aiChatStore';

export function AIChatHeader() {
  const { t } = useTranslation();
  const { closePanel, toggleConversationList, setActiveConversation } = useAIChatStore();

  const handleNewConversation = () => {
    setActiveConversation(null);
  };

  return (
    <div className="flex items-center justify-between p-4 border-b">
      <div className="flex items-center gap-2">
        <Sparkles className="w-5 h-5 text-primary" />
        <h2 className="font-semibold">{t('aiChat.title')}</h2>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={toggleConversationList}
          className="p-2 hover:bg-muted rounded-md transition-colors"
          title={t('aiChat.actions.conversationList')}
        >
          <ClipboardList className="w-4 h-4" />
        </button>
        <button
          onClick={handleNewConversation}
          className="p-2 hover:bg-muted rounded-md transition-colors"
          title={t('aiChat.actions.newConversation')}
        >
          <Plus className="w-4 h-4" />
        </button>
        <button
          onClick={closePanel}
          className="p-2 hover:bg-muted rounded-md transition-colors"
          title={t('aiChat.actions.close')}
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
