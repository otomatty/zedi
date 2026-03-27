import type { MessageMap } from "../types/aiChat";
import { getActivePath } from "./messageTree";

/**
 * Builds a short title from the first user message on the active path.
 * Returns an empty string when there is no user message (UI should localize a fallback).
 * アクティブパス上の最初のユーザーメッセージから短いタイトルを生成する。
 * ユーザーメッセージが無い場合は空文字（UI 側で未設定ラベルを出す）。
 */
export function generateConversationTitleFromTree(
  messageMap: MessageMap,
  activeLeafId: string | null,
): string {
  const path = getActivePath(messageMap, activeLeafId);
  const firstUserMsg = path.find((m) => m.role === "user");
  if (!firstUserMsg) return "";
  const text = firstUserMsg.content.slice(0, 50);
  return text.length < firstUserMsg.content.length ? `${text}...` : text;
}
