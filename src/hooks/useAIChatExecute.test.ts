import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { ChatTreeState } from "../types/aiChat";
import { DEFAULT_AI_SETTINGS } from "../types/ai";
import { loadAISettings } from "../lib/aiSettings";
import { streamAssistantCompletion } from "./useAIChatExecuteHelpers";
import { executeSendMessage, executeRegenerateAssistant } from "./useAIChatExecute";

vi.mock("../lib/aiChatPrompt", () => ({
  buildSystemPrompt: vi.fn(() => "SYS"),
}));

vi.mock("../lib/aiSettings", () => ({
  loadAISettings: vi.fn(),
}));

vi.mock("../stores/aiChatStore", () => ({
  useAIChatStore: {
    getState: vi.fn(() => ({ selectedModel: null })),
  },
}));

vi.mock("./useAIChatExecuteHelpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./useAIChatExecuteHelpers")>();
  return {
    ...actual,
    streamAssistantCompletion: vi.fn().mockResolvedValue(undefined),
  };
});

const mockLoadAISettings = vi.mocked(loadAISettings);
const mockStreamAssistantCompletion = vi.mocked(streamAssistantCompletion);

/**
 * Mutable tree + setTree for execute* (mirrors React state updates).
 * execute* 用の可変ツリーと setTree（React の state 更新に相当）。
 */
function createTreeHarness(initial: ChatTreeState): {
  treeRef: MutableRefObject<ChatTreeState>;
  setTree: Dispatch<SetStateAction<ChatTreeState>>;
  getTree: () => ChatTreeState;
} {
  let state = initial;
  const treeRef: MutableRefObject<ChatTreeState> = {
    get current() {
      return state;
    },
    set current(v: ChatTreeState) {
      state = v;
    },
  };
  const setTree: Dispatch<SetStateAction<ChatTreeState>> = (action) => {
    state = typeof action === "function" ? action(state) : action;
    treeRef.current = state;
  };
  return { treeRef, setTree, getTree: () => state };
}

function baseParams(
  treeRef: MutableRefObject<ChatTreeState>,
  setTree: Dispatch<SetStateAction<ChatTreeState>>,
) {
  const setError = vi.fn();
  const setStreaming = vi.fn();
  const streamingContentRef: MutableRefObject<string> = { current: "" };
  const abortControllerRef: MutableRefObject<AbortController | null> = { current: null };
  return {
    setError,
    setStreaming,
    streamingContentRef,
    abortControllerRef,
    treeRef,
    setTree,
  };
}

describe("executeSendMessage", () => {
  let uuidSeq = 0;
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadAISettings.mockResolvedValue(DEFAULT_AI_SETTINGS);
    mockStreamAssistantCompletion.mockResolvedValue(undefined);
    uuidSeq = 0;
    vi.spyOn(crypto, "randomUUID").mockImplementation(() => {
      uuidSeq += 1;
      return `test-uuid-${uuidSeq}` as ReturnType<typeof crypto.randomUUID>;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("appends user and assistant, then calls streamAssistantCompletion with system + user messages", async () => {
    const { treeRef, setTree, getTree } = createTreeHarness({
      messageMap: {},
      rootMessageId: null,
      activeLeafId: null,
    });
    const p = baseParams(treeRef, setTree);

    await executeSendMessage({
      content: "hello",
      messageRefs: [],
      pageContext: null,
      contextEnabled: false,
      existingPageTitles: [],
      ...p,
    });

    const t = getTree();
    expect(t.activeLeafId).toBe("test-uuid-2");
    expect(t.messageMap["test-uuid-1"]?.role).toBe("user");
    expect(t.messageMap["test-uuid-1"]?.content).toBe("hello");
    expect(t.messageMap["test-uuid-2"]?.role).toBe("assistant");
    expect(mockStreamAssistantCompletion).toHaveBeenCalledTimes(1);
    const call = mockStreamAssistantCompletion.mock.calls[0];
    expect(call[1].messages[0]).toEqual({ role: "system", content: "SYS" });
    expect(call[1].messages[1]).toMatchObject({ role: "user", content: "hello" });
  });

  it("returns early without streaming when branchFromUserMessageId is missing", async () => {
    const { treeRef, setTree, getTree } = createTreeHarness({
      messageMap: {},
      rootMessageId: null,
      activeLeafId: null,
    });
    const p = baseParams(treeRef, setTree);

    await executeSendMessage({
      content: "x",
      messageRefs: [],
      pageContext: null,
      contextEnabled: false,
      existingPageTitles: [],
      ...p,
      branchFromUserMessageId: "no-such-user",
    });

    expect(mockStreamAssistantCompletion).not.toHaveBeenCalled();
    expect(getTree().messageMap).toEqual({});
  });

  it("returns early when branchFromUserMessageId points to non-user", async () => {
    const { treeRef, setTree, getTree } = createTreeHarness({
      messageMap: {
        a1: {
          id: "a1",
          role: "assistant",
          content: "x",
          timestamp: 1,
          parentId: null,
        },
      },
      rootMessageId: "a1",
      activeLeafId: "a1",
    });
    const p = baseParams(treeRef, setTree);

    await executeSendMessage({
      content: "y",
      messageRefs: [],
      pageContext: null,
      contextEnabled: false,
      existingPageTitles: [],
      ...p,
      branchFromUserMessageId: "a1",
    });

    expect(mockStreamAssistantCompletion).not.toHaveBeenCalled();
    expect(getTree().messageMap).toEqual({
      a1: expect.objectContaining({ id: "a1", role: "assistant" }),
    });
  });

  it("patches assistant with error when loadAISettings returns null", async () => {
    mockLoadAISettings.mockResolvedValue(null);
    const { treeRef, setTree, getTree } = createTreeHarness({
      messageMap: {},
      rootMessageId: null,
      activeLeafId: null,
    });
    const p = baseParams(treeRef, setTree);

    await executeSendMessage({
      content: "hello",
      messageRefs: [],
      pageContext: null,
      contextEnabled: false,
      existingPageTitles: [],
      ...p,
    });

    expect(mockStreamAssistantCompletion).not.toHaveBeenCalled();
    expect(p.setStreaming).toHaveBeenCalledWith(false);
    expect(p.setError).toHaveBeenCalledWith("AI settings not configured");
    expect(getTree().messageMap["test-uuid-2"]?.error).toBe("AI settings not configured");
    expect(getTree().messageMap["test-uuid-2"]?.isStreaming).toBe(false);
  });
});

describe("executeRegenerateAssistant", () => {
  let uuidSeq = 0;
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadAISettings.mockResolvedValue(DEFAULT_AI_SETTINGS);
    mockStreamAssistantCompletion.mockResolvedValue(undefined);
    uuidSeq = 0;
    vi.spyOn(crypto, "randomUUID").mockImplementation(() => {
      uuidSeq += 1;
      return `reg-uuid-${uuidSeq}` as ReturnType<typeof crypto.randomUUID>;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("adds sibling assistant and calls streamAssistantCompletion", async () => {
    const { treeRef, setTree, getTree } = createTreeHarness({
      messageMap: {
        u1: { id: "u1", role: "user", content: "hi", timestamp: 1, parentId: null },
        a1: { id: "a1", role: "assistant", content: "old", timestamp: 2, parentId: "u1" },
      },
      rootMessageId: "u1",
      activeLeafId: "a1",
    });
    const p = baseParams(treeRef, setTree);

    await executeRegenerateAssistant({
      assistantMessageId: "a1",
      pageContext: null,
      contextEnabled: false,
      existingPageTitles: [],
      ...p,
    });

    expect(getTree().activeLeafId).toBe("reg-uuid-1");
    expect(getTree().messageMap["reg-uuid-1"]?.parentId).toBe("u1");
    expect(mockStreamAssistantCompletion).toHaveBeenCalledTimes(1);
    const req = mockStreamAssistantCompletion.mock.calls[0][1];
    expect(req.messages[0]).toEqual({ role: "system", content: "SYS" });
    expect(req.messages.some((m) => m.role === "user")).toBe(true);
  });

  it("returns early when assistant id is missing", async () => {
    const { treeRef, setTree, getTree } = createTreeHarness({
      messageMap: {},
      rootMessageId: null,
      activeLeafId: null,
    });
    const p = baseParams(treeRef, setTree);

    await executeRegenerateAssistant({
      assistantMessageId: "ghost",
      pageContext: null,
      contextEnabled: false,
      existingPageTitles: [],
      ...p,
    });

    expect(mockStreamAssistantCompletion).not.toHaveBeenCalled();
    expect(getTree().messageMap).toEqual({});
  });

  it("returns early when parent of assistant is not a user", async () => {
    const { treeRef, setTree, getTree } = createTreeHarness({
      messageMap: {
        a0: { id: "a0", role: "assistant", content: "x", timestamp: 1, parentId: null },
        a1: { id: "a1", role: "assistant", content: "y", timestamp: 2, parentId: "a0" },
      },
      rootMessageId: "a0",
      activeLeafId: "a1",
    });
    const p = baseParams(treeRef, setTree);

    await executeRegenerateAssistant({
      assistantMessageId: "a1",
      pageContext: null,
      contextEnabled: false,
      existingPageTitles: [],
      ...p,
    });

    expect(mockStreamAssistantCompletion).not.toHaveBeenCalled();
    expect(getTree().activeLeafId).toBe("a1");
  });
});
