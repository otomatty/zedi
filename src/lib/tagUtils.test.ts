import { describe, it, expect } from "vitest";
import { extractTagsFromContent, updateTagAttributes, getUniqueTagNames } from "./tagUtils";

/**
 * Tests for tag-related Tiptap JSON utilities. Mirrors the corresponding
 * WikiLink tests (`wikiLinkUtils.test.ts`) since the two mark types share a
 * data model and resolution flow. See issue #725 (Phase 1).
 */
describe("extractTagsFromContent", () => {
  it("extracts tags from Tiptap JSON", () => {
    const content = JSON.stringify({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "#tech",
              marks: [{ type: "tag", attrs: { name: "tech", exists: true, referenced: false } }],
            },
            {
              type: "text",
              text: "#design",
              marks: [{ type: "tag", attrs: { name: "design", exists: false, referenced: true } }],
            },
          ],
        },
      ],
    });
    const tags = extractTagsFromContent(content);
    expect(tags).toHaveLength(2);
    expect(tags[0]).toEqual({ name: "tech", exists: true, referenced: false });
    expect(tags[1]).toEqual({ name: "design", exists: false, referenced: true });
  });

  it("returns empty for no tags", () => {
    const content = JSON.stringify({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "No tags here" }],
        },
      ],
    });
    expect(extractTagsFromContent(content)).toEqual([]);
  });

  it("returns empty for invalid JSON", () => {
    expect(extractTagsFromContent("{bad json")).toEqual([]);
  });

  it("returns empty for empty string", () => {
    expect(extractTagsFromContent("")).toEqual([]);
  });

  it("ignores non-tag marks on the same text node", () => {
    // `mark.type === "tag"` の比較が他のマーク（bold, wikiLink 等）を素通りすることを検証。
    // Ensures type check does not accidentally collect bold/wikiLink marks.
    const content = JSON.stringify({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "mixed",
              marks: [
                { type: "bold" },
                { type: "tag", attrs: { name: "real", exists: true, referenced: true } },
                { type: "wikiLink", attrs: { title: "Page", exists: true, referenced: false } },
              ],
            },
          ],
        },
      ],
    });
    const tags = extractTagsFromContent(content);
    expect(tags).toHaveLength(1);
    expect(tags[0]).toEqual({ name: "real", exists: true, referenced: true });
  });

  it("skips tag marks whose attrs.name is missing or empty", () => {
    const content = JSON.stringify({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "noattr",
              marks: [{ type: "tag" }],
            },
            {
              type: "text",
              text: "empty",
              marks: [{ type: "tag", attrs: { name: "" } }],
            },
          ],
        },
      ],
    });
    expect(extractTagsFromContent(content)).toEqual([]);
  });

  it("traverses deeply nested children (bulletList → listItem → paragraph → text)", () => {
    const content = JSON.stringify({
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
                  content: [
                    {
                      type: "text",
                      text: "#nested",
                      marks: [
                        {
                          type: "tag",
                          attrs: { name: "nested", exists: true, referenced: false },
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
    const tags = extractTagsFromContent(content);
    expect(tags).toHaveLength(1);
    expect(tags[0].name).toBe("nested");
  });
});

describe("updateTagAttributes", () => {
  it("updates exists and referenced flags and returns hasChanges=true", () => {
    const content = JSON.stringify({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "#tech",
              marks: [{ type: "tag", attrs: { name: "tech", exists: false, referenced: false } }],
            },
          ],
        },
      ],
    });
    const pageTitles = new Set(["tech"]);
    const referencedTitles = new Set(["tech"]);

    const result = updateTagAttributes(content, pageTitles, referencedTitles);
    expect(result.hasChanges).toBe(true);
    const parsed = JSON.parse(result.content);
    const attrs = parsed.content[0].content[0].marks[0].attrs;
    expect(attrs.exists).toBe(true);
    expect(attrs.referenced).toBe(true);
  });

  it("returns hasChanges=false and preserves content byte-for-byte when no flags change", () => {
    const content = JSON.stringify({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "#tech",
              marks: [{ type: "tag", attrs: { name: "tech", exists: true, referenced: false } }],
            },
          ],
        },
      ],
    });
    const result = updateTagAttributes(content, new Set(["tech"]), new Set());
    expect(result.hasChanges).toBe(false);
    expect(result.content).toBe(content);
  });

  it("normalizes the name by lowercasing and trimming before membership check", () => {
    const content = JSON.stringify({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "#MixedCase",
              marks: [
                {
                  type: "tag",
                  attrs: { name: "  MixedCase  ", exists: false, referenced: false },
                },
              ],
            },
          ],
        },
      ],
    });
    const result = updateTagAttributes(content, new Set(["mixedcase"]), new Set());
    expect(result.hasChanges).toBe(true);
    const attrs = JSON.parse(result.content).content[0].content[0].marks[0].attrs;
    expect(attrs.exists).toBe(true);
  });

  it("does not touch non-tag marks even when siblings change", () => {
    const content = JSON.stringify({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "#tech",
              marks: [
                { type: "bold" },
                { type: "tag", attrs: { name: "tech", exists: false, referenced: false } },
              ],
            },
          ],
        },
      ],
    });
    const result = updateTagAttributes(content, new Set(["tech"]), new Set());
    const marks = JSON.parse(result.content).content[0].content[0].marks;
    expect(marks).toHaveLength(2);
    expect(marks[0]).toEqual({ type: "bold" });
  });

  it("handles empty content", () => {
    const result = updateTagAttributes("", new Set(), new Set());
    expect(result.content).toBe("");
    expect(result.hasChanges).toBe(false);
  });

  it("returns the original content with hasChanges=false on invalid JSON", () => {
    const bad = "{not json";
    const result = updateTagAttributes(bad, new Set(), new Set());
    expect(result.content).toBe(bad);
    expect(result.hasChanges).toBe(false);
  });

  describe("targetId plumbing (issue #737)", () => {
    // `pageTitleToId` を渡すと resolved タグに `targetId` を埋める。
    // Pin the `targetId` plumbing introduced for issue #737.
    const TARGET_ID = "11111111-aaaa-bbbb-cccc-000000000001";

    function buildContent(extraAttrs: Record<string, unknown> = {}): string {
      return JSON.stringify({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "tech",
                marks: [
                  {
                    type: "tag",
                    attrs: { name: "tech", exists: false, referenced: false, ...extraAttrs },
                  },
                ],
              },
            ],
          },
        ],
      });
    }

    it("populates targetId when pageTitleToId is provided and tag resolves", () => {
      const content = buildContent();
      const map = new Map([["tech", TARGET_ID]]);
      const result = updateTagAttributes(content, new Set(["tech"]), new Set(), map);
      expect(result.hasChanges).toBe(true);
      const attrs = JSON.parse(result.content).content[0].content[0].marks[0].attrs;
      expect(attrs.exists).toBe(true);
      expect(attrs.targetId).toBe(TARGET_ID);
    });

    it("leaves targetId untouched when pageTitleToId is omitted", () => {
      // 既存マークの `targetId` は触らない契約を固定する。
      // Pin that omitting the map preserves any pre-existing id.
      const content = buildContent({ targetId: "preexisting-id" });
      const result = updateTagAttributes(content, new Set(["tech"]), new Set());
      const attrs = JSON.parse(result.content).content[0].content[0].marks[0].attrs;
      expect(attrs.targetId).toBe("preexisting-id");
    });
  });
});

describe("getUniqueTagNames", () => {
  it("returns an empty array for an empty input", () => {
    expect(getUniqueTagNames([])).toEqual([]);
  });

  it("removes duplicates case-insensitively preserving first occurrence casing", () => {
    const tags = [
      { name: "Tech", exists: true, referenced: false },
      { name: "tech", exists: false, referenced: false },
      { name: "Design", exists: true, referenced: true },
      { name: "DESIGN", exists: false, referenced: false },
    ];
    expect(getUniqueTagNames(tags)).toEqual(["Tech", "Design"]);
  });

  it("normalizes whitespace via .trim() when deduplicating", () => {
    const tags = [
      { name: "tag", exists: true, referenced: false },
      { name: "  tag  ", exists: false, referenced: false },
    ];
    expect(getUniqueTagNames(tags)).toEqual(["tag"]);
  });

  it("preserves insertion order of distinct names", () => {
    const tags = [
      { name: "c", exists: false, referenced: false },
      { name: "a", exists: false, referenced: false },
      { name: "b", exists: false, referenced: false },
    ];
    expect(getUniqueTagNames(tags)).toEqual(["c", "a", "b"]);
  });
});
