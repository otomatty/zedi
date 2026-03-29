import type { ChatTreeState } from "../types/aiChat";

/**
 * Initial empty chat tree (no messages, no active leaf).
 * 空のチャットツリー（メッセージなし、アクティブリーフなし）。
 */
export const emptyTree: ChatTreeState = {
  messageMap: {},
  rootMessageId: null,
  activeLeafId: null,
};
