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
              marks: [
                { type: "wikiLink", attrs: { title: "Page A", exists: true, referenced: false } },
              ],
            },
            {
              type: "text",
              text: "Link B",
              marks: [
                { type: "wikiLink", attrs: { title: "Page B", exists: false, referenced: true } },
              ],
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

  it("ignores non-wikiLink marks on the same text node", () => {
    // `mark.type === "wikiLink"` の比較が他の型（bold, italic 等）を素通りすることを検証する。
    // Kills equality-mutation that would scoop up bold/italic marks as wikiLinks.
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
                { type: "wikiLink", attrs: { title: "Real", exists: true, referenced: true } },
                { type: "italic" },
              ],
            },
          ],
        },
      ],
    });
    const links = extractWikiLinksFromContent(content);
    expect(links).toHaveLength(1);
    expect(links[0]).toEqual({ title: "Real", exists: true, referenced: true });
  });

  it("coerces truthy-but-non-boolean exists/referenced to true via Boolean()", () => {
    // `Boolean(attrs.exists)` を厳密に検証する（削除されると truthy オブジェクトが漏れる）。
    // Explicitly pins the Boolean() coercion so a removal mutation can't survive.
    const content = JSON.stringify({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "T",
              marks: [
                {
                  type: "wikiLink",
                  attrs: { title: "X", exists: "yes" as unknown as boolean, referenced: 1 },
                },
              ],
            },
          ],
        },
      ],
    });
    const [link] = extractWikiLinksFromContent(content);
    expect(link.exists).toBe(true);
    expect(link.referenced).toBe(true);
  });

  it("coerces falsy/missing exists/referenced to false via Boolean()", () => {
    // `exists`/`referenced` が未指定・undefined のケースも Boolean() で false になる。
    // Pins false-coercion for missing fields; a mutation that drops Boolean() may leak undefined.
    const content = JSON.stringify({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "T",
              marks: [{ type: "wikiLink", attrs: { title: "X" } }],
            },
          ],
        },
      ],
    });
    const [link] = extractWikiLinksFromContent(content);
    expect(link).toEqual({ title: "X", exists: false, referenced: false });
  });

  it("skips wikiLink marks whose attrs.title is missing or empty", () => {
    // `if (attrs?.title)` のガードを検証する。
    // Kills mutations that push marks with empty titles.
    const content = JSON.stringify({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "noattr",
              marks: [{ type: "wikiLink" }],
            },
            {
              type: "text",
              text: "empty",
              marks: [{ type: "wikiLink", attrs: { title: "" } }],
            },
          ],
        },
      ],
    });
    expect(extractWikiLinksFromContent(content)).toEqual([]);
  });

  it("traverses deeply nested children (bulletList → listItem → paragraph → text)", () => {
    // 再帰走査の経路を検証する（`n.content` 配列ガードの削除や浅い走査への変異を検知）。
    // Covers recursive traversal; a mutation that returns early in children surfaces here.
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
                      text: "Nested",
                      marks: [
                        {
                          type: "wikiLink",
                          attrs: { title: "Nested", exists: true, referenced: false },
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
    const links = extractWikiLinksFromContent(content);
    expect(links).toHaveLength(1);
    expect(links[0].title).toBe("Nested");
  });

  it("preserves order of multiple wiki links across nested nodes", () => {
    // 出現順序が走査順と一致することを検証する。
    // Pins traversal order; reversing or reordering mutations surface as a diff here.
    const content = JSON.stringify({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "1",
              marks: [
                { type: "wikiLink", attrs: { title: "First", exists: false, referenced: false } },
              ],
            },
          ],
        },
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "2",
              marks: [
                { type: "wikiLink", attrs: { title: "Second", exists: false, referenced: false } },
              ],
            },
          ],
        },
      ],
    });
    expect(extractWikiLinksFromContent(content).map((l) => l.title)).toEqual(["First", "Second"]);
  });
});

describe("updateWikiLinkAttributes", () => {
  it("updates exists and referenced flags and returns hasChanges=true", () => {
    const content = JSON.stringify({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Link",
              marks: [
                { type: "wikiLink", attrs: { title: "Page A", exists: false, referenced: false } },
              ],
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

  it("reports hasChanges=true when only `exists` differs", () => {
    // `||` 短絡評価で `exists` だけが変わるケースを検証する。
    // `exists !== newExists || referenced !== newReferenced` の `||` → `&&` 変異を殺す。
    const content = JSON.stringify({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Link",
              marks: [
                { type: "wikiLink", attrs: { title: "Page", exists: false, referenced: false } },
              ],
            },
          ],
        },
      ],
    });
    const result = updateWikiLinkAttributes(content, new Set(["page"]), new Set());
    expect(result.hasChanges).toBe(true);
    const attrs = JSON.parse(result.content).content[0].content[0].marks[0].attrs;
    expect(attrs.exists).toBe(true);
    expect(attrs.referenced).toBe(false);
  });

  it("reports hasChanges=true when only `referenced` differs", () => {
    // `referenced` のみ変わるケース。`||` の両辺が独立に評価されることを担保する。
    // Symmetrically pins the right side of the OR.
    const content = JSON.stringify({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Link",
              marks: [
                { type: "wikiLink", attrs: { title: "Page", exists: true, referenced: false } },
              ],
            },
          ],
        },
      ],
    });
    const result = updateWikiLinkAttributes(content, new Set(["page"]), new Set(["page"]));
    expect(result.hasChanges).toBe(true);
    const attrs = JSON.parse(result.content).content[0].content[0].marks[0].attrs;
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
              text: "Link",
              marks: [
                { type: "wikiLink", attrs: { title: "Page A", exists: true, referenced: false } },
              ],
            },
          ],
        },
      ],
    });
    const result = updateWikiLinkAttributes(content, new Set(["page a"]), new Set());
    expect(result.hasChanges).toBe(false);
  });

  it("normalizes the title by lowercasing and trimming before membership check", () => {
    // `.toLowerCase().trim()` の両方が効いていることを検証する。
    // Kills both the `.toLowerCase()` → `.toUpperCase()` and a `.trim()` removal mutation.
    const content = JSON.stringify({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Link",
              marks: [
                {
                  type: "wikiLink",
                  attrs: { title: "  Mixed Case  ", exists: false, referenced: false },
                },
              ],
            },
          ],
        },
      ],
    });
    const result = updateWikiLinkAttributes(content, new Set(["mixed case"]), new Set());
    expect(result.hasChanges).toBe(true);
    const attrs = JSON.parse(result.content).content[0].content[0].marks[0].attrs;
    expect(attrs.exists).toBe(true);
  });

  it("preserves existing wikiLink attrs (e.g. custom attr) when flags change", () => {
    // `...attrs` のスプレッドが削除されると独自属性が失われる。
    // Pins the attrs spread; without it the custom attribute is dropped.
    const content = JSON.stringify({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Link",
              marks: [
                {
                  type: "wikiLink",
                  attrs: {
                    title: "Page",
                    exists: false,
                    referenced: false,
                    custom: "keep-me",
                  },
                },
              ],
            },
          ],
        },
      ],
    });
    const result = updateWikiLinkAttributes(content, new Set(["page"]), new Set());
    const attrs = JSON.parse(result.content).content[0].content[0].marks[0].attrs;
    expect(attrs.custom).toBe("keep-me");
    expect(attrs.exists).toBe(true);
  });

  it("does not touch non-wikiLink marks even when flags of siblings change", () => {
    // 他の mark の型・属性は一切変更されないことを検証する。
    // Kills mutations that would incorrectly rewrite non-wikiLink marks.
    const content = JSON.stringify({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Link",
              marks: [
                { type: "bold" },
                { type: "wikiLink", attrs: { title: "Page", exists: false, referenced: false } },
              ],
            },
          ],
        },
      ],
    });
    const result = updateWikiLinkAttributes(content, new Set(["page"]), new Set());
    const marks = JSON.parse(result.content).content[0].content[0].marks;
    expect(marks).toHaveLength(2);
    expect(marks[0]).toEqual({ type: "bold" });
  });

  it("updates nested wiki links (traverses content children)", () => {
    // 再帰走査経路での更新を検証する。
    // Covers recursive descent; a mutation that stops at the top level misses this.
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
                      text: "Nested",
                      marks: [
                        {
                          type: "wikiLink",
                          attrs: { title: "Deep", exists: false, referenced: false },
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
    const result = updateWikiLinkAttributes(content, new Set(["deep"]), new Set(["deep"]));
    expect(result.hasChanges).toBe(true);
    const deepAttrs = JSON.parse(result.content).content[0].content[0].content[0].content[0]
      .marks[0].attrs;
    expect(deepAttrs).toMatchObject({ exists: true, referenced: true });
  });

  it("handles empty content", () => {
    const result = updateWikiLinkAttributes("", new Set(), new Set());
    expect(result.content).toBe("");
    expect(result.hasChanges).toBe(false);
  });

  it("returns the original content with hasChanges=false on invalid JSON", () => {
    // try/catch のフォールバック経路を検証する。
    // Covers the catch branch; without a test, the fallback path stays NoCoverage.
    const bad = "{not json";
    const result = updateWikiLinkAttributes(bad, new Set(), new Set());
    expect(result.content).toBe(bad);
    expect(result.hasChanges).toBe(false);
  });
});

describe("getUniqueWikiLinkTitles", () => {
  it("returns an empty array for an empty input", () => {
    expect(getUniqueWikiLinkTitles([])).toEqual([]);
  });

  it("removes duplicates case-insensitively while preserving original casing of the first occurrence", () => {
    // 最初に出現した表記（"Page A"）が残ることを検証する（単純 Set ではなく順序付き重複排除）。
    // Pins first-occurrence preservation; `set.add(link.title)` without the array push would fail.
    const links = [
      { title: "Page A", exists: true, referenced: false },
      { title: "page a", exists: false, referenced: false },
      { title: "Page B", exists: true, referenced: true },
      { title: "PAGE B", exists: false, referenced: false },
    ];
    expect(getUniqueWikiLinkTitles(links)).toEqual(["Page A", "Page B"]);
  });

  it("normalizes whitespace via .trim() when deduplicating", () => {
    // `.trim()` の削除変異を殺す（"  Page  " と "Page" が区別される挙動になる）。
    // Kills the `.trim()` removal mutation.
    const links = [
      { title: "Page", exists: true, referenced: false },
      { title: "  page  ", exists: false, referenced: false },
    ];
    expect(getUniqueWikiLinkTitles(links)).toEqual(["Page"]);
  });

  it("preserves insertion order of distinct titles", () => {
    // 並び順を厳密検証する（`Array` ではなく `Set` のみを返す変異への対策）。
    // Pins stable ordering; a `return Array.from(seen)` mutation would fail this assertion.
    const links = [
      { title: "C", exists: false, referenced: false },
      { title: "A", exists: false, referenced: false },
      { title: "B", exists: false, referenced: false },
    ];
    expect(getUniqueWikiLinkTitles(links)).toEqual(["C", "A", "B"]);
  });
});
