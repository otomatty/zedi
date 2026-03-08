import { describe, expect, it } from "vitest";
import {
  appendMarkdownToTiptapContent,
  buildSuggestedWikiLinksMarkdown,
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
