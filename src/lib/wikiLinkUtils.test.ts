import { describe, it, expect } from "vitest";
import {
  extractWikiLinksFromContent,
  updateWikiLinkAttributes,
  getUniqueWikiLinkTitles,
} from "./wikiLinkUtils";

describe("extractWikiLinksFromContent", () => {
  it("extracts wiki links from Tiptap JSON", () => {
    const content = JSON.stringify({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Link A",
              marks: [{ type: "wikiLink", attrs: { title: "Page A", exists: true, referenced: false } }],
            },
            {
              type: "text",
              text: "Link B",
              marks: [{ type: "wikiLink", attrs: { title: "Page B", exists: false, referenced: true } }],
            },
          ],
        },
      ],
    });
    const links = extractWikiLinksFromContent(content);
    expect(links).toHaveLength(2);
    expect(links[0]).toEqual({ title: "Page A", exists: true, referenced: false });
    expect(links[1]).toEqual({ title: "Page B", exists: false, referenced: true });
  });

  it("returns empty for no wiki links", () => {
    const content = JSON.stringify({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "No links here" }],
        },
      ],
    });
    expect(extractWikiLinksFromContent(content)).toEqual([]);
  });

  it("returns empty for invalid JSON", () => {
    expect(extractWikiLinksFromContent("{bad json")).toEqual([]);
  });

  it("returns empty for empty string", () => {
    expect(extractWikiLinksFromContent("")).toEqual([]);
  });
});

describe("updateWikiLinkAttributes", () => {
  it("updates exists/referenced flags", () => {
    const content = JSON.stringify({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Link",
              marks: [{ type: "wikiLink", attrs: { title: "Page A", exists: false, referenced: false } }],
            },
          ],
        },
      ],
    });
    const pageTitles = new Set(["page a"]);
    const referencedTitles = new Set(["page a"]);

    const result = updateWikiLinkAttributes(content, pageTitles, referencedTitles);
    expect(result.hasChanges).toBe(true);
    const parsed = JSON.parse(result.content);
    const attrs = parsed.content[0].content[0].marks[0].attrs;
    expect(attrs.exists).toBe(true);
    expect(attrs.referenced).toBe(true);
  });

  it("returns hasChanges false when no changes needed", () => {
    const content = JSON.stringify({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Link",
              marks: [{ type: "wikiLink", attrs: { title: "Page A", exists: true, referenced: false } }],
            },
          ],
        },
      ],
    });
    const pageTitles = new Set(["page a"]);
    const referencedTitles = new Set<string>();

    const result = updateWikiLinkAttributes(content, pageTitles, referencedTitles);
    expect(result.hasChanges).toBe(false);
  });

  it("handles empty content", () => {
    const result = updateWikiLinkAttributes("", new Set(), new Set());
    expect(result.content).toBe("");
    expect(result.hasChanges).toBe(false);
  });
});

describe("getUniqueWikiLinkTitles", () => {
  it("removes duplicates case-insensitively", () => {
    const links = [
      { title: "Page A", exists: true, referenced: false },
      { title: "page a", exists: false, referenced: false },
      { title: "Page B", exists: true, referenced: true },
      { title: "PAGE B", exists: false, referenced: false },
    ];
    const unique = getUniqueWikiLinkTitles(links);
    expect(unique).toHaveLength(2);
    expect(unique).toContain("Page A");
    expect(unique).toContain("Page B");
  });
});
