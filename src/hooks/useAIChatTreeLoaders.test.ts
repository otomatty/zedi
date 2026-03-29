import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { ChatMessage, ChatTreeState, Conversation, MessageMap } from "../types/aiChat";
import { useAIChatTreeLoaders } from "./useAIChatTreeLoaders";

vi.mock("@/lib/conversationMigration", () => ({
  migrateConversation: vi.fn((c: Conversation) => c),
  flatMessagesToTree: vi.fn(
    (msgs: ChatMessage[]): ChatTreeState => ({
      messageMap: Object.fromEntries(
        msgs.map((m, i) => [m.id, { ...m, parentId: i === 0 ? null : msgs[i - 1].id }]),
      ),
      rootMessageId: msgs.length > 0 ? msgs[0].id : null,
      activeLeafId: msgs.length > 0 ? msgs[msgs.length - 1].id : null,
    }),
  ),
}));

import { migrateConversation, flatMessagesToTree } from "@/lib/conversationMigration";

describe("useAIChatTreeLoaders", () => {
  const setTree = vi.fn();
  const setError = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("clearMessages resets tree to empty and clears error", () => {
    const { result } = renderHook(() => useAIChatTreeLoaders({ setTree, setError }));

    act(() => result.current.clearMessages());

    expect(setTree).toHaveBeenCalledWith({
      messageMap: {},
      rootMessageId: null,
      activeLeafId: null,
    });
    expect(setError).toHaveBeenCalledWith(null);
  });

  it("loadMessages converts flat messages via flatMessagesToTree", () => {
    const msgs: ChatMessage[] = [
      { id: "m1", role: "user", content: "hi", timestamp: 1 },
      { id: "m2", role: "assistant", content: "hello", timestamp: 2 },
    ];

    const { result } = renderHook(() => useAIChatTreeLoaders({ setTree, setError }));

    act(() => result.current.loadMessages(msgs));

    expect(flatMessagesToTree).toHaveBeenCalledWith(msgs);
    expect(setTree).toHaveBeenCalledOnce();
  });

  it("loadConversation calls migrateConversation and sets tree", () => {
    const map: MessageMap = {
      m1: { id: "m1", role: "user", content: "hi", timestamp: 1, parentId: null },
    };
    const conv: Conversation = {
      id: "c1",
      title: "test",
      messageMap: map,
      rootMessageId: "m1",
      activeLeafId: "m1",
      createdAt: 0,
      updatedAt: 0,
    };

    vi.mocked(migrateConversation).mockReturnValueOnce(conv);

    const { result } = renderHook(() => useAIChatTreeLoaders({ setTree, setError }));

    act(() => result.current.loadConversation(conv));

    expect(migrateConversation).toHaveBeenCalledWith(conv);
    expect(setTree).toHaveBeenCalledWith({
      messageMap: map,
      rootMessageId: "m1",
      activeLeafId: "m1",
    });
  });

  it("loadConversation handles conversations with empty messageMap", () => {
    const conv: Conversation = {
      id: "c2",
      title: "empty",
      messageMap: undefined,
      rootMessageId: undefined,
      activeLeafId: undefined,
      createdAt: 0,
      updatedAt: 0,
    };

    vi.mocked(migrateConversation).mockReturnValueOnce({
      ...conv,
      messageMap: {},
      rootMessageId: null,
      activeLeafId: null,
    });

    const { result } = renderHook(() => useAIChatTreeLoaders({ setTree, setError }));

    act(() => result.current.loadConversation(conv));

    expect(setTree).toHaveBeenCalledWith({
      messageMap: {},
      rootMessageId: null,
      activeLeafId: null,
    });
  });
});
