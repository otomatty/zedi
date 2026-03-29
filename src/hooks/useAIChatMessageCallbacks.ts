import { useCallback, type Dispatch, type RefObject, type SetStateAction } from "react";
import type { ChatTreeState, PageContext, ReferencedPage } from "../types/aiChat";
import type { PageSummary } from "@/types/page";
import { resolveReferencedPagesFromContent } from "@/lib/aiChatActionHelpers";
import { getActivePath, patchMessageInTree } from "@/lib/messageTree";
import { executeRegenerateAssistant, executeSendMessage } from "./useAIChatExecute";

/**
 * Inputs for {@link useAIChatMessageCallbacks} (refs and setters wired from {@link useAIChat}).
 * {@link useAIChatMessageCallbacks} の入力（{@link useAIChat} から渡す ref と setter）。
 */
export type UseAIChatMessageCallbacksParams = {
  pageContext: PageContext | null;
  contextEnabled: boolean;
  existingPageTitles: string[];
  availablePages?: Pick<PageSummary, "id" | "title" | "isDeleted">[];
  tree: ChatTreeState;
  treeRef: RefObject<ChatTreeState>;
  setTree: Dispatch<SetStateAction<ChatTreeState>>;
  setError: (value: string | null) => void;
  setStreaming: (streaming: boolean) => void;
  streamingContentRef: RefObject<string>;
  abortControllerRef: RefObject<AbortController | null>;
  pendingBranchFromUserIdRef: RefObject<string | null>;
};

/**
 * Send, regenerate, stop, retry, and edit-and-resend for the AI chat tree.
 * AI チャットツリー向けの送信・再生成・停止・再試行・編集再送。
 */
export function useAIChatMessageCallbacks({
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
}: UseAIChatMessageCallbacksParams) {
  const sendMessage = useCallback(
    async (
      content: string,
      messageRefs: ReferencedPage[] = [],
      options?: { branchFromUserMessageId?: string },
    ) => {
      const branchFromUserMessageId =
        options?.branchFromUserMessageId ?? pendingBranchFromUserIdRef.current ?? undefined;
      try {
        await executeSendMessage({
          content,
          messageRefs,
          pageContext,
          contextEnabled,
          existingPageTitles,
          setError,
          setStreaming,
          streamingContentRef,
          abortControllerRef,
          treeRef,
          setTree,
          branchFromUserMessageId,
        });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Unknown error";
        setError(errorMessage);
        setStreaming(false);
      } finally {
        pendingBranchFromUserIdRef.current = null;
      }
    },
    [
      pageContext,
      contextEnabled,
      existingPageTitles,
      setStreaming,
      setError,
      pendingBranchFromUserIdRef,
      treeRef,
      setTree,
      streamingContentRef,
      abortControllerRef,
    ],
  );

  const regenerateResponse = useCallback(
    async (assistantMessageId: string) => {
      try {
        await executeRegenerateAssistant({
          assistantMessageId,
          pageContext,
          contextEnabled,
          existingPageTitles,
          setError,
          setStreaming,
          streamingContentRef,
          abortControllerRef,
          treeRef,
          setTree,
        });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Unknown error";
        setError(errorMessage);
        setStreaming(false);
      }
    },
    [
      pageContext,
      contextEnabled,
      existingPageTitles,
      setStreaming,
      setError,
      treeRef,
      setTree,
      streamingContentRef,
      abortControllerRef,
    ],
  );

  const stopStreaming = useCallback(() => {
    abortControllerRef.current?.abort();
    setStreaming(false);
    setTree((prev) => {
      const leaf = prev.activeLeafId;
      if (!leaf) return prev;
      const node = prev.messageMap[leaf];
      if (!node?.isStreaming) return prev;
      return {
        ...prev,
        messageMap: patchMessageInTree(prev.messageMap, leaf, {
          isStreaming: false,
          content: streamingContentRef.current,
        }),
      };
    });
  }, [setStreaming, setTree, streamingContentRef, abortControllerRef]);

  const retryLastMessage = useCallback(() => {
    const path = getActivePath(tree.messageMap, tree.activeLeafId);
    const last = path[path.length - 1];
    if (last?.role === "assistant" && last.error) {
      void regenerateResponse(last.id);
      return;
    }
    const lastUserMsg = [...path].reverse().find((m) => m.role === "user");
    if (lastUserMsg) {
      void sendMessage(lastUserMsg.content, lastUserMsg.referencedPages ?? []);
    }
  }, [tree.messageMap, tree.activeLeafId, regenerateResponse, sendMessage]);

  /**
   * Edit a user message and send as a sibling branch (previous branch kept in the map).
   * ユーザーメッセージを編集し兄弟ブランチとして送信（以前のブランチはマップに保持）。
   */
  const editAndResend = useCallback(
    async (messageId: string, newContent: string) => {
      const message = tree.messageMap[messageId];
      if (!message || message.role !== "user") return;
      const refs =
        availablePages == null
          ? (message.referencedPages ?? [])
          : resolveReferencedPagesFromContent(newContent, availablePages);
      await sendMessage(newContent, refs, { branchFromUserMessageId: messageId });
    },
    [availablePages, sendMessage, tree.messageMap],
  );

  return {
    sendMessage,
    regenerateResponse,
    stopStreaming,
    retryLastMessage,
    editAndResend,
  };
}
