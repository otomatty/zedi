import { useMemo, useCallback, useState, useRef } from "react";
import { ReactFlow, Background, BackgroundVariant, ReactFlowProvider } from "@xyflow/react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@zedi/ui";
import type { MessageMap } from "../../types/aiChat";
import { buildFlowGraph, type BranchNode } from "../../lib/messageTreeLayout";
import { findLeaf } from "../../lib/messageTree";
import { AIChatBranchNode } from "./AIChatBranchNode";
import { useTranslation } from "react-i18next";

const NODE_TYPES = { branchNode: AIChatBranchNode };

interface AIChatBranchTreeProps {
  messageMap: MessageMap;
  rootMessageId: string | null;
  activeLeafId: string | null;
  onSelectBranch: (leafId: string) => void;
  /** User chose "branch from here" in context menu. / 「ここから分岐」 */
  onBranchFrom: (nodeId: string) => void;
  /** Called after delete confirmation. / 削除確認後 */
  onDeleteBranch: (nodeId: string) => void;
}

/**
 * Renders the conversation tree as an interactive branch graph (React Flow + dagre).
 * Wrapped with ReactFlowProvider for React Flow context.
 * Clicking a node navigates to that branch and switches back to chat view.
 * 会話ツリーをインタラクティブなブランチグラフとして表示。ノードクリックでそのブランチに切り替え。
 */
export function AIChatBranchTree({
  messageMap,
  rootMessageId,
  activeLeafId,
  onSelectBranch,
  onBranchFrom,
  onDeleteBranch,
}: AIChatBranchTreeProps) {
  const { t } = useTranslation();
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  /** Suppresses the next onNodeClick when a context menu action was just taken. */
  const skipNextClickRef = useRef(false);

  const { nodes: rawNodes, edges } = useMemo(
    () => buildFlowGraph(messageMap, rootMessageId, activeLeafId),
    [messageMap, rootMessageId, activeLeafId],
  );

  const nodes = useMemo((): BranchNode[] => {
    return rawNodes.map((n) => ({
      ...n,
      data: {
        ...n.data,
        isRoot: rootMessageId !== null && n.id === rootMessageId,
        onGoToBranch: () => {
          skipNextClickRef.current = true;
          onSelectBranch(findLeaf(messageMap, n.id));
        },
        onBranchFrom: () => {
          skipNextClickRef.current = true;
          onBranchFrom(n.id);
        },
        onRequestDelete: () => {
          skipNextClickRef.current = true;
          setDeleteTargetId(n.id);
        },
      },
    }));
  }, [rawNodes, messageMap, rootMessageId, onSelectBranch, onBranchFrom]);

  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: { id: string }) => {
      if (skipNextClickRef.current) {
        skipNextClickRef.current = false;
        return;
      }
      onSelectBranch(findLeaf(messageMap, node.id));
    },
    [messageMap, onSelectBranch],
  );

  const handleConfirmDelete = useCallback(() => {
    const targetId = deleteTargetId;
    if (targetId != null) {
      onDeleteBranch(targetId);
    }
    setDeleteTargetId(null);
  }, [deleteTargetId, onDeleteBranch]);

  if (rawNodes.length === 0) {
    return (
      <div className="text-muted-foreground flex flex-1 items-center justify-center p-6 text-sm">
        {t("aiChat.viewTabs.noBranches")}
      </div>
    );
  }

  return (
    <ReactFlowProvider>
      <div className="h-full w-full">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          onNodeClick={onNodeClick}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          panOnDrag
          zoomOnScroll
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={12} size={1} />
        </ReactFlow>
      </div>

      <AlertDialog
        open={deleteTargetId !== null}
        onOpenChange={(open) => !open && setDeleteTargetId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("aiChat.branchTree.deleteConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("aiChat.branchTree.deleteConfirmDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("aiChat.branchTree.deleteCancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleConfirmDelete}
            >
              {t("aiChat.branchTree.deleteConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ReactFlowProvider>
  );
}
