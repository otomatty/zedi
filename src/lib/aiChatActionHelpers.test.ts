import { describe, expect, it } from "vitest";
import {
  appendMarkdownToTiptapContent,
  buildSuggestedWikiLinksMarkdown,
  convertMarkdownToTiptapContent,
  getCreatePageOutline,
  getMissingSuggestedWikiLinkTitles,
  normalizePageTitle,
  resolveReferencedPagesFromContent,
  serializeChatMessagesForPageGeneration,
  MAX_CHAT_CONTEXT_CHARS,
} from "./aiChatActionHelpers";
import type { CreatePageAction } from "@/types/aiChat";

describe("normalizePageTitle", () => {
  it("lowercases and trims for stable comparison", () => {
    expect(normalizePageTitle("  Hello World  ")).toBe("hello world");
  });
});

describe("resolveReferencedPagesFromContent", () => {
  it("prefers the longest matching page title", () => {
    const referencedPages = resolveReferencedPagesFromContent("Discuss @AI Chat and @Other.", [
      { id: "1", title: "AI", isDeleted: false },
      { id: "2", title: "AI Chat", isDeleted: false },
      { id: "3", title: "Other", isDeleted: false },
    ]);

    expect(referencedPages).toEqual([
      { id: "2", title: "AI Chat" },
      { id: "3", title: "Other" },
    ]);
  });

  it("returns empty when content is whitespace-only", () => {
    expect(
      resolveReferencedPagesFromContent("   \n\t", [{ id: "1", title: "A", isDeleted: false }]),
    ).toEqual([]);
  });
});

describe("appendMarkdownToTiptapContent", () => {
  it("appends converted markdown without dropping existing content", () => {
    const existingContent = JSON.stringify({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Existing" }],
        },
      ],
    });

    const appended = appendMarkdownToTiptapContent(existingContent, "## Heading\n- [[Page A]]");
    const parsed = JSON.parse(appended) as {
      content: Array<Record<string, unknown>>;
    };

    expect(parsed.content).toHaveLength(3);
    expect(parsed.content[0]).toMatchObject({
      type: "paragraph",
      content: [{ type: "text", text: "Existing" }],
    });
    expect(parsed.content[1]).toMatchObject({
      type: "heading",
      attrs: { level: 2 },
    });
    expect(parsed.content[2]).toMatchObject({
      type: "bulletList",
    });
    expect(parsed.content[2]).toMatchObject({
      content: [
        {
          content: [
            {
              content: [
                {
                  type: "text",
                  text: "[[Page A]]",
                  marks: [{ type: "wikiLink", attrs: { title: "Page A", exists: false } }],
                },
              ],
            },
          ],
        },
      ],
    });
  });

  it("throws when existing content is invalid JSON", () => {
    expect(() => appendMarkdownToTiptapContent("{invalid", "Append")).toThrow(
      "Invalid existing Tiptap document",
    );
  });

  it("appends to an empty serialized document", () => {
    const appended = appendMarkdownToTiptapContent("", "Plain");
    const parsed = JSON.parse(appended) as { content: Array<Record<string, unknown>> };
    expect(parsed.content.length).toBeGreaterThan(0);
  });
});

describe("getMissingSuggestedWikiLinkTitles", () => {
  it("filters titles already linked or duplicated", () => {
    const existingContent = JSON.stringify({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "[[Page A]]",
              marks: [{ type: "wikiLink", attrs: { title: "Page A", exists: true } }],
            },
          ],
        },
      ],
    });

    expect(
      getMissingSuggestedWikiLinkTitles(existingContent, ["page a", "Page B", "Page B"]),
    ).toEqual(["Page B"]);
  });
});

describe("buildSuggestedWikiLinksMarkdown", () => {
  it("builds a bullet list of wiki links", () => {
    expect(buildSuggestedWikiLinksMarkdown(["Page A", "Page B"])).toBe(
      "- [[Page A]]\n- [[Page B]]",
    );
  });

  it("omits blank titles", () => {
    expect(buildSuggestedWikiLinksMarkdown(["A", "", "  ", "B"])).toBe("- [[A]]\n- [[B]]");
  });
});

describe("convertMarkdownToTiptapContent (URL sanitization)", () => {
  it("keeps invalid/dangerous link URLs as plain text to prevent XSS and preserve content", () => {
    const result = convertMarkdownToTiptapContent("[Click me](javascript:alert(1))");
    const parsed = JSON.parse(result) as { content: Array<Record<string, unknown>> };
    const paragraph = parsed.content[0] as {
      content?: Array<{ type: string; text?: string; marks?: unknown[] }>;
    };
    expect(paragraph.content?.[0]).toMatchObject({
      type: "text",
      text: "[Click me](javascript:alert(1))",
    });
    expect(paragraph.content?.[0]).not.toHaveProperty("marks");
  });

  it("allows https links", () => {
    const result = convertMarkdownToTiptapContent("[Safe](https://example.com)");
    const parsed = JSON.parse(result) as { content: Array<Record<string, unknown>> };
    const paragraph = parsed.content[0] as {
      content?: Array<{ marks?: Array<{ attrs?: { href?: string } }> }>;
    };
    expect(paragraph.content?.[0]?.marks?.[0]?.attrs).toMatchObject({
      href: "https://example.com",
    });
  });
});

describe("getCreatePageOutline", () => {
  it("returns trimmed outline", () => {
    const action = {
      type: "create-page",
      title: "T",
      outline: "- A\n- B",
      suggestedLinks: [],
      reason: "r",
    } as CreatePageAction;
    expect(getCreatePageOutline(action)).toBe("- A\n- B");
  });

  it("returns empty string when outline missing", () => {
    const action = {
      type: "create-page",
      title: "T",
      suggestedLinks: [],
      reason: "r",
    } as CreatePageAction;
    expect(getCreatePageOutline(action)).toBe("");
  });
});

describe("serializeChatMessagesForPageGeneration", () => {
  it("joins user and assistant messages", () => {
    const text = serializeChatMessagesForPageGeneration([
      { id: "1", role: "user", content: "Hi", timestamp: 1 },
      { id: "2", role: "assistant", content: "Hello", timestamp: 2 },
    ]);
    expect(text).toContain("User: Hi");
    expect(text).toContain("Assistant: Hello");
  });

  it("truncates from the start when over max length", () => {
    const long = "x".repeat(MAX_CHAT_CONTEXT_CHARS + 100);
    const text = serializeChatMessagesForPageGeneration([
      { id: "1", role: "user", content: long, timestamp: 1 },
    ]);
    expect(text.length).toBe(MAX_CHAT_CONTEXT_CHARS);
    expect(text.startsWith("User:")).toBe(false);
  });

  it("omits system messages from serialized chat", () => {
    const text = serializeChatMessagesForPageGeneration([
      { id: "0", role: "system", content: "hidden", timestamp: 0 },
      { id: "1", role: "user", content: "visible", timestamp: 1 },
    ]);
    expect(text).toBe("User: visible");
    expect(text).not.toContain("system");
  });

  it("returns empty string when only system messages exist", () => {
    expect(
      serializeChatMessagesForPageGeneration([
        { id: "0", role: "system", content: "s", timestamp: 0 },
      ]),
    ).toBe("");
  });

  it("does not truncate when joined text length equals max", () => {
    const prefix = "User: ";
    const content = "y".repeat(MAX_CHAT_CONTEXT_CHARS - prefix.length);
    const text = serializeChatMessagesForPageGeneration([
      { id: "1", role: "user", content, timestamp: 1 },
    ]);
    expect(text).toBe(prefix + content);
    expect(text.length).toBe(MAX_CHAT_CONTEXT_CHARS);
  });
});
