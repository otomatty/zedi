import { useEffect, useRef } from "react";
import type { Location, NavigateFunction } from "react-router-dom";
import type { ChatMessage, Conversation, MessageMap, ReferencedPage } from "@/types/aiChat";
import type { ConversationTreeUpdate } from "@/hooks/useAIChatConversations";
import { AI_CHAT_BASE_PATH, aiChatInitialExecutedStorageKey } from "@/constants/aiChatSidebar";
import {
  clearPendingInitialPayload,
  hasPendingLandingPayload,
  readPendingInitialPayload,
} from "@/lib/aiChatDetailLandingPayload";

type UseAIChatDetailLifecycleParams = {
  conversationId: string | undefined;
  conversation: Conversation | undefined;
  location: Location;
  navigate: NavigateFunction;
  setActiveConversation: (id: string | null) => void;
  sendMessage: (content: string, refs?: ReferencedPage[]) => void | Promise<void>;
  loadConversation: (c: Conversation) => void;
  clearMessages: () => void;
  updateConversation: (id: string, tree: ConversationTreeUpdate) => void;
  messages: ChatMessage[];
  messageMap: MessageMap;
  rootMessageId: string | null;
  activeLeafId: string | null;
};

/**
 * Side effects for `/ai/:id`: active conversation, redirect, load/persist, landing first message.
 * `/ai/:id` の副作用（アクティブ会話、リダイレクト、読込／永続、ランディング初回送信）。
 */
export function useAIChatDetailLifecycle({
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
}: UseAIChatDetailLifecycleParams): void {
  const initialMessageHandledRef = useRef(false);
  const prevLoadedConversationIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!conversationId) {
      navigate(AI_CHAT_BASE_PATH, { replace: true });
      return;
    }
    setActiveConversation(conversationId);
    return () => setActiveConversation(null);
  }, [conversationId, setActiveConversation, navigate]);

  /**
   * Redirect to `/ai` when the conversation no longer exists (deleted or invalid URL).
   * Skip while a landing payload is pending (new conversation not yet persisted).
   * 会話が存在しない（削除 or 無効 URL）場合 `/ai` へリダイレクト。ランディング初回送信待ちの間はスキップ。
   */
  useEffect(() => {
    if (!conversationId || conversation) return;
    if (hasPendingLandingPayload(conversationId, location.state)) return;
    navigate(AI_CHAT_BASE_PATH, { replace: true });
  }, [conversationId, conversation, location.state, navigate]);

  /** Reset in-component guard when switching conversations. / 会話切替時に ref をリセット */
  useEffect(() => {
    initialMessageHandledRef.current = false;
    prevLoadedConversationIdRef.current = undefined;
  }, [conversationId]);

  /**
   * Load persisted tree only when switching conversations. Local state is authoritative for the
   * current conversation — the persist effect syncs it to the store.
   * 会話切替時だけ永続から読む。同一会話中はローカル状態が正で、persist effect が同期する。
   */
  useEffect(() => {
    if (!conversationId) return;
    const hasPending = hasPendingLandingPayload(conversationId, location.state);
    const switchedConversation = prevLoadedConversationIdRef.current !== conversationId;
    const executedFlag = (() => {
      try {
        return typeof sessionStorage !== "undefined"
          ? sessionStorage.getItem(aiChatInitialExecutedStorageKey(conversationId))
          : null;
      } catch {
        return null;
      }
    })();

    if (hasPending) {
      return;
    }
    if (executedFlag === "1") {
      prevLoadedConversationIdRef.current = conversationId;
      try {
        if (typeof sessionStorage !== "undefined") {
          sessionStorage.removeItem(aiChatInitialExecutedStorageKey(conversationId));
        }
      } catch {
        // ignore
      }
      return;
    }
    if (!switchedConversation) {
      return;
    }
    if (conversation) {
      loadConversation(conversation);
      prevLoadedConversationIdRef.current = conversationId;
    } else {
      clearMessages();
    }
  }, [conversationId, conversation, location.state, loadConversation, clearMessages]);

  /**
   * First message from `/ai` landing: router state and/or sessionStorage backup.
   * Uses sessionStorage "executed" flag so Strict Mode remount does not call sendMessage twice.
   * `/ai` ランディングからの初回メッセージ。Strict Mode 再マウントで二重送信しないよう executed フラグを使う。
   */
  useEffect(() => {
    if (!conversationId || !conversation) return;
    const pending = readPendingInitialPayload(conversationId, location.state);
    if (!pending?.initialMessage?.trim()) return;

    try {
      if (
        typeof sessionStorage !== "undefined" &&
        sessionStorage.getItem(aiChatInitialExecutedStorageKey(conversationId)) === "1"
      ) {
        clearPendingInitialPayload(conversationId);
        navigate(location.pathname, { replace: true, state: {} });
        return;
      }
    } catch {
      // ignore
    }

    if (initialMessageHandledRef.current) return;
    initialMessageHandledRef.current = true;

    try {
      if (typeof sessionStorage !== "undefined") {
        sessionStorage.setItem(aiChatInitialExecutedStorageKey(conversationId), "1");
      }
    } catch {
      // ignore
    }

    clearPendingInitialPayload(conversationId);
    navigate(location.pathname, { replace: true, state: {} });
    void sendMessage(pending.initialMessage, pending.initialReferencedPages ?? []);
  }, [conversationId, conversation, location.state, location.pathname, sendMessage, navigate]);

  useEffect(() => {
    if (conversationId && messages.length > 0) {
      updateConversation(conversationId, {
        messageMap,
        rootMessageId,
        activeLeafId,
      });
    }
  }, [messages, conversationId, updateConversation, messageMap, rootMessageId, activeLeafId]);
}
