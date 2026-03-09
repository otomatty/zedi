import { describe, expect, it } from "vitest";
import {
  appendMarkdownToTiptapContent,
  buildSuggestedWikiLinksMarkdown,
  convertMarkdownToTiptapContent,
  getMissingSuggestedWikiLinkTitles,
  resolveReferencedPagesFromContent,
} from "./aiChatActionHelpers";

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
