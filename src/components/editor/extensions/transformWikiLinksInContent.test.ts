import { describe, expect, it } from "vitest";
import {
  WIKI_LINK_TEXT_REGEX,
  containsWikiLinkPattern,
  transformWikiLinksInContent,
} from "./transformWikiLinksInContent";

describe("containsWikiLinkPattern", () => {
  it("returns true for text containing a wiki link", () => {
    expect(containsWikiLinkPattern("see [[Foo]] for details")).toBe(true);
  });

  it("returns true for text that is a single wiki link", () => {
    expect(containsWikiLinkPattern("[[Foo]]")).toBe(true);
  });

  it("returns false for text without wiki links", () => {
    expect(containsWikiLinkPattern("just plain text")).toBe(false);
  });

  it("returns false for empty bracket pair", () => {
    expect(containsWikiLinkPattern("[[]] is empty")).toBe(false);
  });

  it("returns false for single brackets (markdown link syntax)", () => {
    expect(containsWikiLinkPattern("[label](url)")).toBe(false);
  });

  it("returns false when brackets contain bracket characters", () => {
    expect(containsWikiLinkPattern("[[foo[bar]]]")).toBe(false);
  });
});

describe("WIKI_LINK_TEXT_REGEX", () => {
  it("matches multiple wiki links in a string", () => {
    const text = "[[A]] and [[B]] and [[C]]";
    const matches = [...text.matchAll(WIKI_LINK_TEXT_REGEX)];
    expect(matches).toHaveLength(3);
    expect(matches[0][1]).toBe("A");
    expect(matches[1][1]).toBe("B");
    expect(matches[2][1]).toBe("C");
  });
});

describe("transformWikiLinksInContent", () => {
  it("returns content unchanged when no wiki links exist", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "plain text" }],
        },
      ],
    };

    expect(transformWikiLinksInContent(doc)).toEqual(doc);
  });

  it("transforms a single wiki link into a text node with wikiLink mark", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "[[Foo]]" }],
        },
      ],
    };

    const result = transformWikiLinksInContent(doc) as {
      content: Array<{
        content: Array<{
          type: string;
          text: string;
          marks?: Array<{ type: string; attrs: Record<string, unknown> }>;
        }>;
      }>;
    };

    expect(result.content[0].content).toHaveLength(1);
    expect(result.content[0].content[0]).toEqual({
      type: "text",
      text: "Foo",
      marks: [
        {
          type: "wikiLink",
          attrs: { title: "Foo", exists: false, referenced: false },
        },
      ],
    });
  });

  it("splits a text node containing a wiki link surrounded by text", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "before [[Foo]] after" }],
        },
      ],
    };

    const result = transformWikiLinksInContent(doc) as {
      content: Array<{ content: Array<{ type: string; text: string; marks?: unknown[] }> }>;
    };

    expect(result.content[0].content).toEqual([
      { type: "text", text: "before " },
      {
        type: "text",
        text: "Foo",
        marks: [
          {
            type: "wikiLink",
            attrs: { title: "Foo", exists: false, referenced: false },
          },
        ],
      },
      { type: "text", text: " after" },
    ]);
  });

  it("handles multiple wiki links in one text node", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "[[A]] and [[B]]" }],
        },
      ],
    };

    const result = transformWikiLinksInContent(doc) as {
      content: Array<{ content: Array<{ type: string; text: string; marks?: unknown[] }> }>;
    };

    expect(result.content[0].content).toHaveLength(3);
    expect(result.content[0].content[0].text).toBe("A");
    expect(result.content[0].content[0].marks).toHaveLength(1);
    expect(result.content[0].content[1].text).toBe(" and ");
    expect(result.content[0].content[1].marks).toBeUndefined();
    expect(result.content[0].content[2].text).toBe("B");
    expect(result.content[0].content[2].marks).toHaveLength(1);
  });

  it("transforms wiki links nested inside headings", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 1 },
          content: [{ type: "text", text: "Title with [[Link]]" }],
        },
      ],
    };

    const result = transformWikiLinksInContent(doc) as {
      content: Array<{
        type: string;
        content: Array<{ type: string; text: string; marks?: unknown[] }>;
      }>;
    };

    expect(result.content[0].type).toBe("heading");
    expect(result.content[0].content).toHaveLength(2);
    expect(result.content[0].content[1].text).toBe("Link");
    expect(result.content[0].content[1].marks).toEqual([
      {
        type: "wikiLink",
        attrs: { title: "Link", exists: false, referenced: false },
      },
    ]);
  });

  it("preserves existing marks on the surrounding plain text parts", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "bold [[Link]] bold",
              marks: [{ type: "bold" }],
            },
          ],
        },
      ],
    };

    const result = transformWikiLinksInContent(doc) as {
      content: Array<{
        content: Array<{
          type: string;
          text: string;
          marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
        }>;
      }>;
    };

    const nodes = result.content[0].content;
    expect(nodes).toHaveLength(3);
    expect(nodes[0].marks).toEqual([{ type: "bold" }]);
    expect(nodes[1].text).toBe("Link");
    // 既存マーク + wikiLink マークを両方保持する
    // Preserve both the existing mark(s) and the wikiLink mark
    expect(nodes[1].marks).toEqual(
      expect.arrayContaining([
        { type: "bold" },
        {
          type: "wikiLink",
          attrs: { title: "Link", exists: false, referenced: false },
        },
      ]),
    );
    expect(nodes[2].marks).toEqual([{ type: "bold" }]);
  });

  it("trims whitespace from wiki link title", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "[[  Foo Bar  ]]" }],
        },
      ],
    };

    const result = transformWikiLinksInContent(doc) as {
      content: Array<{
        content: Array<{
          type: string;
          text: string;
          marks?: Array<{ type: string; attrs: Record<string, unknown> }>;
        }>;
      }>;
    };

    expect(result.content[0].content[0].text).toBe("Foo Bar");
    expect(result.content[0].content[0].marks?.[0]?.attrs).toEqual({
      title: "Foo Bar",
      exists: false,
      referenced: false,
    });
  });

  it("skips wiki links with empty titles (after trim)", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "[[   ]]" }],
        },
      ],
    };

    const result = transformWikiLinksInContent(doc);
    expect(result).toEqual(doc);
  });

  it("returns input unchanged when content is undefined", () => {
    const doc = { type: "doc" };
    expect(transformWikiLinksInContent(doc)).toEqual(doc);
  });

  it("handles deeply nested structures (lists)", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "item [[Ref]]" }],
                },
              ],
            },
          ],
        },
      ],
    };

    const result = transformWikiLinksInContent(doc) as {
      content: Array<{
        content: Array<{
          content: Array<{
            content: Array<{ type: string; text: string; marks?: unknown[] }>;
          }>;
        }>;
      }>;
    };

    const textNodes = result.content[0].content[0].content[0].content;
    expect(textNodes).toHaveLength(2);
    expect(textNodes[1].text).toBe("Ref");
    expect(textNodes[1].marks).toEqual([
      {
        type: "wikiLink",
        attrs: { title: "Ref", exists: false, referenced: false },
      },
    ]);
  });

  it("does not mutate the input object", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "[[Foo]]" }],
        },
      ],
    };
    const snapshot = JSON.parse(JSON.stringify(doc));

    transformWikiLinksInContent(doc);

    expect(doc).toEqual(snapshot);
  });
});
