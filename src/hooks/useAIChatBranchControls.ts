import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { ChatTreeState } from "../types/aiChat";
import { deleteSubtree, findLeaf, switchToSibling } from "@/lib/messageTree";

type BranchControlsParams = {
  treeRef: MutableRefObject<ChatTreeState>;
  setTree: Dispatch<SetStateAction<ChatTreeState>>;
  pendingBranchFromUserIdRef: MutableRefObject<string | null>;
};

/**
 * Branch navigation and subtree editing for the AI chat message tree.
 * AI チャットのメッセージツリー向け分岐ナビと部分木操作。
 */
export function useAIChatBranchControls({
  treeRef,
  setTree,
  pendingBranchFromUserIdRef,
}: BranchControlsParams) {
  const switchBranch = useCallback(
    (messageId: string, direction: "prev" | "next") => {
      setTree((prev) => ({
        ...prev,
        activeLeafId: switchToSibling(prev.messageMap, messageId, direction),
      }));
    },
    [setTree],
  );

  const navigateToNode = useCallback(
    (nodeId: string) => {
      setTree((prev) => {
        const newLeaf = findLeaf(prev.messageMap, nodeId);
        return { ...prev, activeLeafId: newLeaf };
      });
    },
    [setTree],
  );

  const setBranchPoint = useCallback(
    (nodeId: string) => {
      setTree((prev) => ({
        ...prev,
        activeLeafId: nodeId,
      }));
    },
    [setTree],
  );

  const deleteBranch = useCallback(
    (nodeId: string) => {
      setTree((prev) => {
        const result = deleteSubtree(
          prev.messageMap,
          prev.rootMessageId,
          prev.activeLeafId,
          nodeId,
        );
        if (!result) {
          return prev;
        }
        return {
          messageMap: result.messageMap,
          rootMessageId: result.rootMessageId,
          activeLeafId: result.activeLeafId,
        };
      });
    },
    [setTree],
  );

  const prepareBranchFromUserMessage = useCallback(
    (userMessageId: string) => {
      const m = treeRef.current.messageMap[userMessageId];
      if (!m || m.role !== "user") {
        pendingBranchFromUserIdRef.current = null;
        return "";
      }
      pendingBranchFromUserIdRef.current = userMessageId;
      return m.content;
    },
    [treeRef, pendingBranchFromUserIdRef],
  );

  return {
    switchBranch,
    navigateToNode,
    setBranchPoint,
    deleteBranch,
    prepareBranchFromUserMessage,
  };
}
