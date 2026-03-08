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

  it("converts # heading to heading level 1", () => {
    const result = convertMarkdownToTiptapContent("# Title");
    const parsed = JSON.parse(result) as {
      content: Array<{ type: string; attrs?: { level: number }; content?: unknown[] }>;
    };
    expect(parsed.content).toHaveLength(1);
    expect(parsed.content[0]).toMatchObject({
      type: "heading",
      attrs: { level: 1 },
    });
    const firstContent = parsed.content[0].content;
    expect(firstContent).toHaveLength(1);
    expect(firstContent?.[0]).toMatchObject({
      type: "text",
      text: "Title",
    });
  });

  it("converts ## and ### headings", () => {
    const result = convertMarkdownToTiptapContent("## Section\n### Sub");
    const parsed = JSON.parse(result) as {
      content: Array<{ type: string; attrs?: { level: number } }>;
    };
    expect(parsed.content[0]).toMatchObject({ type: "heading", attrs: { level: 2 } });
    expect(parsed.content[1]).toMatchObject({ type: "heading", attrs: { level: 3 } });
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
});
