import { useEffect, useCallback, useRef } from "react";
import { AIChatHeader } from "./AIChatHeader";
import { AIChatInput } from "./AIChatInput";
import { AIChatMessages } from "./AIChatMessages";
import { AIChatContextBar } from "./AIChatContextBar";
import { AIChatConversationList } from "./AIChatConversationList";
import { useAIChatStore } from "../../stores/aiChatStore";
import { useAIChatContext } from "../../contexts/AIChatContext";
import { useAIChat } from "../../hooks/useAIChat";
import { useAIChatConversations } from "../../hooks/useAIChatConversations";
import {
  ChatAction,
  CreatePageAction,
  CreateMultiplePagesAction,
  ReferencedPage,
} from "../../types/aiChat";
import { useCreatePage } from "../../hooks/usePageQueries";
import { useNavigate } from "react-router-dom";

export function AIChatPanel() {
  const {
    isOpen,
    activeConversationId,
    setActiveConversation,
    contextEnabled,
    showConversationList,
  } = useAIChatStore();
  const { pageContext } = useAIChatContext();
  const navigate = useNavigate();
  const createPageMutation = useCreatePage();
  const {
    createConversation,
    updateConversation,
    deleteConversation,
    getConversation,
    getConversationsForPage,
  } = useAIChatConversations();

  // 現在のページに紐付いた会話一覧
  const pageConversations = getConversationsForPage(pageContext?.pageId, pageContext?.type);

  const { messages, sendMessage, stopStreaming, clearMessages, loadMessages } = useAIChat({
    pageContext,
    contextEnabled,
  });

  // ページ切り替え検知: pageId が変わったら会話をリセットして新規チャット画面にする
  const prevPageKeyRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    const currentKey = pageContext?.pageId ?? pageContext?.type ?? undefined;
    if (prevPageKeyRef.current !== undefined && currentKey !== prevPageKeyRef.current) {
      setActiveConversation(null);
      clearMessages();
    }
    prevPageKeyRef.current = currentKey;
  }, [pageContext?.pageId, pageContext?.type, setActiveConversation, clearMessages]);

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

  const handleSendMessage = useCallback(
    (content: string, referencedPages: ReferencedPage[] = []) => {
      // 現在の会話がない場合は新規作成
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

  const handleExecuteAction = useCallback(
    async (action: ChatAction) => {
      try {
        if (action.type === "create-page") {
          const pageAction = action as CreatePageAction;
          const result = await createPageMutation.mutateAsync({
            title: pageAction.title,
            content: pageAction.content,
          });
          if (result?.id) {
            navigate(`/page/${result.id}`);
          }
        } else if (action.type === "create-multiple-pages") {
          const multiAction = action as CreateMultiplePagesAction;
          for (const page of multiAction.pages) {
            await createPageMutation.mutateAsync({
              title: page.title,
              content: page.content,
            });
          }
        }
      } catch (err) {
        console.error("Failed to execute action:", err);
      }
    },
    [createPageMutation, navigate],
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
      />

      <div className="border-t bg-background p-4">
        <AIChatInput onSendMessage={handleSendMessage} onStopStreaming={stopStreaming} />
      </div>
    </div>
  );
}
