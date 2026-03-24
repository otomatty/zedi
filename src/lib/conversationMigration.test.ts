import { describe, it, expect } from "vitest";
import type { ChatMessage, Conversation } from "../types/aiChat";
import { migrateConversation, needsMigration } from "./conversationMigration";

describe("needsMigration", () => {
  it("returns true when legacy messages array is present without messageMap", () => {
    expect(needsMigration({ messages: [] } as Conversation)).toBe(true);
    expect(
      needsMigration({
        messages: [{ id: "u1", role: "user", content: "Hi", timestamp: 0 }],
      } as Conversation),
    ).toBe(true);
  });

  it("returns false when messageMap is present", () => {
    expect(
      needsMigration({
        messageMap: {},
        rootMessageId: null,
        activeLeafId: null,
      } as Conversation),
    ).toBe(false);
  });
});

describe("migrateConversation", () => {
  it("converts flat messages to messageMap with parent chain", () => {
    const messages: ChatMessage[] = [
      { id: "u1", role: "user", content: "Hi", timestamp: 1 },
      { id: "a1", role: "assistant", content: "Hello", timestamp: 2 },
    ];
    const conv: Conversation = {
      id: "c1",
      title: "",
      messages,
      createdAt: 0,
      updatedAt: 0,
    };
    const out = migrateConversation(conv);
    expect(out.messageMap?.u1.parentId).toBeNull();
    expect(out.messageMap?.a1.parentId).toBe("u1");
    expect(out.rootMessageId).toBe("u1");
    expect(out.activeLeafId).toBe("a1");
    expect(out.messages).toBeUndefined();
  });

  it("uses empty map when messages array is empty", () => {
    const conv: Conversation = {
      id: "c1",
      title: "t",
      messages: [],
      createdAt: 0,
      updatedAt: 0,
    };
    const out = migrateConversation(conv);
    expect(out.messageMap).toEqual({});
    expect(out.rootMessageId).toBeNull();
    expect(out.activeLeafId).toBeNull();
  });

  it("is idempotent when messageMap already exists", () => {
    const existing: Conversation = {
      id: "c1",
      title: "t",
      messageMap: {
        u1: { id: "u1", role: "user", parentId: null, content: "x", timestamp: 1 },
      },
      rootMessageId: "u1",
      activeLeafId: "u1",
      createdAt: 0,
      updatedAt: 0,
    };
    expect(migrateConversation(existing)).toEqual(existing);
  });
});
