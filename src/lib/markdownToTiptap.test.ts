import { describe, it, expect } from "vitest";
import { convertMarkdownToTiptapContent } from "./markdownToTiptap";

describe("convertMarkdownToTiptapContent", () => {
  it("converts empty string to doc with single empty paragraph", () => {
    const result = convertMarkdownToTiptapContent("");
    const parsed = JSON.parse(result) as { type: string; content: unknown[] };
    expect(parsed.type).toBe("doc");
    expect(parsed.content).toHaveLength(1);
    expect(parsed.content[0]).toMatchObject({ type: "paragraph" });
  });

  // `# X` は本文 h1 として変換しないため、テキストのまま paragraph として残る。
  // The page h1 lives in the title field, so `# X` survives verbatim as a paragraph.
  it("preserves `# X` as a literal paragraph (no heading conversion)", () => {
    const result = convertMarkdownToTiptapContent("# Title");
    const parsed = JSON.parse(result) as {
      content: Array<{ type: string; attrs?: { level: number }; content?: unknown[] }>;
    };
    expect(parsed.content).toHaveLength(1);
    expect(parsed.content[0]).toMatchObject({
      type: "paragraph",
    });
    const firstContent = parsed.content[0].content;
    expect(firstContent).toHaveLength(1);
    expect(firstContent?.[0]).toMatchObject({
      type: "text",
      text: "# Title",
    });
  });

  it("converts ##, ###, ####, ##### headings to levels 2, 3, 4, 5", () => {
    const result = convertMarkdownToTiptapContent("## Section\n### Sub\n#### Detail\n##### Note");
    const parsed = JSON.parse(result) as {
      content: Array<{ type: string; attrs?: { level: number } }>;
    };
    expect(parsed.content[0]).toMatchObject({ type: "heading", attrs: { level: 2 } });
    expect(parsed.content[1]).toMatchObject({ type: "heading", attrs: { level: 3 } });
    expect(parsed.content[2]).toMatchObject({ type: "heading", attrs: { level: 4 } });
    expect(parsed.content[3]).toMatchObject({ type: "heading", attrs: { level: 5 } });
  });

  it("converts bullet list items", () => {
    const result = convertMarkdownToTiptapContent("- Item A\n- Item B");
    const parsed = JSON.parse(result) as {
      content: Array<{ type: string; content?: unknown[] }>;
    };
    expect(parsed.content.some((n) => n.type === "bulletList")).toBe(true);
  });

  it("converts wiki link in paragraph to wikiLink mark", () => {
    const result = convertMarkdownToTiptapContent("See [[PageName]] here.");
    const parsed = JSON.parse(result) as {
      content: Array<{
        type: string;
        content?: Array<{ type: string; text?: string; marks?: Array<{ type: string }> }>;
      }>;
    };
    const paragraph = parsed.content.find((n) => n.type === "paragraph");
    expect(paragraph?.content).toBeDefined();
    const withWikiMark = (paragraph?.content ?? []).find((n) =>
      n.marks?.some((m) => m.type === "wikiLink"),
    );
    expect(withWikiMark).toBeDefined();
    expect(withWikiMark?.text).toBe("[[PageName]]");
  });

  // issue #784: AI 出力経路の defensive ガード。
  // issue #784: defensive guard for AI output paths.
  describe("dropLeadingH1 option", () => {
    /**
     * AI が `# Title` 行から本文を始めた典型ケース。`dropLeadingH1: true` を
     * 渡すと最初の H1 行が除去され、続く `## Section` が h2 として変換される。
     */
    it("strips a leading `# Title` line when dropLeadingH1 is true", () => {
      const result = convertMarkdownToTiptapContent("# Title\n## Section\nbody", {
        dropLeadingH1: true,
      });
      const parsed = JSON.parse(result) as {
        content: Array<{ type: string; attrs?: { level: number }; content?: unknown[] }>;
      };
      // 先頭の `# Title` 行は paragraph として残らない。
      // The leading `# Title` line is no longer present as a paragraph.
      const literalH1Paragraph = parsed.content.find((n) => {
        if (n.type !== "paragraph") return false;
        const inline = n.content as Array<{ text?: string }> | undefined;
        return inline?.some((node) => node.text === "# Title");
      });
      expect(literalH1Paragraph).toBeUndefined();
      // `## Section` は heading level 2 のまま。
      // `## Section` still maps to a level-2 heading.
      expect(parsed.content[0]).toMatchObject({ type: "heading", attrs: { level: 2 } });
    });

    /**
     * 既定（option 省略）では PR #777 の方針通り `# Title` は literal paragraph として残る。
     * Default (no option) keeps `# X` as a literal paragraph per PR #777.
     */
    it("keeps `# Title` as a literal paragraph when dropLeadingH1 is not set", () => {
      const result = convertMarkdownToTiptapContent("# Title\n## Section");
      const parsed = JSON.parse(result) as {
        content: Array<{ type: string; content?: Array<{ text?: string }> }>;
      };
      expect(parsed.content[0]).toMatchObject({ type: "paragraph" });
      expect(parsed.content[0].content?.[0]?.text).toBe("# Title");
    });

    /**
     * 先頭にある H1 行のみ落とす。本文中の `# X` は触らない。
     * Only the leading H1 is dropped; mid-document `# X` stays.
     */
    it("does not drop a `# X` line that is not at the start", () => {
      const result = convertMarkdownToTiptapContent("Intro\n# Title", {
        dropLeadingH1: true,
      });
      const parsed = JSON.parse(result) as {
        content: Array<{ type: string; content?: Array<{ text?: string }> }>;
      };
      // 2 つの paragraph が残る (Intro と `# Title`)。
      expect(parsed.content).toHaveLength(2);
      expect(parsed.content[0].content?.[0]?.text).toBe("Intro");
      expect(parsed.content[1].content?.[0]?.text).toBe("# Title");
    });

    /**
     * `## Section` は H1 ではないので `dropLeadingH1: true` でも触らない。
     * `## Section` is not a single-`#` heading, so even with dropLeadingH1 it is preserved.
     */
    it("does not strip a leading `## Section` line", () => {
      const result = convertMarkdownToTiptapContent("## Section\nbody", {
        dropLeadingH1: true,
      });
      const parsed = JSON.parse(result) as {
        content: Array<{ type: string; attrs?: { level: number } }>;
      };
      expect(parsed.content[0]).toMatchObject({ type: "heading", attrs: { level: 2 } });
    });

    /**
     * AI ストリームでは先頭に空行が混じることがある。先行空白行越しの H1 も落とす。
     * AI streams sometimes prepend whitespace; the H1 should still be stripped through it.
     */
    it("strips a leading H1 even after leading blank lines", () => {
      const result = convertMarkdownToTiptapContent("\n\n# Title\n## Section", {
        dropLeadingH1: true,
      });
      const parsed = JSON.parse(result) as {
        content: Array<{ type: string; attrs?: { level: number } }>;
      };
      // 先頭の `# Title` literal paragraph は出現しない。
      const hasLiteralH1 = parsed.content.some((n) => {
        if (n.type !== "paragraph") return false;
        const inline = (n as { content?: Array<{ text?: string }> }).content;
        return inline?.some((node) => node.text === "# Title");
      });
      expect(hasLiteralH1).toBe(false);
      const headings = parsed.content.filter((n) => n.type === "heading");
      expect(headings[0]).toMatchObject({ attrs: { level: 2 } });
    });

    /**
     * 2 つ目以降の `# X` は除去対象ではない。1 行のみ落とす。
     * Only the first H1 is removed; subsequent `# X` remains as a paragraph.
     */
    it("strips only the first leading H1 line, not the second", () => {
      const result = convertMarkdownToTiptapContent("# Title\n# Another\nbody", {
        dropLeadingH1: true,
      });
      const parsed = JSON.parse(result) as {
        content: Array<{ type: string; content?: Array<{ text?: string }> }>;
      };
      const literals = parsed.content
        .filter((n) => n.type === "paragraph")
        .map((n) => n.content?.[0]?.text);
      expect(literals).toContain("# Another");
      expect(literals).not.toContain("# Title");
    });
  });
});
