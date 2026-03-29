import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import React from "react";
import { AIChatConversationsProvider, useAIChatConversations } from "./useAIChatConversations";

const store = new Map<string, string>();

function createMockLocalStorage() {
  return {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      store.delete(key);
    }),
    clear: vi.fn(() => {
      store.clear();
    }),
    length: 0,
    key: vi.fn(),
  };
}

beforeEach(() => {
  store.clear();
  vi.stubGlobal("localStorage", createMockLocalStorage());
});

function wrapper({ children }: { children: React.ReactNode }) {
  return <AIChatConversationsProvider>{children}</AIChatConversationsProvider>;
}

describe("useAIChatConversations", () => {
  it("createConversation returns a new conversation and prepends", () => {
    const { result } = renderHook(() => useAIChatConversations(), { wrapper });
    let id = "";
    act(() => {
      const c = result.current.createConversation();
      id = c.id;
      expect(c.messageMap).toEqual({});
    });
    expect(result.current.getConversation(id)).toBeDefined();
    expect(result.current.conversations[0]).toMatchObject({ id });
  });

  it("updateConversation sets tree fields and clears legacy messages", () => {
    const { result } = renderHook(() => useAIChatConversations(), { wrapper });
    let id = "";
    act(() => {
      const c = result.current.createConversation();
      id = c.id;
    });
    act(() => {
      result.current.updateConversation(id, {
        messageMap: {
          u: {
            id: "u",
            role: "user",
            content: "hello world",
            timestamp: 1,
            parentId: null,
          },
        },
        rootMessageId: "u",
        activeLeafId: "u",
      });
    });
    const updated = result.current.getConversation(id);
    expect(updated?.messages).toBeUndefined();
    expect(updated?.messageMap?.u?.content).toBe("hello world");
    expect(updated?.title).toBe("hello world");
  });

  it("deleteConversation removes the conversation", () => {
    const { result } = renderHook(() => useAIChatConversations(), { wrapper });
    let id = "";
    act(() => {
      id = result.current.createConversation().id;
    });
    act(() => {
      result.current.deleteConversation(id);
    });
    expect(result.current.getConversation(id)).toBeUndefined();
  });

  it("getConversationsForPage filters by pageId", () => {
    const { result } = renderHook(() => useAIChatConversations(), { wrapper });
    act(() => {
      result.current.createConversation({
        type: "editor",
        pageId: "page-a",
        pageTitle: "A",
      });
      result.current.createConversation({
        type: "editor",
        pageId: "page-b",
        pageTitle: "B",
      });
    });
    const forA = result.current.getConversationsForPage("page-a");
    expect(forA).toHaveLength(1);
    expect(forA[0].pageContext?.pageId).toBe("page-a");
  });

  it("caps at MAX_CONVERSATIONS by dropping oldest", () => {
    const { result } = renderHook(() => useAIChatConversations(), { wrapper });
    const ids: string[] = [];
    act(() => {
      for (let i = 0; i < 51; i += 1) {
        ids.push(result.current.createConversation().id);
      }
    });
    expect(result.current.conversations).toHaveLength(50);
    expect(result.current.getConversation(ids[0])).toBeUndefined();
    expect(result.current.getConversation(ids[50])).toBeDefined();
  });
});
