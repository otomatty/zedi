import { describe, expect, it } from "vitest";
import {
  appendMarkdownToTiptapContent,
  appendTiptapContent,
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
import { MAX_REFERENCED_PAGES } from "@/types/aiChat";

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

  it("returns empty when pages list is empty", () => {
    expect(resolveReferencedPagesFromContent("Hello @Nobody", [])).toEqual([]);
  });

  it("skips deleted pages and pages with blank titles", () => {
    expect(
      resolveReferencedPagesFromContent("@Keep @Drop", [
        { id: "1", title: "Keep", isDeleted: false },
        { id: "2", title: "Drop", isDeleted: true },
        { id: "3", title: "   ", isDeleted: false },
      ]),
    ).toEqual([{ id: "1", title: "Keep" }]);
  });

  it("dedupes duplicate @mentions of the same page", () => {
    expect(
      resolveReferencedPagesFromContent("@Same @Same", [
        { id: "1", title: "Same", isDeleted: false },
      ]),
    ).toEqual([{ id: "1", title: "Same" }]);
  });

  it("resolves overlapping spans by keeping the first match in document order", () => {
    const pages = [
      { id: "short", title: "AB", isDeleted: false },
      { id: "long", title: "ABC", isDeleted: false },
    ];
    const result = resolveReferencedPagesFromContent("@ABC extra", pages);
    expect(result.map((p) => p.id)).toEqual(["long"]);
  });

  it("caps results at MAX_REFERENCED_PAGES in first-occurrence order", () => {
    const pages = Array.from({ length: 8 }, (_, i) => ({
      id: `id-${i}`,
      title: `P${i}`,
      isDeleted: false,
    }));
    const content = pages.map((p) => `@${p.title}`).join(" ");
    const result = resolveReferencedPagesFromContent(content, pages);
    expect(result).toHaveLength(MAX_REFERENCED_PAGES);
    expect(result.map((p) => p.title)).toEqual(["P0", "P1", "P2", "P3", "P4"]);
  });

  it("keeps stable order by match position after sorting candidates by title length", () => {
    const result = resolveReferencedPagesFromContent("@B @A", [
      { id: "a", title: "A", isDeleted: false },
      { id: "b", title: "B", isDeleted: false },
    ]);
    expect(result.map((p) => p.title)).toEqual(["B", "A"]);
  });

  it("resolves @mention after leading whitespace (non-empty match prefix)", () => {
    const result = resolveReferencedPagesFromContent("prefix @TeamPage", [
      { id: "1", title: "TeamPage", isDeleted: false },
    ]);
    expect(result).toEqual([{ id: "1", title: "TeamPage" }]);
  });

  it("matches page titles that need regex escaping in @mentions", () => {
    const result = resolveReferencedPagesFromContent("See @Wiki.Link?", [
      { id: "x", title: "Wiki.Link", isDeleted: false },
    ]);
    expect(result).toEqual([{ id: "x", title: "Wiki.Link" }]);
  });

  it("ignores candidate pages whose title is only whitespace", () => {
    expect(
      resolveReferencedPagesFromContent("@Valid", [
        { id: "1", title: "Valid", isDeleted: false },
        { id: "2", title: " \t\n", isDeleted: false },
      ]),
    ).toEqual([{ id: "1", title: "Valid" }]);
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
    // `##` → Tiptap level 2 (body: ##/###/####/##### = 2/3/4/5; `# X` stays literal because
    // the page h1 lives in the title field)
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

  // issue #784: AI が `# Title` を含む Markdown を返したケース。
  // issue #784: AI returns Markdown with a stray leading `# Title`.
  describe("with dropLeadingH1 option (AI append path, issue #784)", () => {
    /**
     * `dropLeadingH1: true` を渡すと、AI 出力の `# Title` 行が本文に literal
     * paragraph として残らない。
     * With `dropLeadingH1: true`, a leading `# Title` line from AI output does not survive
     * in the appended body as a literal paragraph.
     */
    it("does not leave `# Title` as a literal paragraph when AI append path is used", () => {
      const existingContent = JSON.stringify({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Existing" }],
          },
        ],
      });

      const appended = appendMarkdownToTiptapContent(existingContent, "# Title\n## Section\n本文", {
        dropLeadingH1: true,
      });
      const parsed = JSON.parse(appended) as {
        content: Array<{
          type: string;
          attrs?: { level: number };
          content?: Array<{ text?: string }>;
        }>;
      };

      const literalH1 = parsed.content.find((n) => {
        if (n.type !== "paragraph") return false;
        return n.content?.some((node) => node.text === "# Title");
      });
      expect(literalH1).toBeUndefined();

      // `## Section` は h2 として残り、本文の paragraph も保持される。
      // `## Section` is preserved as h2 and the body paragraph survives.
      expect(parsed.content[0]).toMatchObject({
        type: "paragraph",
        content: [{ type: "text", text: "Existing" }],
      });
      expect(parsed.content.some((n) => n.type === "heading" && n.attrs?.level === 2)).toBe(true);
      expect(
        parsed.content.some(
          (n) => n.type === "paragraph" && n.content?.some((node) => node.text === "本文"),
        ),
      ).toBe(true);
    });

    /**
     * 既定では従来通り `# Title` が literal paragraph として残る（人手入力用）。
     * Default behavior preserves `# Title` as a literal paragraph (human-input path).
     */
    it("default (no option) preserves `# Title` as literal paragraph", () => {
      const existingContent = JSON.stringify({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Existing" }],
          },
        ],
      });

      const appended = appendMarkdownToTiptapContent(existingContent, "# Title\n## Section");
      const parsed = JSON.parse(appended) as {
        content: Array<{ type: string; content?: Array<{ text?: string }> }>;
      };

      const literalH1 = parsed.content.find((n) => {
        if (n.type !== "paragraph") return false;
        return n.content?.some((node) => node.text === "# Title");
      });
      expect(literalH1).toBeDefined();
    });
  });
});

describe("appendTiptapContent", () => {
  const minimalDoc = JSON.stringify({ type: "doc", content: [] });

  it("throws when appended payload is invalid JSON", () => {
    expect(() => appendTiptapContent(minimalDoc, "{not-json")).toThrow(
      "Invalid appended Tiptap document",
    );
  });

  it("throws when appended JSON is not a doc root", () => {
    expect(() => appendTiptapContent(minimalDoc, '{"type":"paragraph"}')).toThrow(
      "Invalid appended Tiptap document",
    );
  });

  it("throws when existing doc has non-array content", () => {
    expect(() =>
      appendTiptapContent(JSON.stringify({ type: "doc", content: null }), minimalDoc),
    ).toThrow("Invalid existing Tiptap document");
  });

  it("throws when appended doc has non-array content", () => {
    expect(() =>
      appendTiptapContent(minimalDoc, JSON.stringify({ type: "doc", content: null })),
    ).toThrow("Invalid appended Tiptap document");
  });

  it("throws when existing root type is not doc", () => {
    expect(() =>
      appendTiptapContent(JSON.stringify({ type: "paragraph", content: [] }), minimalDoc),
    ).toThrow("Invalid existing Tiptap document");
  });

  it("concatenates content arrays for two valid docs", () => {
    const a = JSON.stringify({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "A" }] }],
    });
    const b = JSON.stringify({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "B" }] }],
    });
    const out = JSON.parse(appendTiptapContent(a, b)) as {
      content: Array<{ content?: unknown[] }>;
    };
    expect(out.content).toHaveLength(2);
    expect(out.content[0].content?.[0]).toMatchObject({ text: "A" });
    expect(out.content[1].content?.[0]).toMatchObject({ text: "B" });
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

  it("returns empty when every suggested title is already present or blank", () => {
    const existingContent = JSON.stringify({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "[[X]]",
              marks: [{ type: "wikiLink", attrs: { title: "X", exists: true } }],
            },
          ],
        },
      ],
    });
    expect(getMissingSuggestedWikiLinkTitles(existingContent, ["x", "  ", ""])).toEqual([]);
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

  it("trims titles before building link text", () => {
    expect(buildSuggestedWikiLinksMarkdown(["  Spaced  "])).toBe("- [[Spaced]]");
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

  it("uses outline field, not title", () => {
    const action = {
      type: "create-page",
      title: "TitleOnly",
      outline: "OutlineBody",
      suggestedLinks: [],
      reason: "r",
    } as CreatePageAction;
    expect(getCreatePageOutline(action)).toBe("OutlineBody");
    expect(getCreatePageOutline(action)).not.toContain("TitleOnly");
  });

  it("trims outline whitespace via optional chain", () => {
    const action = {
      type: "create-page",
      title: "T",
      outline: "  padded  ",
      suggestedLinks: [],
      reason: "r",
    } as CreatePageAction;
    expect(getCreatePageOutline(action)).toBe("padded");
  });
});

describe("serializeChatMessagesForPageGeneration", () => {
  it("joins user and assistant messages", () => {
    const text = serializeChatMessagesForPageGeneration([
      { id: "1", role: "user", content: "Hi", timestamp: 1 },
      { id: "2", role: "assistant", content: "Hello", timestamp: 2 },
    ]);
    expect(text).toBe("User: Hi\n\nAssistant: Hello");
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

  it("truncates when joined text is one character over max", () => {
    const prefix = "User: ";
    const content = "y".repeat(MAX_CHAT_CONTEXT_CHARS - prefix.length + 1);
    const text = serializeChatMessagesForPageGeneration([
      { id: "1", role: "user", content, timestamp: 1 },
    ]);
    expect(text.length).toBe(MAX_CHAT_CONTEXT_CHARS);
    expect(text.endsWith("y")).toBe(true);
    expect(text.startsWith(prefix)).toBe(false);
  });
});
