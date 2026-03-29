import { useState, useCallback, useEffect, createContext, useContext, type ReactNode } from "react";
import type { Conversation, PageContextSnapshot } from "../types/aiChat";
import { migrateConversation } from "../lib/conversationMigration";
import { generateConversationTitleFromTree } from "../lib/aiChatConversationTitle";

const LOCAL_STORAGE_KEY = "zedi-ai-conversations";
const MAX_CONVERSATIONS = 50;

/** ローカルストレージから会話一覧を取得 */
function loadConversationsFromStorage(): Conversation[] {
  try {
    const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored) as Conversation[];
    return parsed.map((c) => migrateConversation(c));
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

/**
 * Message tree fields passed to {@link AIChatConversationsContextValue.updateConversation}.
 * {@link AIChatConversationsContextValue.updateConversation} に渡すメッセージツリー更新。
 */
export type ConversationTreeUpdate = Pick<
  Conversation,
  "messageMap" | "rootMessageId" | "activeLeafId"
>;

/**
 * Context API for shared AI conversations (localStorage-backed).
 * AI 会話の共有コンテキスト API（localStorage 同期）。
 */
export type AIChatConversationsContextValue = {
  /** All stored conversations (newest first). / 保存済み会話（新しい順） */
  conversations: Conversation[];
  /** Creates a conversation and appends it to the list. / 会話を作成して一覧に追加 */
  createConversation: (pageContext?: PageContextSnapshot) => Conversation;
  /** Replaces tree state for a conversation by id. / ID 指定でツリー状態を更新 */
  updateConversation: (id: string, tree: ConversationTreeUpdate) => void;
  /** Removes a conversation by id. / ID 指定で会話を削除 */
  deleteConversation: (id: string) => void;
  /** Returns one conversation by id, if present. / ID で会話を取得（なければ undefined） */
  getConversation: (id: string) => Conversation | undefined;
  /**
   * Lists conversations scoped by page id and/or context type (see implementation).
   * ページ ID やコンテキスト種別で絞り込んだ会話一覧（詳細は実装参照）。
   */
  getConversationsForPage: (pageId: string | undefined, contextType?: string) => Conversation[];
};

const AIChatConversationsContext = createContext<AIChatConversationsContextValue | null>(null);

function useAIChatConversationsState(): AIChatConversationsContextValue {
  const [conversations, setConversations] = useState<Conversation[]>(() =>
    loadConversationsFromStorage(),
  );

  useEffect(() => {
    saveConversationsToStorage(conversations);
  }, [conversations]);

  const createConversation = useCallback((pageContext?: PageContextSnapshot): Conversation => {
    const newConv: Conversation = {
      id: crypto.randomUUID(),
      title: "",
      messageMap: {},
      rootMessageId: null,
      activeLeafId: null,
      pageContext,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    setConversations((prev) => {
      const updated = [newConv, ...prev];
      if (updated.length > MAX_CONVERSATIONS) {
        return updated.slice(0, MAX_CONVERSATIONS);
      }
      return updated;
    });

    return newConv;
  }, []);

  const updateConversation = useCallback((id: string, tree: ConversationTreeUpdate) => {
    setConversations((prev) =>
      prev.map((c) =>
        c.id === id
          ? {
              ...c,
              messageMap: tree.messageMap,
              rootMessageId: tree.rootMessageId,
              activeLeafId: tree.activeLeafId,
              messages: undefined,
              title:
                c.title ||
                generateConversationTitleFromTree(tree.messageMap ?? {}, tree.activeLeafId ?? null),
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

  const getConversationsForPage = useCallback(
    (pageId: string | undefined, contextType?: string): Conversation[] => {
      if (pageId) {
        return conversations.filter((c) => c.pageContext?.pageId === pageId);
      }
      if (contextType) {
        return conversations.filter(
          (c) => c.pageContext?.type === contextType && !c.pageContext?.pageId,
        );
      }
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

/**
 * Provides a single shared AI conversation list (localStorage-backed) for the app tree.
 * アプリ全体で共有する AI 会話一覧（localStorage 同期）を提供する。
 */
export function AIChatConversationsProvider({ children }: { children: ReactNode }) {
  const value = useAIChatConversationsState();
  return (
    <AIChatConversationsContext.Provider value={value}>
      {children}
    </AIChatConversationsContext.Provider>
  );
}

/**
 * Access shared AI chat conversations (create/update/delete, page-scoped lists).
 * AI 会話の共有状態にアクセスする（作成・更新・削除、ページ別一覧）。
 */
export function useAIChatConversations(): AIChatConversationsContextValue {
  const ctx = useContext(AIChatConversationsContext);
  if (!ctx) {
    throw new Error("useAIChatConversations must be used within AIChatConversationsProvider");
  }
  return ctx;
}
