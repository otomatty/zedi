import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { ChatTreeState, MessageMap, TreeChatMessage } from "../types/aiChat";
import { useAIChatMessageCallbacks } from "./useAIChatMessageCallbacks";

vi.mock("./useAIChatExecute", () => ({
  executeSendMessage: vi.fn().mockResolvedValue(undefined),
  executeRegenerateAssistant: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/aiChatActionHelpers", () => ({
  resolveReferencedPagesFromContent: vi.fn(() => []),
}));

vi.mock("@/lib/messageTree", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/messageTree")>();
  return {
    ...actual,
    patchMessageInTree: vi.fn(
      (map: MessageMap, _id: string, _patch: Partial<TreeChatMessage>) => map,
    ),
  };
});

import { executeSendMessage, executeRegenerateAssistant } from "./useAIChatExecute";
import { patchMessageInTree } from "@/lib/messageTree";

function createParams(overrides: Partial<Parameters<typeof useAIChatMessageCallbacks>[0]> = {}) {
  const userMsg: TreeChatMessage = {
    id: "u1",
    role: "user",
    content: "hello",
    timestamp: 1,
    parentId: null,
  };
  const assistantMsg: TreeChatMessage = {
    id: "a1",
    role: "assistant",
    content: "hi",
    timestamp: 2,
    parentId: "u1",
  };
  const tree: ChatTreeState = {
    messageMap: { u1: userMsg, a1: assistantMsg },
    rootMessageId: "u1",
    activeLeafId: "a1",
  };

  return {
    pageContext: null,
    contextEnabled: false,
    existingPageTitles: [],
    availablePages: [],
    tree,
    treeRef: { current: tree },
    setTree: vi.fn(),
    setError: vi.fn(),
    setStreaming: vi.fn(),
    streamingContentRef: { current: "" },
    abortControllerRef: { current: null },
    pendingBranchFromUserIdRef: { current: null },
    ...overrides,
  } as ReturnType<typeof createParams>;
}

describe("useAIChatMessageCallbacks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sendMessage calls executeSendMessage with correct params", async () => {
    const params = createParams();
    const { result } = renderHook(() => useAIChatMessageCallbacks(params));

    await act(async () => {
      await result.current.sendMessage("hey", []);
    });

    expect(executeSendMessage).toHaveBeenCalledOnce();
    const call = vi.mocked(executeSendMessage).mock.calls[0][0];
    expect(call.content).toBe("hey");
    expect(call.branchFromUserMessageId).toBeUndefined();
  });

  it("sendMessage uses branchFromUserMessageId from options", async () => {
    const params = createParams();
    const { result } = renderHook(() => useAIChatMessageCallbacks(params));

    await act(async () => {
      await result.current.sendMessage("edited", [], { branchFromUserMessageId: "u1" });
    });

    const call = vi.mocked(executeSendMessage).mock.calls[0][0];
    expect(call.branchFromUserMessageId).toBe("u1");
  });

  it("sendMessage uses branchFromUserMessageId from ref when options omit it", async () => {
    const params = createParams();
    params.pendingBranchFromUserIdRef.current = "u1";
    const { result } = renderHook(() => useAIChatMessageCallbacks(params));

    await act(async () => {
      await result.current.sendMessage("from ref", []);
    });

    const call = vi.mocked(executeSendMessage).mock.calls[0][0];
    expect(call.branchFromUserMessageId).toBe("u1");
  });

  it("sendMessage clears pendingBranchFromUserIdRef after execution", async () => {
    const params = createParams();
    params.pendingBranchFromUserIdRef.current = "u1";
    const { result } = renderHook(() => useAIChatMessageCallbacks(params));

    await act(async () => {
      await result.current.sendMessage("test", []);
    });

    expect(params.pendingBranchFromUserIdRef.current).toBeNull();
  });

  it("sendMessage catches errors and sets error state", async () => {
    vi.mocked(executeSendMessage).mockRejectedValueOnce(new Error("fail"));
    const params = createParams();
    const { result } = renderHook(() => useAIChatMessageCallbacks(params));

    await act(async () => {
      await result.current.sendMessage("oops", []);
    });

    expect(params.setError).toHaveBeenCalledWith("fail");
    expect(params.setStreaming).toHaveBeenCalledWith(false);
  });

  it("regenerateResponse calls executeRegenerateAssistant", async () => {
    const params = createParams();
    const { result } = renderHook(() => useAIChatMessageCallbacks(params));

    await act(async () => {
      await result.current.regenerateResponse("a1");
    });

    expect(executeRegenerateAssistant).toHaveBeenCalledOnce();
    const call = vi.mocked(executeRegenerateAssistant).mock.calls[0][0];
    expect(call.assistantMessageId).toBe("a1");
  });

  it("regenerateResponse catches errors", async () => {
    vi.mocked(executeRegenerateAssistant).mockRejectedValueOnce(new Error("regen fail"));
    const params = createParams();
    const { result } = renderHook(() => useAIChatMessageCallbacks(params));

    await act(async () => {
      await result.current.regenerateResponse("a1");
    });

    expect(params.setError).toHaveBeenCalledWith("regen fail");
    expect(params.setStreaming).toHaveBeenCalledWith(false);
  });

  it("stopStreaming aborts the controller and sets streaming false", () => {
    const controller = new AbortController();
    const params = createParams({ abortControllerRef: { current: controller } });
    const { result } = renderHook(() => useAIChatMessageCallbacks(params));

    act(() => {
      result.current.stopStreaming();
    });

    expect(controller.signal.aborted).toBe(true);
    expect(params.setStreaming).toHaveBeenCalledWith(false);
    expect(params.setTree).toHaveBeenCalled();
  });

  it("stopStreaming patches the active streaming message", () => {
    const streamingAssistant: TreeChatMessage = {
      id: "a2",
      role: "assistant",
      content: "",
      timestamp: 3,
      parentId: "u1",
      isStreaming: true,
    };
    const tree: ChatTreeState = {
      messageMap: {
        u1: {
          id: "u1",
          role: "user",
          content: "x",
          timestamp: 1,
          parentId: null,
        },
        a2: streamingAssistant,
      },
      rootMessageId: "u1",
      activeLeafId: "a2",
    };
    const params = createParams({
      tree,
      treeRef: { current: tree },
      streamingContentRef: { current: "partial content" },
    });
    params.setTree.mockImplementation((fn: (prev: ChatTreeState) => ChatTreeState) => {
      fn(tree);
    });

    const { result } = renderHook(() => useAIChatMessageCallbacks(params));
    act(() => result.current.stopStreaming());

    expect(patchMessageInTree).toHaveBeenCalledWith(tree.messageMap, "a2", {
      isStreaming: false,
      content: "partial content",
    });
  });

  it("editAndResend delegates to sendMessage with branchFromUserMessageId", async () => {
    const params = createParams();
    const { result } = renderHook(() => useAIChatMessageCallbacks(params));

    await act(async () => {
      await result.current.editAndResend("u1", "updated content");
    });

    expect(executeSendMessage).toHaveBeenCalledOnce();
    const call = vi.mocked(executeSendMessage).mock.calls[0][0];
    expect(call.content).toBe("updated content");
    expect(call.branchFromUserMessageId).toBe("u1");
  });

  it("editAndResend ignores non-user messages", async () => {
    const params = createParams();
    const { result } = renderHook(() => useAIChatMessageCallbacks(params));

    await act(async () => {
      await result.current.editAndResend("a1", "try edit assistant");
    });

    expect(executeSendMessage).not.toHaveBeenCalled();
  });
});
