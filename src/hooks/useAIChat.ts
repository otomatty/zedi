import { useState, useRef, useMemo, useEffect } from "react";
import type { ChatTreeState, PageContext } from "../types/aiChat";
import type { PageSummary } from "@/types/page";
import { useAIChatStore } from "../stores/aiChatStore";
import { emptyTree } from "./aiChatEmptyTree";
import { useAIChatMessageCallbacks } from "./useAIChatMessageCallbacks";
import { useAIChatTreeLoaders } from "./useAIChatTreeLoaders";
import { useAIChatBranchControls } from "./useAIChatBranchControls";
import { getActivePath } from "@/lib/messageTree";

interface UseAIChatOptions {
  pageContext: PageContext | null;
  contextEnabled: boolean;
  existingPageTitles?: string[];
  availablePages?: Pick<PageSummary, "id" | "title" | "isDeleted">[];
}

/**
 * AI chat state with branched transcript (tree) and active path for display.
 * 分岐付き会話ツリーと表示用アクティブパスを持つ AI チャット状態。
 */
export function useAIChat({
  pageContext,
  contextEnabled,
  existingPageTitles = [],
  availablePages,
}: UseAIChatOptions) {
  const [tree, setTree] = useState<ChatTreeState>(emptyTree);
  const treeRef = useRef(tree);
  useEffect(() => {
    treeRef.current = tree;
  }, [tree]);

  const [error, setError] = useState<string | null>(null);
  const { setStreaming, isStreaming } = useAIChatStore();
  const abortControllerRef = useRef<AbortController | null>(null);
  const streamingContentRef = useRef<string>("");
  /** Next send from branch tree "branch from user" uses this sibling-edit path. / ブランチツリー「ユーザーから分岐」の次回送信で使う */
  const pendingBranchFromUserIdRef = useRef<string | null>(null);

  const {
    switchBranch,
    navigateToNode,
    setBranchPoint,
    deleteBranch,
    prepareBranchFromUserMessage,
  } = useAIChatBranchControls({ treeRef, setTree, pendingBranchFromUserIdRef });

  const messages = useMemo(
    () => getActivePath(tree.messageMap, tree.activeLeafId),
    [tree.messageMap, tree.activeLeafId],
  );

  const { clearMessages, loadMessages, loadConversation } = useAIChatTreeLoaders({
    setTree,
    setError,
  });

  const { sendMessage, stopStreaming, retryLastMessage, editAndResend } = useAIChatMessageCallbacks(
    {
      pageContext,
      contextEnabled,
      existingPageTitles,
      availablePages,
      tree,
      treeRef,
      setTree,
      setError,
      setStreaming,
      streamingContentRef,
      abortControllerRef,
      pendingBranchFromUserIdRef,
    },
  );

  return {
    messages,
    messageMap: tree.messageMap,
    rootMessageId: tree.rootMessageId,
    activeLeafId: tree.activeLeafId,
    error,
    isStreaming,
    sendMessage,
    stopStreaming,
    clearMessages,
    loadMessages,
    loadConversation,
    retryLastMessage,
    editAndResend,
    switchBranch,
    navigateToNode,
    setBranchPoint,
    deleteBranch,
    prepareBranchFromUserMessage,
  };
}
