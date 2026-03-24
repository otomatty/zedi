import type {
  ChatMessage,
  ChatTreeState,
  Conversation,
  MessageMap,
  TreeChatMessage,
} from "../types/aiChat";

/**
 * Whether a stored conversation still uses the legacy flat `messages` array.
 * 保存済み会話が旧形式のフラット `messages` かどうか。
 */
export function needsMigration(conversation: Conversation): boolean {
  return conversation.messageMap === undefined && conversation.messages !== undefined;
}

/** Attach `parentId` for tree storage. / ツリー保存用に `parentId` を付与 */
function toTreeMessage(message: ChatMessage, parentId: string | null): TreeChatMessage {
  return { ...message, parentId };
}

/**
 * Convert a legacy flat transcript to {@link ChatTreeState}.
 * 旧フラット履歴を {@link ChatTreeState} に変換する。
 */
export function flatMessagesToTree(messages: ChatMessage[]): ChatTreeState {
  const conv = migrateConversation({
    id: "migration",
    title: "",
    messages,
    createdAt: 0,
    updatedAt: 0,
  });
  return {
    messageMap: conv.messageMap ?? {},
    rootMessageId: conv.rootMessageId ?? null,
    activeLeafId: conv.activeLeafId ?? null,
  };
}

/**
 * Migrate legacy flat `messages` to `messageMap` + root/leaf pointers. Idempotent if `messageMap` exists.
 * フラット `messages` を `messageMap` と root/leaf に移行する。`messageMap` がある場合は冪等。
 */
export function migrateConversation(conversation: Conversation): Conversation {
  if (conversation.messageMap !== undefined) {
    return conversation;
  }

  const flat = conversation.messages ?? [];
  if (flat.length === 0) {
    const { messages: _removed, ...rest } = conversation;
    return {
      ...rest,
      messageMap: {},
      rootMessageId: null,
      activeLeafId: null,
    };
  }

  const messageMap: MessageMap = {};
  for (let i = 0; i < flat.length; i += 1) {
    const parentId = i === 0 ? null : flat[i - 1].id;
    const node = toTreeMessage(flat[i], parentId);
    messageMap[node.id] = node;
  }

  const { messages: _removed, ...rest } = conversation;
  return {
    ...rest,
    messageMap,
    rootMessageId: flat[0].id,
    activeLeafId: flat[flat.length - 1].id,
  };
}
