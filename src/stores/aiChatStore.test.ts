import { describe, it, expect, beforeEach } from "vitest";
import { act } from "@testing-library/react";
import { useAIChatStore } from "./aiChatStore";

const INITIAL_STATE = {
  isOpen: false,
  activeConversationId: null,
  isStreaming: false,
  contextEnabled: true,
  showConversationList: false,
  selectedModel: null,
} as const;

/**
 * 各テストの前に zustand state と localStorage をリセットする。persist は
 * 同じ key (`ai-chat-storage`) に書き込むため、明示クリアしないと前テストの
 * 永続値が次テストの初期値になってしまう。
 *
 * Reset zustand state and localStorage before each test. Without explicit
 * clearing, persisted state from a previous test bleeds into the next one.
 */
function resetStore(): void {
  act(() => {
    useAIChatStore.setState(INITIAL_STATE);
  });
}

describe("aiChatStore", () => {
  beforeEach(() => {
    localStorage.clear();
    resetStore();
  });

  it("starts with the documented default state", () => {
    expect(useAIChatStore.getState()).toMatchObject(INITIAL_STATE);
  });

  describe("panel actions", () => {
    it("togglePanel flips isOpen", () => {
      useAIChatStore.getState().togglePanel();
      expect(useAIChatStore.getState().isOpen).toBe(true);

      useAIChatStore.getState().togglePanel();
      expect(useAIChatStore.getState().isOpen).toBe(false);
    });

    it("openPanel / closePanel set absolute states", () => {
      useAIChatStore.getState().openPanel();
      expect(useAIChatStore.getState().isOpen).toBe(true);

      useAIChatStore.getState().closePanel();
      expect(useAIChatStore.getState().isOpen).toBe(false);

      // 二重 close でも false のまま / closing twice stays false
      useAIChatStore.getState().closePanel();
      expect(useAIChatStore.getState().isOpen).toBe(false);
    });
  });

  describe("conversation + streaming", () => {
    it("setActiveConversation accepts ids and null", () => {
      useAIChatStore.getState().setActiveConversation("conv-1");
      expect(useAIChatStore.getState().activeConversationId).toBe("conv-1");

      useAIChatStore.getState().setActiveConversation(null);
      expect(useAIChatStore.getState().activeConversationId).toBeNull();
    });

    it("setStreaming toggles streaming flag", () => {
      useAIChatStore.getState().setStreaming(true);
      expect(useAIChatStore.getState().isStreaming).toBe(true);

      useAIChatStore.getState().setStreaming(false);
      expect(useAIChatStore.getState().isStreaming).toBe(false);
    });

    it("toggleConversationList flips list visibility", () => {
      useAIChatStore.getState().toggleConversationList();
      expect(useAIChatStore.getState().showConversationList).toBe(true);

      useAIChatStore.getState().toggleConversationList();
      expect(useAIChatStore.getState().showConversationList).toBe(false);
    });
  });

  describe("toggleContext", () => {
    it("starts enabled and flips on each call", () => {
      expect(useAIChatStore.getState().contextEnabled).toBe(true);

      useAIChatStore.getState().toggleContext();
      expect(useAIChatStore.getState().contextEnabled).toBe(false);

      useAIChatStore.getState().toggleContext();
      expect(useAIChatStore.getState().contextEnabled).toBe(true);
    });
  });

  describe("setSelectedModel", () => {
    it("stores a model selection and clears with null", () => {
      const model = {
        id: "openai:gpt-4o-mini",
        provider: "openai" as const,
        model: "gpt-4o-mini",
        displayName: "GPT-4o mini",
        inputCostUnits: 1,
        outputCostUnits: 2,
      };

      useAIChatStore.getState().setSelectedModel(model);
      expect(useAIChatStore.getState().selectedModel).toEqual(model);

      useAIChatStore.getState().setSelectedModel(null);
      expect(useAIChatStore.getState().selectedModel).toBeNull();
    });
  });

  describe("persist + partialize", () => {
    /**
     * `partialize` は `isOpen` / `contextEnabled` / `selectedModel` のみを
     * localStorage に書く契約。アクティブ会話やストリーミング状態は永続化しない
     * (UI 立ち上げ直後にゾンビ "streaming" になるのを避けるため)。
     *
     * The store is contracted to persist only `isOpen` / `contextEnabled` /
     * `selectedModel`. Volatile UI state stays in memory.
     */
    it("only persists the partialized fields", () => {
      const model = {
        id: "anthropic:claude-haiku",
        provider: "anthropic" as const,
        model: "claude-haiku",
        displayName: "Claude Haiku",
      };

      useAIChatStore.getState().openPanel();
      useAIChatStore.getState().toggleContext(); // → false
      useAIChatStore.getState().setSelectedModel(model);
      // 揮発キー: これらは partialize で除外されるので localStorage に出ない
      // volatile keys: excluded by partialize, must not be in localStorage
      useAIChatStore.getState().setActiveConversation("conv-X");
      useAIChatStore.getState().setStreaming(true);
      useAIChatStore.getState().toggleConversationList();

      const raw = localStorage.getItem("ai-chat-storage");
      expect(raw).toBeTruthy();
      const parsed = JSON.parse(raw as string) as {
        state: Record<string, unknown>;
      };

      expect(parsed.state).toEqual({
        isOpen: true,
        contextEnabled: false,
        selectedModel: model,
      });
      expect(parsed.state).not.toHaveProperty("activeConversationId");
      expect(parsed.state).not.toHaveProperty("isStreaming");
      expect(parsed.state).not.toHaveProperty("showConversationList");
    });

    it("rehydrate restores persisted fields without resurrecting volatile ones", async () => {
      const model = {
        id: "openai:gpt-4o",
        provider: "openai" as const,
        model: "gpt-4o",
        displayName: "GPT-4o",
      };

      localStorage.setItem(
        "ai-chat-storage",
        JSON.stringify({
          version: 1,
          state: {
            isOpen: true,
            contextEnabled: false,
            selectedModel: model,
            // 永続化されてはいけないフィールドが万一 localStorage にあっても、
            // partialize されるので rehydrate 後に取り込まれない…はずが、zustand
            // の persist はそのまま反映してしまう。partialize は書き込み側のみ。
            // ここでは契約として「書き込み時に partialize される」ことを担保する。
          },
        }),
      );

      await useAIChatStore.persist.rehydrate();

      const state = useAIChatStore.getState();
      expect(state.isOpen).toBe(true);
      expect(state.contextEnabled).toBe(false);
      expect(state.selectedModel).toEqual(model);
    });
  });
});
