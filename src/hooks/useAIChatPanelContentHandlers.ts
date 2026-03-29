import { useCallback, useState } from "react";
import type { AIChatViewTab } from "@/components/ai-chat/AIChatViewTabs";
import type {
  Conversation,
  MessageMap,
  PageContext,
  PageContextSnapshot,
  ReferencedPage,
  TreeChatMessage,
} from "@/types/aiChat";

type UseAIChatPanelContentHandlersParams = {
  activeConversationId: string | null;
  setActiveConversation: (id: string | null) => void;
  pageContext: PageContext | null;
  createConversation: (pageContext?: PageContextSnapshot) => Conversation;
  sendMessage: (content: string, referencedPages?: ReferencedPage[]) => void | Promise<void>;
  deleteConversation: (id: string) => void;
  clearMessages: () => void;
  editAndResend: (messageId: string, newContent: string) => void | Promise<void>;
  navigateToNode: (nodeId: string) => void;
  setBranchPoint: (nodeId: string) => void;
  prepareBranchFromUserMessage: (userMessageId: string) => string;
  messageMap: MessageMap;
  deleteBranch: (nodeId: string) => void;
};

/**
 * Event handlers and branch-tab UI state for the AI chat panel content.
 * AI チャットパネル内容のイベントハンドラと分岐タブ UI 状態。
 */
export function useAIChatPanelContentHandlers({
  activeConversationId,
  setActiveConversation,
  pageContext,
  createConversation,
  sendMessage,
  deleteConversation,
  clearMessages,
  editAndResend,
  navigateToNode,
  setBranchPoint,
  prepareBranchFromUserMessage,
  messageMap,
  deleteBranch,
}: UseAIChatPanelContentHandlersParams) {
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
      const node: TreeChatMessage | undefined = messageMap[nodeId];
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

  return {
    handleSendMessage,
    handleSelectConversation,
    handleDeleteConversation,
    handleEditMessage,
    activeViewTab,
    setActiveViewTab,
    inputPrefill,
    focusEditorNonce,
    handleSelectBranch,
    handleBranchFrom,
    handleDeleteBranchFromTree,
  };
}
