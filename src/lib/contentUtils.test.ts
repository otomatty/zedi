import { describe, it, expect } from "vitest";
import {
  sanitizeTiptapContent,
  validateTiptapContent,
  extractPlainText,
  getContentPreview,
  generateAutoTitle,
  buildContentErrorMessage,
  type SanitizeResult,
} from "./contentUtils";

describe("sanitizeTiptapContent", () => {
  it("should return empty content for empty string", () => {
    const result = sanitizeTiptapContent("");
    expect(result.content).toBe("");
    expect(result.hadErrors).toBe(false);
    expect(result.removedNodeTypes).toEqual([]);
    expect(result.removedMarkTypes).toEqual([]);
  });

  it("should pass through valid content without changes", () => {
    const validContent = JSON.stringify({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Hello world" }],
        },
      ],
    });

    const result = sanitizeTiptapContent(validContent);
    expect(result.hadErrors).toBe(false);
    expect(result.removedNodeTypes).toEqual([]);
    expect(result.removedMarkTypes).toEqual([]);

    const parsed = JSON.parse(result.content);
    expect(parsed.content[0].content[0].text).toBe("Hello world");
  });

  it("should remove unsupported node types", () => {
    const contentWithUnsupportedNode = JSON.stringify({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Before" }],
        },
        {
          type: "unsupportedNode",
          content: [{ type: "text", text: "This should be removed" }],
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "After" }],
        },
      ],
    });

    const result = sanitizeTiptapContent(contentWithUnsupportedNode);
    expect(result.hadErrors).toBe(true);
    expect(result.removedNodeTypes).toContain("unsupportedNode");

    const parsed = JSON.parse(result.content);
    // Should have 3 nodes: original paragraph, converted unsupported, original paragraph
    expect(parsed.content.length).toBe(3);
    // The unsupported node should be converted to paragraph with text
    expect(parsed.content[1].type).toBe("paragraph");
    expect(parsed.content[1].content[0].text).toContain("[unsupportedNode]");
  });

  it("should remove unsupported mark types while preserving text", () => {
    const contentWithUnsupportedMark = JSON.stringify({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Text with unsupported mark",
              marks: [{ type: "unilink", attrs: { href: "test" } }],
            },
          ],
        },
      ],
    });

    const result = sanitizeTiptapContent(contentWithUnsupportedMark);
    expect(result.hadErrors).toBe(true);
    expect(result.removedMarkTypes).toContain("unilink");

    const parsed = JSON.parse(result.content);
    // Text should be preserved
    expect(parsed.content[0].content[0].text).toBe("Text with unsupported mark");
    // Mark should be removed
    expect(parsed.content[0].content[0].marks).toBeUndefined();
  });

  it("should keep supported marks while removing unsupported ones", () => {
    const contentWithMixedMarks = JSON.stringify({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Bold and unsupported",
              marks: [
                { type: "bold" },
                { type: "unsupportedMark" },
              ],
            },
          ],
        },
      ],
    });

    const result = sanitizeTiptapContent(contentWithMixedMarks);
    expect(result.hadErrors).toBe(true);
    expect(result.removedMarkTypes).toContain("unsupportedMark");

    const parsed = JSON.parse(result.content);
    // Bold mark should be preserved
    expect(parsed.content[0].content[0].marks).toHaveLength(1);
    expect(parsed.content[0].content[0].marks[0].type).toBe("bold");
  });

  it("should handle deeply nested content", () => {
    const nestedContent = JSON.stringify({
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
                      text: "List item with",
                      marks: [{ type: "italic" }],
                    },
                    {
                      type: "text",
                      text: " unsupported mark",
                      marks: [{ type: "customMark" }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });

    const result = sanitizeTiptapContent(nestedContent);
    expect(result.hadErrors).toBe(true);
    expect(result.removedMarkTypes).toContain("customMark");

    const parsed = JSON.parse(result.content);
    const listItem = parsed.content[0].content[0].content[0];
    // First text with italic should be preserved
    expect(listItem.content[0].marks).toHaveLength(1);
    expect(listItem.content[0].marks[0].type).toBe("italic");
    // Second text should have mark removed
    expect(listItem.content[1].marks).toBeUndefined();
  });

  it("should handle invalid JSON gracefully", () => {
    const result = sanitizeTiptapContent("not valid json");
    expect(result.hadErrors).toBe(true);
    expect(result.removedMarkTypes).toContain("JSON parse error");

    const parsed = JSON.parse(result.content);
    expect(parsed.type).toBe("doc");
    expect(parsed.content).toEqual([]);
  });

  it("should support all standard Tiptap nodes", () => {
    const contentWithAllNodes = JSON.stringify({
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Heading" }] },
        { type: "paragraph", content: [{ type: "text", text: "Paragraph" }] },
        { type: "blockquote", content: [{ type: "paragraph", content: [{ type: "text", text: "Quote" }] }] },
        { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Item" }] }] }] },
        { type: "orderedList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Item" }] }] }] },
        { type: "codeBlock", content: [{ type: "text", text: "code" }] },
        { type: "horizontalRule" },
        { type: "mermaid", attrs: { code: "graph TD" } },
      ],
    });

    const result = sanitizeTiptapContent(contentWithAllNodes);
    expect(result.hadErrors).toBe(false);
    expect(result.removedNodeTypes).toEqual([]);
  });

  it("should support all standard Tiptap marks", () => {
    const contentWithAllMarks = JSON.stringify({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "bold", marks: [{ type: "bold" }] },
            { type: "text", text: "italic", marks: [{ type: "italic" }] },
            { type: "text", text: "strike", marks: [{ type: "strike" }] },
            { type: "text", text: "code", marks: [{ type: "code" }] },
            { type: "text", text: "link", marks: [{ type: "link", attrs: { href: "https://example.com" } }] },
            { type: "text", text: "wikiLink", marks: [{ type: "wikiLink", attrs: { title: "Page" } }] },
          ],
        },
      ],
    });

    const result = sanitizeTiptapContent(contentWithAllMarks);
    expect(result.hadErrors).toBe(false);
    expect(result.removedMarkTypes).toEqual([]);
  });
});

describe("validateTiptapContent", () => {
  it("should validate empty content as valid", () => {
    const result = validateTiptapContent("");
    expect(result.isValid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("should detect unsupported node types", () => {
    const content = JSON.stringify({
      type: "doc",
      content: [{ type: "customNode" }],
    });

    const result = validateTiptapContent(content);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain("Unsupported node type: customNode");
  });

  it("should detect unsupported mark types", () => {
    const content = JSON.stringify({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "test", marks: [{ type: "customMark" }] },
          ],
        },
      ],
    });

    const result = validateTiptapContent(content);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain("Unsupported mark type: customMark");
  });

  it("should handle invalid JSON", () => {
    const result = validateTiptapContent("invalid json");
    expect(result.isValid).toBe(false);
    expect(result.errors[0]).toContain("JSON parse error");
  });
});

describe("extractPlainText", () => {
  it("should extract text from Tiptap JSON", () => {
    const content = JSON.stringify({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Hello world" }],
        },
      ],
    });

    expect(extractPlainText(content)).toBe("Hello world");
  });

  it("should join text from multiple paragraphs", () => {
    const content = JSON.stringify({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "First" }] },
        { type: "paragraph", content: [{ type: "text", text: "Second" }] },
      ],
    });

    expect(extractPlainText(content)).toBe("First Second");
  });

  it("should return empty string for empty content", () => {
    expect(extractPlainText("")).toBe("");
  });

  it("should return plain text as-is if not JSON", () => {
    expect(extractPlainText("plain text")).toBe("plain text");
  });
});

describe("getContentPreview", () => {
  it("should return trimmed preview", () => {
    const content = JSON.stringify({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Short text" }] },
      ],
    });

    expect(getContentPreview(content)).toBe("Short text");
  });

  it("should truncate long content", () => {
    const longText = "A".repeat(200);
    const content = JSON.stringify({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: longText }] },
      ],
    });

    const preview = getContentPreview(content, 50);
    expect(preview.length).toBeLessThanOrEqual(53); // 50 + "..."
    expect(preview.endsWith("...")).toBe(true);
  });
});

describe("generateAutoTitle", () => {
  it("should use first 40 characters of plain text as title", () => {
    const content = JSON.stringify({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "First line" }] },
        { type: "paragraph", content: [{ type: "text", text: "Second line" }] },
      ],
    });

    // extractPlainText joins paragraphs with space
    expect(generateAutoTitle(content)).toBe("First line Second line");
  });

  it("should return default title for empty content", () => {
    expect(generateAutoTitle("")).toBe("無題のページ");
  });

  it("should truncate long first line", () => {
    const longText = "A".repeat(100);
    const content = JSON.stringify({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: longText }] },
      ],
    });

    const title = generateAutoTitle(content);
    expect(title.length).toBeLessThanOrEqual(43); // 40 + "..."
  });
});

describe("buildContentErrorMessage", () => {
  it("should return default message when no errors", () => {
    const result: SanitizeResult = {
      content: '{"type":"doc","content":[]}',
      hadErrors: false,
      removedNodeTypes: [],
      removedMarkTypes: [],
    };

    const message = buildContentErrorMessage(result);
    expect(message).toBe("コンテンツに問題がありました。");
  });

  it("should include removed node types in message", () => {
    const result: SanitizeResult = {
      content: '{"type":"doc","content":[]}',
      hadErrors: true,
      removedNodeTypes: ["unsupportedNode1", "unsupportedNode2"],
      removedMarkTypes: [],
    };

    const message = buildContentErrorMessage(result);
    expect(message).toContain("未対応のノード: unsupportedNode1, unsupportedNode2");
    expect(message).toContain("移行データに問題があります");
  });

  it("should include removed mark types in message", () => {
    const result: SanitizeResult = {
      content: '{"type":"doc","content":[]}',
      hadErrors: true,
      removedNodeTypes: [],
      removedMarkTypes: ["unsupportedMark1", "unsupportedMark2"],
    };

    const message = buildContentErrorMessage(result);
    expect(message).toContain("未対応のマーク: unsupportedMark1, unsupportedMark2");
    expect(message).toContain("移行データに問題があります");
  });

  it("should include both node and mark types in message", () => {
    const result: SanitizeResult = {
      content: '{"type":"doc","content":[]}',
      hadErrors: true,
      removedNodeTypes: ["unsupportedNode"],
      removedMarkTypes: ["unsupportedMark"],
    };

    const message = buildContentErrorMessage(result);
    expect(message).toContain("未対応のノード: unsupportedNode");
    expect(message).toContain("未対応のマーク: unsupportedMark");
    expect(message).toContain("移行データに問題があります");
  });
});
