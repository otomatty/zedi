/** Base path for full-page AI chat routes. / フルページ AI チャットのベースパス */
export const AI_CHAT_BASE_PATH = "/ai";

/** Full AI chat history list route. / AI チャット履歴一覧のパス */
export const AI_CHAT_HISTORY_PATH = `${AI_CHAT_BASE_PATH}/history`;

/**
 * URL path for a single conversation on the full-page AI chat.
 * フルページ AI の会話詳細パス。
 */
export function aiChatConversationPath(conversationId: string): string {
  return `${AI_CHAT_BASE_PATH}/${conversationId}`;
}

/**
 * sessionStorage key for the first message when navigating from `/ai` landing (Strict Mode / timing safe).
 * `/ai` から遷移する初回メッセージ用（Strict Mode・タイミング対策）。
 */
export function aiChatInitialPayloadStorageKey(conversationId: string): string {
  return `zedi-ai-initial-payload-${conversationId}`;
}

/**
 * sessionStorage key: landing initial send already executed (prevents duplicate user messages in Strict Mode).
 * ランディング初回送信済み（Strict Mode の二重送信防止）。
 */
export function aiChatInitialExecutedStorageKey(conversationId: string): string {
  return `zedi-ai-initial-executed-${conversationId}`;
}
