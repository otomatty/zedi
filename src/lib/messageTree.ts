import type { ChatMessage, MessageMap, TreeChatMessage } from "../types/aiChat";

export type { MessageMap };

/**
 * Strip `parentId` for API / legacy {@link ChatMessage} consumers.
 * API や旧 {@link ChatMessage} 向けに `parentId` を除く。
 */
export function stripToChatMessage(m: TreeChatMessage): ChatMessage {
  const { parentId: _p, ...rest } = m;
  return rest;
}

/**
 * Immutable patch of one node in the map.
 * マップ内の 1 ノードを不変更新する。
 */
export function patchMessageInTree(
  map: MessageMap,
  messageId: string,
  patch: Partial<TreeChatMessage>,
): MessageMap {
  const node = map[messageId];
  if (!node) return map;
  return { ...map, [messageId]: { ...node, ...patch } };
}

/**
 * Ordered path from root to the active leaf (inclusive).
 * ルートからアクティブリーフまでの順序付きパス（両端含む）。
 */
export function getActivePath(map: MessageMap, activeLeafId: string | null): TreeChatMessage[] {
  if (activeLeafId == null || Object.keys(map).length === 0) {
    return [];
  }
  const path: TreeChatMessage[] = [];
  let current: string | null = activeLeafId;
  const guard = new Set<string>();
  while (current != null) {
    if (guard.has(current)) {
      return [];
    }
    guard.add(current);
    const node = map[current];
    if (!node) {
      return [];
    }
    path.push(node);
    current = node.parentId;
  }
  path.reverse();
  return path;
}

/**
 * Children of a parent, oldest first (timestamp ascending).
 * 親の子ノードを古い順（timestamp 昇順）。
 */
export function getChildren(map: MessageMap, parentId: string | null): TreeChatMessage[] {
  return Object.values(map)
    .filter((m) => m.parentId === parentId)
    .sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Siblings of a message (same parent), oldest first, with index of `messageId`.
 * 同一親の兄弟（古い順）と `messageId` のインデックス。
 */
export function getSiblings(
  map: MessageMap,
  messageId: string,
): { siblings: TreeChatMessage[]; index: number } {
  const node = map[messageId];
  if (!node) {
    return { siblings: [], index: -1 };
  }
  const siblings = getChildren(map, node.parentId);
  const index = siblings.findIndex((s) => s.id === messageId);
  return { siblings, index };
}

/**
 * Deepest leaf following the latest child at each branch (by timestamp).
 * 分岐では timestamp 最大の子を選び末端まで辿る。
 */
export function findLeaf(map: MessageMap, startId: string): string {
  const children = getChildren(map, startId);
  if (children.length === 0) {
    return startId;
  }
  const latest = children.reduce((a, b) => (a.timestamp >= b.timestamp ? a : b));
  return findLeaf(map, latest.id);
}

/**
 * Switch to adjacent sibling and return the leaf id of that branch.
 * 隣の兄弟ブランチに切り替え、そのサブツリーのリーフ ID を返す。
 */
export function switchToSibling(
  map: MessageMap,
  messageId: string,
  direction: "prev" | "next",
): string {
  const { siblings, index } = getSiblings(map, messageId);
  if (siblings.length === 0 || index < 0) {
    return messageId;
  }
  const len = siblings.length;
  const delta = direction === "next" ? 1 : -1;
  const nextIndex = (index + delta + len) % len;
  const target = siblings[nextIndex];
  return findLeaf(map, target.id);
}

/**
 * Collects all message ids in the subtree rooted at `nodeId` (inclusive), depth-first.
 * `nodeId` を根とする部分木のメッセージ ID をすべて収集（自身を含む）。
 */
export function collectSubtreeIds(map: MessageMap, nodeId: string): Set<string> {
  const ids = new Set<string>();
  function dfs(id: string): void {
    if (!map[id]) return;
    ids.add(id);
    for (const c of getChildren(map, id)) {
      dfs(c.id);
    }
  }
  dfs(nodeId);
  return ids;
}

/** Result of {@link deleteSubtree}. / {@link deleteSubtree} の戻り値 */
export interface DeleteSubtreeResult {
  messageMap: MessageMap;
  rootMessageId: string | null;
  activeLeafId: string | null;
}

/**
 * Removes `nodeId` and all descendants from the map. Cannot delete the conversation root.
 * If the active leaf was removed, picks a remaining sibling under the parent or falls back to the parent branch.
 * ノードと子孫を削除。ルートは削除不可。アクティブリーフが消えた場合は親の残り兄弟へフォールバック。
 *
 * @returns `null` if `nodeId` is missing or equals `rootMessageId`.
 */
export function deleteSubtree(
  map: MessageMap,
  rootMessageId: string | null,
  activeLeafId: string | null,
  nodeId: string,
): DeleteSubtreeResult | null {
  if (!map[nodeId]) {
    return null;
  }
  if (rootMessageId !== null && nodeId === rootMessageId) {
    return null;
  }

  const toRemove = collectSubtreeIds(map, nodeId);

  const nextMap: MessageMap = {};
  for (const [id, m] of Object.entries(map)) {
    if (!toRemove.has(id)) {
      nextMap[id] = m;
    }
  }

  let nextRoot = rootMessageId;
  if (rootMessageId !== null && toRemove.has(rootMessageId)) {
    nextRoot = null;
  }

  let nextActive = activeLeafId;
  if (activeLeafId != null && !toRemove.has(activeLeafId)) {
    nextActive = nextMap[activeLeafId] ? activeLeafId : null;
  } else if (activeLeafId != null && toRemove.has(activeLeafId)) {
    const deleted = map[nodeId];
    const parentId = deleted.parentId;
    if (parentId == null) {
      nextActive = null;
    } else {
      const remaining = getChildren(nextMap, parentId);
      if (remaining.length > 0) {
        nextActive = findLeaf(nextMap, remaining[0].id);
      } else {
        nextActive = findLeaf(nextMap, parentId);
      }
    }
  }

  if (nextActive != null && !nextMap[nextActive]) {
    nextActive = nextRoot != null ? findLeaf(nextMap, nextRoot) : null;
  }

  return { messageMap: nextMap, rootMessageId: nextRoot, activeLeafId: nextActive };
}

/**
 * Immutable insert of one message into the map.
 * メッセージを1件追加した新しいマップを返す（不変）。
 */
export function addMessageToTree(map: MessageMap, message: TreeChatMessage): MessageMap {
  return { ...map, [message.id]: message };
}

/**
 * API payload entries (user/assistant only; system prompt added separately).
 * API 用メッセージ（user/assistant のみ。system は別途プロンプトで付与）。
 */
export function buildApiMessages(
  map: MessageMap,
  activeLeafId: string | null,
): Array<{ role: "user" | "assistant"; content: string }> {
  const path = getActivePath(map, activeLeafId);
  return path
    .filter((m): m is TreeChatMessage & { role: "user" | "assistant" } => m.role !== "system")
    .map((m) => ({ role: m.role, content: m.content }));
}
