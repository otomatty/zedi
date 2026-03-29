import dagre from "@dagrejs/dagre";
import type { Node, Edge } from "@xyflow/react";
import type { MessageMap, TreeChatMessage } from "../types/aiChat";
import { getActivePath, getChildren } from "./messageTree";

/** Maximum characters to show in node preview. / ノードプレビューに表示する最大文字数 */
const PREVIEW_MAX_LEN = 40;

/** Fixed node dimensions for dagre layout (px). / dagre レイアウト用の固定ノードサイズ */
const NODE_WIDTH = 180;
const NODE_HEIGHT = 48;

/** Custom node type for branch tree. / ブランチツリー用カスタムノード型 */
export type BranchNodeData = {
  role: "user" | "assistant";
  contentPreview: string;
  isOnActivePath: boolean;
  isActiveLeaf: boolean;
  /** True for conversation root (cannot delete). / 会話ルート（削除不可） */
  isRoot?: boolean;
  /** Context menu: jump to branch leaf. / コンテキスト: ブランチ末端へ */
  onGoToBranch?: () => void;
  /** Context menu: start new branch from this node. / コンテキスト: ここから分岐 */
  onBranchFrom?: () => void;
  /** Context menu: open delete confirmation. / コンテキスト: 削除確認へ */
  onRequestDelete?: () => void;
};

/** React Flow node type for branch tree. / ブランチツリー用 React Flow ノード型 */
export type BranchNode = Node<BranchNodeData, "branchNode">;

/**
 * Builds React Flow nodes and edges from MessageMap with dagre layout.
 * Skips system messages. Root is determined by rootMessageId; if null, returns empty.
 * メッセージマップから dagre レイアウトで React Flow のノード・エッジを生成。system は除外。
 */
export function buildFlowGraph(
  map: MessageMap,
  rootMessageId: string | null,
  activeLeafId: string | null,
): { nodes: BranchNode[]; edges: Edge[] } {
  if (!rootMessageId || Object.keys(map).length === 0) {
    return { nodes: [], edges: [] };
  }

  const activePathIds = new Set(getActivePath(map, activeLeafId).map((m) => m.id));

  const collectFromRoot = (id: string): TreeChatMessage[] => {
    const node = map[id];
    if (!node || (node.role !== "user" && node.role !== "assistant")) {
      return [];
    }
    const children = getChildren(map, id);
    const childNodes = children.flatMap((c) => collectFromRoot(c.id));
    return [node, ...childNodes];
  };

  const messages = collectFromRoot(rootMessageId);
  if (messages.length === 0) {
    return { nodes: [], edges: [] };
  }

  const edges: Edge[] = [];
  messages.forEach((m) => {
    if (m.parentId != null && map[m.parentId]) {
      edges.push({ id: `${m.parentId}-${m.id}`, source: m.parentId, target: m.id });
    }
  });

  const dagreGraph = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({ rankdir: "TB", ranksep: 24, nodesep: 16 });

  messages.forEach((m) => {
    dagreGraph.setNode(m.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  });
  edges.forEach((e) => {
    dagreGraph.setEdge(e.source, e.target);
  });

  dagre.layout(dagreGraph);

  const contentPreview = (text: string): string => {
    const trimmed = text.replace(/\s+/g, " ").trim();
    return trimmed.length <= PREVIEW_MAX_LEN ? trimmed : `${trimmed.slice(0, PREVIEW_MAX_LEN)}…`;
  };

  const nodes: BranchNode[] = messages.map((m) => {
    const pos = dagreGraph.node(m.id);
    const isOnActivePath = activePathIds.has(m.id);
    const isActiveLeaf = activeLeafId === m.id;

    return {
      id: m.id,
      type: "branchNode" as const,
      position: {
        x: pos.x - NODE_WIDTH / 2,
        y: pos.y - NODE_HEIGHT / 2,
      },
      data: {
        role: m.role,
        contentPreview: contentPreview(m.content),
        isOnActivePath,
        isActiveLeaf,
      },
    };
  });

  return { nodes, edges };
}
