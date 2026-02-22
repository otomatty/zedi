import React from 'react';
import { Paperclip, ToggleLeft, ToggleRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAIChatStore } from '../../stores/aiChatStore';
import { useAIChatContext } from '../../contexts/AIChatContext';

export function AIChatContextBar() {
  const { t } = useTranslation();
  const { contextEnabled, toggleContext } = useAIChatStore();
  const { pageContext } = useAIChatContext();

  if (pageContext?.type !== 'editor' || !pageContext.pageTitle) {
    return null;
  }

  return (
    <div className="flex items-center justify-between px-3 py-2 bg-muted/50 border-b text-xs text-muted-foreground">
      <div className="flex items-center gap-1.5 truncate">
        <Paperclip className="w-3.5 h-3.5 shrink-0" />
        <span className="truncate">
          {t('aiChat.context.referencing', { title: pageContext.pageTitle })}
        </span>
      </div>
      
      <button
        onClick={toggleContext}
        className="flex items-center gap-1 hover:text-foreground transition-colors shrink-0 ml-2"
        title={contextEnabled ? 'コンテキストを無効化' : 'コンテキストを有効化'}
      >
        {contextEnabled ? (
          <ToggleRight className="w-4 h-4 text-primary" />
        ) : (
          <ToggleLeft className="w-4 h-4" />
        )}
      </button>
    </div>
  );
}
