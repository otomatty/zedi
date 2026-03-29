import { describe, it, expect } from "vitest";
import { generateConversationTitleFromTree } from "./aiChatConversationTitle";

describe("generateConversationTitleFromTree", () => {
  it("returns empty string when no user message on path (caller localizes)", () => {
    const map = {
      a: {
        id: "a",
        role: "assistant" as const,
        content: "hi",
        timestamp: 1,
        parentId: null as string | null,
      },
    };
    expect(generateConversationTitleFromTree(map, "a")).toBe("");
  });

  it("uses first user message and truncates with ellipsis", () => {
    const map = {
      u: {
        id: "u",
        role: "user" as const,
        content: "x".repeat(60),
        timestamp: 1,
        parentId: null,
      },
      a: {
        id: "a",
        role: "assistant" as const,
        content: "ok",
        timestamp: 2,
        parentId: "u",
      },
    };
    const title = generateConversationTitleFromTree(map, "a");
    expect(title.endsWith("...")).toBe(true);
    expect(title.length).toBeLessThanOrEqual(53);
  });

  it("does not add ellipsis when under 50 chars", () => {
    const map = {
      u: {
        id: "u",
        role: "user" as const,
        content: "short",
        timestamp: 1,
        parentId: null,
      },
    };
    expect(generateConversationTitleFromTree(map, "u")).toBe("short");
  });
});
