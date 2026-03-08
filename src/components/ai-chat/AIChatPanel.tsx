import { useEffect, useCallback, useMemo, useRef } from "react";
import { AIChatHeader } from "./AIChatHeader";
import { AIChatInput } from "./AIChatInput";
import { AIChatMessages } from "./AIChatMessages";
import { AIChatContextBar } from "./AIChatContextBar";
import { AIChatConversationList } from "./AIChatConversationList";
import { useAIChatStore } from "../../stores/aiChatStore";
import { useAIChatContext } from "../../contexts/AIChatContext";
import { useAIChat } from "../../hooks/useAIChat";
import { useAIChatActions } from "../../hooks/useAIChatActions";
import { useAIChatConversations } from "../../hooks/useAIChatConversations";
import type { ReferencedPage } from "../../types/aiChat";
import { usePagesSummary } from "../../hooks/usePageQueries";

export function AIChatPanel() {
  const {
    isOpen,
    activeConversationId,
    setActiveConversation,
    contextEnabled,
    showConversationList,
  } = useAIChatStore();
  const { pageContext } = useAIChatContext();
  const { data: pages = [] } = usePagesSummary();
  const {
    createConversation,
    updateConversation,
    deleteConversation,
    getConversation,
    getConversationsForPage,
  } = useAIChatConversations();

  const pageConversations = getConversationsForPage(pageContext?.pageId, pageContext?.type);
  const existingPageTitles = useMemo(
    () =>
      pages
        .filter((page) => !page.isDeleted && page.title.trim().length > 0)
        .map((page) => page.title.trim()),
    [pages],
  );

  const { handleExecuteAction } = useAIChatActions({ pageContext });

  const {
    messages,
    sendMessage,
    stopStreaming,
    clearMessages,
    loadMessages,
    editAndResend,
    isStreaming,
  } = useAIChat({
    pageContext,
    contextEnabled,
    existingPageTitles,
    availablePages: pages,
  });

  const prevPageKeyRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    const currentKey = pageContext?.pageId ?? pageContext?.type ?? undefined;
    if (prevPageKeyRef.current !== undefined && currentKey !== prevPageKeyRef.current) {
      setActiveConversation(null);
      clearMessages();
    }
    prevPageKeyRef.current = currentKey;
  }, [pageContext?.pageId, pageContext?.type, setActiveConversation, clearMessages]);

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

  useEffect(() => {
    if (activeConversationId && messages.length > 0) {
      updateConversation(activeConversationId, messages);
    }
  }, [messages, activeConversationId, updateConversation]);

  const handleSendMessage = useCallback(
    (content: string, referencedPages: ReferencedPage[] = []) => {
      if (!activeConversationId) {
        const newConv = createConversation(
          pageContext
            ? {
                type: pageContext.type,
                pageId: pageContext.pageId,
                pageTitle: pageContext.pageTitle,
              }
            : undefined,
        );
        setActiveConversation(newConv.id);
      }
      sendMessage(content, referencedPages);
    },
    [activeConversationId, createConversation, pageContext, setActiveConversation, sendMessage],
  );

  const handleSelectConversation = useCallback(
    (id: string) => {
      setActiveConversation(id);
    },
    [setActiveConversation],
  );

  const handleDeleteConversation = useCallback(
    (id: string) => {
      deleteConversation(id);
      if (activeConversationId === id) {
        setActiveConversation(null);
        clearMessages();
      }
    },
    [activeConversationId, deleteConversation, setActiveConversation, clearMessages],
  );

  const handleEditMessage = useCallback(
    (messageId: string, newContent: string) => {
      editAndResend(messageId, newContent);
    },
    [editAndResend],
  );

  if (!isOpen) return null;

  return (
    <div className="relative flex h-full flex-col border-l bg-background">
      <AIChatHeader />
      <AIChatContextBar />

      {showConversationList && (
        <AIChatConversationList
          conversations={pageConversations}
          onSelect={handleSelectConversation}
          onDelete={handleDeleteConversation}
        />
      )}

      <AIChatMessages
        messages={messages}
        onSuggestionClick={handleSendMessage}
        onExecuteAction={handleExecuteAction}
        onEditMessage={handleEditMessage}
        isStreaming={isStreaming}
      />

      <div className="border-t bg-background p-4">
        <AIChatInput onSendMessage={handleSendMessage} onStopStreaming={stopStreaming} />
      </div>
    </div>
  );
}
