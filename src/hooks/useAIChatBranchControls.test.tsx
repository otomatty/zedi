import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useEffect, useRef, useState } from "react";
import type { ChatTreeState, MessageMap } from "../types/aiChat";
import { useAIChatBranchControls } from "./useAIChatBranchControls";

/**
 * Wraps branch controls with React state so treeRef tracks updates.
 * treeRef は effect で同期（レンダー中に ref を書き換えない）。
 */
function useBranchControlsWithState(initial: ChatTreeState) {
  const [tree, setTree] = useState<ChatTreeState>(initial);
  const treeRef = useRef<ChatTreeState>(initial);
  useEffect(() => {
    treeRef.current = tree;
  }, [tree]);
  const pendingBranchFromUserIdRef = useRef<string | null>(null);
  const controls = useAIChatBranchControls({
    treeRef,
    setTree,
    pendingBranchFromUserIdRef,
  });
  return { ...controls, tree, pendingBranchFromUserIdRef };
}

describe("useAIChatBranchControls", () => {
  const forkedTree: ChatTreeState = {
    messageMap: {
      u1: { id: "u1", role: "user", content: "Hi", timestamp: 1, parentId: null },
      a1: { id: "a1", role: "assistant", content: "A", timestamp: 2, parentId: "u1" },
      a2: { id: "a2", role: "assistant", content: "B", timestamp: 3, parentId: "u1" },
    },
    rootMessageId: "u1",
    activeLeafId: "a2",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("navigateToNode sets activeLeafId to leaf under the node", () => {
    const { result } = renderHook(() => useBranchControlsWithState(forkedTree));

    act(() => {
      result.current.navigateToNode("u1");
    });

    expect(result.current.tree.activeLeafId).toBe("a2");
  });

  it("setBranchPoint sets activeLeafId without walking to leaf", () => {
    const { result } = renderHook(() => useBranchControlsWithState(forkedTree));

    act(() => {
      result.current.setBranchPoint("u1");
    });

    expect(result.current.tree.activeLeafId).toBe("u1");
  });

  it("deleteBranch removes subtree when not root", () => {
    const map: MessageMap = {
      u1: { id: "u1", role: "user", content: "Hi", timestamp: 1, parentId: null },
      a1: { id: "a1", role: "assistant", content: "A", timestamp: 2, parentId: "u1" },
    };
    const { result } = renderHook(() =>
      useBranchControlsWithState({
        messageMap: map,
        rootMessageId: "u1",
        activeLeafId: "a1",
      }),
    );

    act(() => {
      result.current.deleteBranch("a1");
    });

    expect(result.current.tree.messageMap["a1"]).toBeUndefined();
    expect(result.current.tree.activeLeafId).toBe("u1");
  });

  it("prepareBranchFromUserMessage sets ref and returns content for user", () => {
    const { result } = renderHook(() => useBranchControlsWithState(forkedTree));

    let text = "";
    act(() => {
      text = result.current.prepareBranchFromUserMessage("u1");
    });

    expect(text).toBe("Hi");
    expect(result.current.pendingBranchFromUserIdRef.current).toBe("u1");
  });

  it("prepareBranchFromUserMessage clears ref and returns empty for non-user", () => {
    const { result } = renderHook(() => useBranchControlsWithState(forkedTree));

    act(() => {
      result.current.pendingBranchFromUserIdRef.current = "u1";
    });

    let text = "";
    act(() => {
      text = result.current.prepareBranchFromUserMessage("a1");
    });

    expect(text).toBe("");
    expect(result.current.pendingBranchFromUserIdRef.current).toBeNull();
  });

  it("prepareBranchFromUserMessage clears ref when missing id", () => {
    const { result } = renderHook(() => useBranchControlsWithState(forkedTree));

    act(() => {
      result.current.pendingBranchFromUserIdRef.current = "u1";
    });

    act(() => {
      result.current.prepareBranchFromUserMessage("missing");
    });

    expect(result.current.pendingBranchFromUserIdRef.current).toBeNull();
  });

  it("switchBranch moves active leaf between assistant siblings", () => {
    const { result } = renderHook(() => useBranchControlsWithState(forkedTree));

    act(() => {
      result.current.switchBranch("a2", "prev");
    });

    expect(result.current.tree.activeLeafId).toBe("a1");
  });
});
