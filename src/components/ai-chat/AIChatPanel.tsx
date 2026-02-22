import React, { useEffect, useCallback } from 'react';
import { AIChatHeader } from './AIChatHeader';
import { AIChatInput } from './AIChatInput';
import { AIChatMessages } from './AIChatMessages';
import { AIChatContextBar } from './AIChatContextBar';
import { AIChatConversationList } from './AIChatConversationList';
import { useAIChatStore } from '../../stores/aiChatStore';
import { useAIChatContext } from '../../contexts/AIChatContext';
import { useAIChat } from '../../hooks/useAIChat';
import { useAIChatConversations } from '../../hooks/useAIChatConversations';
import { ChatAction, CreatePageAction, CreateMultiplePagesAction } from '../../types/aiChat';
import { useCreatePage } from '../../hooks/usePageQueries';
import { useNavigate } from 'react-router-dom';

export function AIChatPanel() {
  const { isOpen, activeConversationId, setActiveConversation, contextEnabled, showConversationList } = useAIChatStore();
  const { pageContext } = useAIChatContext();
  const navigate = useNavigate();
  const createPageMutation = useCreatePage();
  const {
    conversations,
    createConversation,
    updateConversation,
    deleteConversation,
    getConversation,
  } = useAIChatConversations();

  const {
    messages,
    sendMessage,
    stopStreaming,
    clearMessages,
    loadMessages,
  } = useAIChat({
    pageContext,
    contextEnabled,
  });

  // アクティブな会話の変更時にメッセージを読み込み
  useEffect(() => {
    if (activeConversationId) {
      const conv = getConversation(activeConversationId);
      if (conv) {
        loadMessages(conv.messages);
      }
    } else {
      clearMessages();
    }
  }, [activeConversationId, getConversation, loadMessages, clearMessages]);

  // メッセージ変更時に会話を保存
  useEffect(() => {
    if (activeConversationId && messages.length > 0) {
      updateConversation(activeConversationId, messages);
    }
  }, [messages, activeConversationId, updateConversation]);

  const handleSendMessage = useCallback((content: string) => {
    // 現在の会話がない場合は新規作成
    if (!activeConversationId) {
      const newConv = createConversation(
        pageContext
          ? { type: pageContext.type, pageId: pageContext.pageId, pageTitle: pageContext.pageTitle }
          : undefined
      );
      setActiveConversation(newConv.id);
    }
    sendMessage(content);
  }, [activeConversationId, createConversation, pageContext, setActiveConversation, sendMessage]);

  const handleSelectConversation = useCallback((id: string) => {
    setActiveConversation(id);
  }, [setActiveConversation]);

  const handleDeleteConversation = useCallback((id: string) => {
    deleteConversation(id);
    if (activeConversationId === id) {
      setActiveConversation(null);
      clearMessages();
    }
  }, [activeConversationId, deleteConversation, setActiveConversation, clearMessages]);

  const handleExecuteAction = useCallback(async (action: ChatAction) => {
    try {
      if (action.type === 'create-page') {
        const pageAction = action as CreatePageAction;
        const result = await createPageMutation.mutateAsync({
          title: pageAction.title,
          content: pageAction.content,
        });
        if (result?.id) {
          navigate(`/page/${result.id}`);
        }
      } else if (action.type === 'create-multiple-pages') {
        const multiAction = action as CreateMultiplePagesAction;
        for (const page of multiAction.pages) {
          await createPageMutation.mutateAsync({
            title: page.title,
            content: page.content,
          });
        }
      }
    } catch (err) {
      console.error('Failed to execute action:', err);
    }
  }, [createPageMutation, navigate]);

  if (!isOpen) return null;

  return (
    <div className="relative flex flex-col h-full bg-background border-l">
      <AIChatHeader />
      <AIChatContextBar />
      
      {showConversationList && (
        <AIChatConversationList
          conversations={conversations}
          onSelect={handleSelectConversation}
          onDelete={handleDeleteConversation}
        />
      )}
      
      <AIChatMessages 
        messages={messages} 
        onSuggestionClick={handleSendMessage}
        onExecuteAction={handleExecuteAction}
      />

      <div className="p-4 border-t bg-background">
        <AIChatInput 
          onSendMessage={handleSendMessage}
          onStopStreaming={stopStreaming}
        />
      </div>
    </div>
  );
}
