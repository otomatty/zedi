import { useState, useCallback, useEffect } from "react";
import { Conversation, ChatMessage, PageContextSnapshot } from "../types/aiChat";

const LOCAL_STORAGE_KEY = "zedi-ai-conversations";
const MAX_CONVERSATIONS = 50;

/** ローカルストレージから会話一覧を取得 */
function loadConversationsFromStorage(): Conversation[] {
  try {
    const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!stored) return [];
    return JSON.parse(stored) as Conversation[];
  } catch {
    return [];
  }
}

/** ローカルストレージに会話一覧を保存 */
function saveConversationsToStorage(conversations: Conversation[]) {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(conversations));
  } catch (e) {
    console.warn("Failed to save conversations to localStorage:", e);
  }
}

/** 会話タイトルの自動生成（最初のユーザーメッセージから） */
function generateTitle(messages: ChatMessage[]): string {
  const firstUserMsg = messages.find((m) => m.role === "user");
  if (!firstUserMsg) return "新しい会話";
  const text = firstUserMsg.content.slice(0, 50);
  return text.length < firstUserMsg.content.length ? `${text}...` : text;
}

export function useAIChatConversations() {
  const [conversations, setConversations] = useState<Conversation[]>(() =>
    loadConversationsFromStorage(),
  );

  // ストレージと同期
  useEffect(() => {
    saveConversationsToStorage(conversations);
  }, [conversations]);

  const createConversation = useCallback((pageContext?: PageContextSnapshot): Conversation => {
    const newConv: Conversation = {
      id: crypto.randomUUID(),
      title: "",
      messages: [],
      pageContext,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    setConversations((prev) => {
      const updated = [newConv, ...prev];
      // 最大数を超えたら古いものを削除
      if (updated.length > MAX_CONVERSATIONS) {
        return updated.slice(0, MAX_CONVERSATIONS);
      }
      return updated;
    });

    return newConv;
  }, []);

  const updateConversation = useCallback((id: string, messages: ChatMessage[]) => {
    setConversations((prev) =>
      prev.map((c) =>
        c.id === id
          ? {
              ...c,
              messages,
              title: c.title || generateTitle(messages),
              updatedAt: Date.now(),
            }
          : c,
      ),
    );
  }, []);

  const deleteConversation = useCallback((id: string) => {
    setConversations((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const getConversation = useCallback(
    (id: string): Conversation | undefined => {
      return conversations.find((c) => c.id === id);
    },
    [conversations],
  );

  /** 指定ページに紐付いた会話をフィルタして返す */
  const getConversationsForPage = useCallback(
    (pageId: string | undefined, contextType?: string): Conversation[] => {
      if (pageId) {
        return conversations.filter((c) => c.pageContext?.pageId === pageId);
      }
      // pageId がない場合はコンテキストタイプでフィルタ
      if (contextType) {
        return conversations.filter(
          (c) => c.pageContext?.type === contextType && !c.pageContext?.pageId,
        );
      }
      // fallback: pageContext がない会話
      return conversations.filter((c) => !c.pageContext);
    },
    [conversations],
  );

  return {
    conversations,
    createConversation,
    updateConversation,
    deleteConversation,
    getConversation,
    getConversationsForPage,
  };
}
