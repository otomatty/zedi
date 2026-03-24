import type { MessageMap } from "../types/aiChat";
import { getActivePath } from "./messageTree";

/**
 * Builds a short title from the first user message on the active path.
 * アクティブパス上の最初のユーザーメッセージから短いタイトルを生成する。
 */
export function generateConversationTitleFromTree(
  messageMap: MessageMap,
  activeLeafId: string | null,
): string {
  const path = getActivePath(messageMap, activeLeafId);
  const firstUserMsg = path.find((m) => m.role === "user");
  if (!firstUserMsg) return "新しい会話";
  const text = firstUserMsg.content.slice(0, 50);
  return text.length < firstUserMsg.content.length ? `${text}...` : text;
}
