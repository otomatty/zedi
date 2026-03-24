import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { Conversation } from "../types/aiChat";
import { useAIChat } from "./useAIChat";

const mockSetStreaming = vi.fn();
const mockExecuteSendMessage = vi.fn();

vi.mock("../stores/aiChatStore", () => ({
  useAIChatStore: () => ({
    setStreaming: mockSetStreaming,
    isStreaming: false,
  }),
}));

vi.mock("./useAIChatExecute", () => ({
  executeSendMessage: (...args: unknown[]) => mockExecuteSendMessage(...args),
  executeRegenerateAssistant: vi.fn(),
}));

const defaultOptions = {
  pageContext: null,
  contextEnabled: false,
  existingPageTitles: [] as string[],
  availablePages: [
    { id: "p1", title: "Page One", isDeleted: false },
    { id: "p2", title: "Page Two", isDeleted: false },
  ] as Array<{ id: string; title: string; isDeleted: boolean }>,
};

describe("useAIChat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExecuteSendMessage.mockResolvedValue(undefined);
  });

  it("returns initial empty messages and no error", () => {
    const { result } = renderHook(() => useAIChat(defaultOptions));

    expect(result.current.messages).toEqual([]);
    expect(result.current.error).toBeNull();
    expect(result.current.isStreaming).toBe(false);
  });

  it("clearMessages clears messages and error", () => {
    const { result } = renderHook(() => useAIChat(defaultOptions));

    act(() => {
      result.current.loadMessages([
        {
          id: "m1",
          role: "user",
          content: "Hello",
          timestamp: 0,
        },
      ]);
    });
    expect(result.current.messages).toHaveLength(1);

    act(() => {
      result.current.clearMessages();
    });
    expect(result.current.messages).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it("loadMessages sets linear tree messages", () => {
    const { result } = renderHook(() => useAIChat(defaultOptions));
    const msgs = [
      { id: "m1", role: "user" as const, content: "Hi", timestamp: 0 },
      { id: "m2", role: "assistant" as const, content: "Hi there", timestamp: 1 },
    ];

    act(() => {
      result.current.loadMessages(msgs);
    });

    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[0].content).toBe("Hi");
    expect(result.current.messages[1].content).toBe("Hi there");
    expect(result.current.activeLeafId).toBe("m2");
  });
});

describe("useAIChat editAndResend", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExecuteSendMessage.mockResolvedValue(undefined);
  });

  it("calls executeSendMessage with branchFromUserMessageId and resolved refs", async () => {
    const { result } = renderHook(() => useAIChat(defaultOptions));

    act(() => {
      result.current.loadMessages([
        { id: "u1", role: "user", content: "Old @Page One", timestamp: 0 },
        { id: "a1", role: "assistant", content: "Reply", timestamp: 1 },
      ]);
    });

    await act(async () => {
      await result.current.editAndResend("u1", "Updated with @Page Two");
    });

    expect(mockExecuteSendMessage).toHaveBeenCalledTimes(1);
    const params = mockExecuteSendMessage.mock.calls[0][0] as {
      content: string;
      branchFromUserMessageId?: string;
      messageRefs: unknown;
    };
    expect(params.content).toBe("Updated with @Page Two");
    expect(params.branchFromUserMessageId).toBe("u1");
    expect(params.messageRefs).toEqual([{ id: "p2", title: "Page Two" }]);
  });

  it("does nothing when messageId not found", async () => {
    const { result } = renderHook(() => useAIChat(defaultOptions));

    act(() => {
      result.current.loadMessages([{ id: "u1", role: "user", content: "Hi", timestamp: 0 }]);
    });

    await act(async () => {
      await result.current.editAndResend("nonexistent", "New");
    });

    expect(mockExecuteSendMessage).not.toHaveBeenCalled();
  });

  it("does nothing when message is not user role", async () => {
    const { result } = renderHook(() => useAIChat(defaultOptions));

    act(() => {
      result.current.loadMessages([{ id: "a1", role: "assistant", content: "Hi", timestamp: 0 }]);
    });

    await act(async () => {
      await result.current.editAndResend("a1", "New");
    });

    expect(mockExecuteSendMessage).not.toHaveBeenCalled();
  });

  it("preserves existing referenced pages when availablePages is not provided", async () => {
    const { result } = renderHook(() =>
      useAIChat({
        pageContext: null,
        contextEnabled: false,
        existingPageTitles: [],
      }),
    );

    act(() => {
      result.current.loadMessages([
        {
          id: "u1",
          role: "user",
          content: "Old content",
          referencedPages: [{ id: "p-existing", title: "Existing Page" }],
          timestamp: 0,
        },
      ]);
    });

    await act(async () => {
      await result.current.editAndResend("u1", "Updated content");
    });

    const params = mockExecuteSendMessage.mock.calls[0][0] as { messageRefs: unknown };
    expect(params.messageRefs).toEqual([{ id: "p-existing", title: "Existing Page" }]);
  });
});

describe("useAIChat branches", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExecuteSendMessage.mockResolvedValue(undefined);
  });

  it("switchBranch updates active path between assistant siblings", () => {
    const branched: Conversation = {
      id: "c1",
      title: "",
      messageMap: {
        u1: { id: "u1", role: "user", parentId: null, content: "Hi", timestamp: 1 },
        a1: { id: "a1", role: "assistant", parentId: "u1", content: "First", timestamp: 2 },
        a2: { id: "a2", role: "assistant", parentId: "u1", content: "Second", timestamp: 3 },
      },
      rootMessageId: "u1",
      activeLeafId: "a2",
      createdAt: 0,
      updatedAt: 0,
    };

    const { result } = renderHook(() => useAIChat(defaultOptions));

    act(() => {
      result.current.loadConversation(branched);
    });

    expect(result.current.messages.map((m) => m.id)).toEqual(["u1", "a2"]);

    act(() => {
      result.current.switchBranch("a2", "prev");
    });

    expect(result.current.messages.map((m) => m.id)).toEqual(["u1", "a1"]);
  });
});
