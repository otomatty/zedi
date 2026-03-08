import { useEffect, useCallback, useMemo, useRef } from "react";
import { AIChatHeader } from "./AIChatHeader";
import { AIChatInput } from "./AIChatInput";
import { AIChatMessages } from "./AIChatMessages";
import { AIChatContextBar } from "./AIChatContextBar";
import { AIChatConversationList } from "./AIChatConversationList";
import { useTranslation } from "react-i18next";
import { useToast } from "@zedi/ui";
import { useAIChatStore } from "../../stores/aiChatStore";
import { useAIChatContext } from "../../contexts/AIChatContext";
import { useAIChat } from "../../hooks/useAIChat";
import { useAIChatConversations } from "../../hooks/useAIChatConversations";
import {
  AppendToPageAction,
  ChatAction,
  CreatePageAction,
  CreateMultiplePagesAction,
  ReferencedPage,
  SuggestWikiLinksAction,
} from "../../types/aiChat";
import {
  useCreatePage,
  usePagesSummary,
  useSyncWikiLinks,
  useUpdatePage,
} from "../../hooks/usePageQueries";
import {
  appendMarkdownToTiptapContent,
  buildSuggestedWikiLinksMarkdown,
  getMissingSuggestedWikiLinkTitles,
  normalizePageTitle,
} from "../../lib/aiChatActionHelpers";
import { extractWikiLinksFromContent } from "../../lib/wikiLinkUtils";
import { useNavigate } from "react-router-dom";

export function AIChatPanel() {
  const { t } = useTranslation();
  const { toast } = useToast();
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
  const updatePageMutation = useUpdatePage();
  const { syncLinks } = useSyncWikiLinks();
  const { data: pages = [] } = usePagesSummary();
  const {
    createConversation,
    updateConversation,
    deleteConversation,
    getConversation,
    getConversationsForPage,
  } = useAIChatConversations();

  // 現在のページに紐付いた会話一覧
  const pageConversations = getConversationsForPage(pageContext?.pageId, pageContext?.type);
  const existingPageTitles = useMemo(
    () =>
      pages
        .filter((page) => !page.isDeleted && page.title.trim().length > 0)
        .map((page) => page.title.trim()),
    [pages],
  );
  const latestPageContentRef = useRef(pageContext?.pageFullContent ?? "");

  useEffect(() => {
    latestPageContentRef.current = pageContext?.pageFullContent ?? "";
  }, [pageContext?.pageFullContent]);

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

  const handleEditMessage = useCallback(
    (messageId: string, newContent: string) => {
      editAndResend(messageId, newContent);
    },
    [editAndResend],
  );

  const appendContentToCurrentPage = useCallback(
    async (markdown: string) => {
      const currentPageId = pageContext?.pageId;
      if (!currentPageId) return false;

      const nextContent = appendMarkdownToTiptapContent(latestPageContentRef.current, markdown);
      await updatePageMutation.mutateAsync({
        pageId: currentPageId,
        updates: { content: nextContent },
      });
      await syncLinks(currentPageId, extractWikiLinksFromContent(nextContent));
      latestPageContentRef.current = nextContent;
      return true;
    },
    [pageContext, syncLinks, updatePageMutation],
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
        } else if (action.type === "append-to-page") {
          const appendAction = action as AppendToPageAction;
          const currentPageTitle = pageContext?.pageTitle ?? "";

          if (!pageContext?.pageId) {
            toast({
              title: t("aiChat.notifications.pageContextRequired"),
              variant: "destructive",
            });
            return;
          }

          if (normalizePageTitle(appendAction.pageTitle) !== normalizePageTitle(currentPageTitle)) {
            toast({
              title: t("aiChat.notifications.appendUnavailable"),
              variant: "destructive",
            });
            return;
          }

          await appendContentToCurrentPage(appendAction.content);
          toast({
            title: t("aiChat.notifications.appendSuccess", { title: appendAction.pageTitle }),
          });
        } else if (action.type === "suggest-wiki-links") {
          const wikiLinkAction = action as SuggestWikiLinksAction;

          if (!pageContext?.pageId) {
            toast({
              title: t("aiChat.notifications.pageContextRequired"),
              variant: "destructive",
            });
            return;
          }

          const targetTitles = wikiLinkAction.links
            .map((link) => link.existingPageTitle ?? link.keyword)
            .map((title) => title.trim())
            .filter(Boolean);
          const missingTitles = getMissingSuggestedWikiLinkTitles(
            latestPageContentRef.current,
            targetTitles,
          );

          if (missingTitles.length === 0) {
            toast({ title: t("aiChat.notifications.noNewWikiLinks") });
            return;
          }

          await appendContentToCurrentPage(buildSuggestedWikiLinksMarkdown(missingTitles));
          toast({
            title: t("aiChat.notifications.wikiLinksAdded", { count: missingTitles.length }),
          });
        }
      } catch (err) {
        console.error("Failed to execute action:", err);
        toast({
          title: t("aiChat.notifications.actionFailed"),
          variant: "destructive",
        });
      }
    },
    [appendContentToCurrentPage, createPageMutation, navigate, pageContext, t, toast],
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
