import { Suspense, lazy, useCallback, useMemo, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import Container from "@/components/layout/Container";
import { AIChatMessages } from "@/components/ai-chat/AIChatMessages";
import { AIChatInput } from "@/components/ai-chat/AIChatInput";
import { AIChatViewTabs, type AIChatViewTab } from "@/components/ai-chat/AIChatViewTabs";
import { PromoteToWikiDialog } from "@/components/ai-chat/PromoteToWikiDialog";
import { usePromoteToWiki } from "@/hooks/usePromoteToWiki";

const AIChatBranchTree = lazy(() =>
  import("@/components/ai-chat/AIChatBranchTree").then((m) => ({ default: m.AIChatBranchTree })),
);
import { useAIChatConversations } from "@/hooks/useAIChatConversations";
import { useAIChatStore } from "@/stores/aiChatStore";
import { useAIChat } from "@/hooks/useAIChat";
import { useAIChatActions } from "@/hooks/useAIChatActions";
import { usePagesSummary } from "@/hooks/usePageQueries";
import type { ReferencedPage } from "@/types/aiChat";
import { useAIChatDetailLifecycle } from "./useAIChatDetailLifecycle";

/**
 * Full-page AI chat for a single conversation (`/ai/:conversationId`).
 * Messages fill available height and scroll; input is pinned to the bottom.
 * 会話詳細ページ（`/ai/:conversationId`）。メッセージは残り高さでスクロール、入力欄は下端固定。
 */
// eslint-disable-next-line max-lines-per-function -- full-page chat with branch/workflow tabs
export default function AIChatDetail() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { getConversation, updateConversation } = useAIChatConversations();
  const { setActiveConversation } = useAIChatStore();
  const { data: pages = [] } = usePagesSummary();

  const existingPageTitles = useMemo(
    () =>
      pages
        .filter((page) => !page.isDeleted && page.title.trim().length > 0)
        .map((page) => page.title.trim()),
    [pages],
  );

  const conversation = conversationId ? getConversation(conversationId) : undefined;

  const { handleExecuteAction } = useAIChatActions({ pageContext: null });

  const {
    messages,
    messageMap,
    rootMessageId,
    activeLeafId,
    sendMessage,
    stopStreaming,
    loadConversation,
    clearMessages,
    editAndResend,
    switchBranch,
    navigateToNode,
    setBranchPoint,
    deleteBranch,
    prepareBranchFromUserMessage,
    isStreaming,
  } = useAIChat({
    pageContext: null,
    contextEnabled: false,
    existingPageTitles,
    availablePages: pages,
  });

  useAIChatDetailLifecycle({
    conversationId,
    conversation,
    location,
    navigate,
    setActiveConversation,
    sendMessage,
    loadConversation,
    clearMessages,
    updateConversation,
    messages,
    messageMap,
    rootMessageId,
    activeLeafId,
  });

  const handleSendMessage = useCallback(
    (content: string, referencedPages: ReferencedPage[] = []) => {
      sendMessage(content, referencedPages);
    },
    [sendMessage],
  );

  const handleEditMessage = useCallback(
    (messageId: string, newContent: string) => {
      editAndResend(messageId, newContent);
    },
    [editAndResend],
  );

  const promote = usePromoteToWiki(messages);

  const [activeViewTab, setActiveViewTab] = useState<AIChatViewTab>("chat");
  const [inputPrefill, setInputPrefill] = useState<{ nonce: number; text: string } | null>(null);
  const [focusEditorNonce, setFocusEditorNonce] = useState(0);

  const handleSelectBranch = useCallback(
    (leafId: string) => {
      navigateToNode(leafId);
      setActiveViewTab("chat");
    },
    [navigateToNode],
  );

  const handleBranchFrom = useCallback(
    (nodeId: string) => {
      const node = messageMap[nodeId];
      if (!node) return;
      setBranchPoint(nodeId);
      if (node.role === "user") {
        const text = prepareBranchFromUserMessage(nodeId);
        setInputPrefill({ nonce: Date.now(), text });
      } else {
        setInputPrefill(null);
        setFocusEditorNonce((n) => n + 1);
      }
      setActiveViewTab("chat");
    },
    [messageMap, prepareBranchFromUserMessage, setBranchPoint],
  );

  const handleDeleteBranchFromTree = useCallback(
    (nodeId: string) => {
      deleteBranch(nodeId);
    },
    [deleteBranch],
  );

  return (
    <>
      {/* Fill the AppLayout main area (already below header). flex-1 + min-h-0 prevents page-level scroll.
          AppLayout のメイン領域を埋める（ヘッダー下の高さは親が保証）。メッセージのみスクロール。 */}
      <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col">
        <div className="border-border shrink-0 border-b px-4 py-2">
          <AIChatViewTabs activeTab={activeViewTab} onTabChange={setActiveViewTab} />
        </div>

        {/* Messages or branch tree: flex-1 + min-h-0 gives bounded height for internal scroll */}
        <div className="min-h-0 flex-1">
          {activeViewTab === "chat" ? (
            <AIChatMessages
              className="mx-auto h-full max-w-4xl px-4 pt-4 sm:px-6 md:px-8"
              messages={messages}
              messageMap={messageMap}
              onSuggestionClick={handleSendMessage}
              onExecuteAction={handleExecuteAction}
              onEditMessage={handleEditMessage}
              onPromoteToWiki={promote.handlePromote}
              onSwitchBranch={switchBranch}
              isStreaming={isStreaming}
            />
          ) : (
            <Suspense fallback={null}>
              <AIChatBranchTree
                messageMap={messageMap}
                rootMessageId={rootMessageId}
                activeLeafId={activeLeafId}
                onSelectBranch={handleSelectBranch}
                onBranchFrom={handleBranchFrom}
                onDeleteBranch={handleDeleteBranchFromTree}
              />
            </Suspense>
          )}
        </div>

        {/* Input pinned to bottom / 入力欄は下端固定 */}
        <div className="bg-background border-border shrink-0 border-t p-4">
          <Container>
            <AIChatInput
              onSendMessage={handleSendMessage}
              onStopStreaming={stopStreaming}
              prefillText={inputPrefill?.text}
              prefillNonce={inputPrefill?.nonce}
              focusEditorNonce={focusEditorNonce}
            />
          </Container>
        </div>
      </div>
      <PromoteToWikiDialog
        open={promote.open}
        onClose={promote.close}
        conversationText={promote.conversationText}
        existingTitles={existingPageTitles}
        conversationId={conversationId}
      />
    </>
  );
}
