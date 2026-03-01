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
              marks: [{ type: "bold" }, { type: "unsupportedMark" }],
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
        {
          type: "blockquote",
          content: [{ type: "paragraph", content: [{ type: "text", text: "Quote" }] }],
        },
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [{ type: "paragraph", content: [{ type: "text", text: "Item" }] }],
            },
          ],
        },
        {
          type: "orderedList",
          content: [
            {
              type: "listItem",
              content: [{ type: "paragraph", content: [{ type: "text", text: "Item" }] }],
            },
          ],
        },
        { type: "codeBlock", content: [{ type: "text", text: "code" }] },
        { type: "horizontalRule" },
        { type: "mermaid", attrs: { code: "graph TD" } },
      ],
    });

    const result = sanitizeTiptapContent(contentWithAllNodes);
    expect(result.hadErrors).toBe(false);
    expect(result.removedNodeTypes).toEqual([]);
  });

  it("should support task list nodes", () => {
    const content = JSON.stringify({
      type: "doc",
      content: [
        {
          type: "taskList",
          content: [
            {
              type: "taskItem",
              attrs: { checked: false },
              content: [{ type: "paragraph", content: [{ type: "text", text: "TODO" }] }],
            },
            {
              type: "taskItem",
              attrs: { checked: true },
              content: [{ type: "paragraph", content: [{ type: "text", text: "Done" }] }],
            },
          ],
        },
      ],
    });

    const result = sanitizeTiptapContent(content);
    expect(result.hadErrors).toBe(false);
    expect(result.removedNodeTypes).toEqual([]);
  });

  it("should support table nodes", () => {
    const content = JSON.stringify({
      type: "doc",
      content: [
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                {
                  type: "tableHeader",
                  content: [{ type: "paragraph", content: [{ type: "text", text: "Header" }] }],
                },
              ],
            },
            {
              type: "tableRow",
              content: [
                {
                  type: "tableCell",
                  content: [{ type: "paragraph", content: [{ type: "text", text: "Cell" }] }],
                },
              ],
            },
          ],
        },
      ],
    });

    const result = sanitizeTiptapContent(content);
    expect(result.hadErrors).toBe(false);
    expect(result.removedNodeTypes).toEqual([]);
  });

  it("should support math nodes", () => {
    const content = JSON.stringify({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "math", attrs: { latex: "E = mc^2" } }] },
        { type: "mathBlock", attrs: { latex: "\\sum_{i=1}^n x_i" } },
      ],
    });

    const result = sanitizeTiptapContent(content);
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
            {
              type: "text",
              text: "link",
              marks: [{ type: "link", attrs: { href: "https://example.com" } }],
            },
            {
              type: "text",
              text: "wikiLink",
              marks: [{ type: "wikiLink", attrs: { title: "Page" } }],
            },
          ],
        },
      ],
    });

    const result = sanitizeTiptapContent(contentWithAllMarks);
    expect(result.hadErrors).toBe(false);
    expect(result.removedMarkTypes).toEqual([]);
  });

  it("should support highlight and underline marks", () => {
    const content = JSON.stringify({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "highlighted", marks: [{ type: "highlight" }] },
            { type: "text", text: "underlined", marks: [{ type: "underline" }] },
          ],
        },
      ],
    });

    const result = sanitizeTiptapContent(content);
    expect(result.hadErrors).toBe(false);
    expect(result.removedMarkTypes).toEqual([]);
  });

  it("should support textStyle mark for text color", () => {
    const content = JSON.stringify({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "colored",
              marks: [{ type: "textStyle", attrs: { color: "#dc2626" } }],
            },
          ],
        },
      ],
    });

    const result = sanitizeTiptapContent(content);
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
          content: [{ type: "text", text: "test", marks: [{ type: "customMark" }] }],
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
      content: [{ type: "paragraph", content: [{ type: "text", text: "Short text" }] }],
    });

    expect(getContentPreview(content)).toBe("Short text");
  });

  it("should truncate long content", () => {
    const longText = "A".repeat(200);
    const content = JSON.stringify({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: longText }] }],
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
      content: [{ type: "paragraph", content: [{ type: "text", text: longText }] }],
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

describe("sanitizeTiptapContent - wikiLink promotion", () => {
  it("should convert plain text [[Title]] to wikiLink marks", () => {
    const input = JSON.stringify({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "See [[My Page]] for details." }],
        },
      ],
    });

    const result = sanitizeTiptapContent(input);
    const parsed = JSON.parse(result.content);
    const nodes = parsed.content[0].content;

    expect(nodes).toHaveLength(3);
    expect(nodes[0]).toEqual({ type: "text", text: "See " });
    expect(nodes[1].text).toBe("[[My Page]]");
    expect(nodes[1].marks).toHaveLength(1);
    expect(nodes[1].marks[0].type).toBe("wikiLink");
    expect(nodes[1].marks[0].attrs.title).toBe("My Page");
    expect(nodes[2]).toEqual({ type: "text", text: " for details." });
  });

  it("should convert multiple [[]] patterns in the same text node", () => {
    const input = JSON.stringify({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Link [[A]] and [[B]] here." }],
        },
      ],
    });

    const result = sanitizeTiptapContent(input);
    const parsed = JSON.parse(result.content);
    const nodes = parsed.content[0].content;

    expect(nodes).toHaveLength(5);
    expect(nodes[0].text).toBe("Link ");
    expect(nodes[1].text).toBe("[[A]]");
    expect(nodes[1].marks[0].attrs.title).toBe("A");
    expect(nodes[2].text).toBe(" and ");
    expect(nodes[3].text).toBe("[[B]]");
    expect(nodes[3].marks[0].attrs.title).toBe("B");
    expect(nodes[4].text).toBe(" here.");
  });

  it("should not double-convert text that already has wikiLink marks", () => {
    const input = JSON.stringify({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "[[Existing]]",
              marks: [
                {
                  type: "wikiLink",
                  attrs: { title: "Existing", exists: true, referenced: false },
                },
              ],
            },
          ],
        },
      ],
    });

    const result = sanitizeTiptapContent(input);
    const parsed = JSON.parse(result.content);
    const nodes = parsed.content[0].content;

    expect(nodes).toHaveLength(1);
    expect(nodes[0].marks).toHaveLength(1);
    expect(nodes[0].marks[0].type).toBe("wikiLink");
  });

  it("should preserve existing marks (e.g. bold) alongside new wikiLink marks", () => {
    const input = JSON.stringify({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "bold [[Link]]",
              marks: [{ type: "bold" }],
            },
          ],
        },
      ],
    });

    const result = sanitizeTiptapContent(input);
    const parsed = JSON.parse(result.content);
    const nodes = parsed.content[0].content;

    expect(nodes).toHaveLength(2);
    expect(nodes[0].text).toBe("bold ");
    expect(nodes[0].marks).toEqual([{ type: "bold" }]);
    expect(nodes[1].text).toBe("[[Link]]");
    expect(nodes[1].marks).toHaveLength(2);
    expect(nodes[1].marks[0].type).toBe("bold");
    expect(nodes[1].marks[1].type).toBe("wikiLink");
  });

  it("should handle text with no [[]] patterns unchanged", () => {
    const input = JSON.stringify({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "No wiki links here." }],
        },
      ],
    });

    const result = sanitizeTiptapContent(input);
    const parsed = JSON.parse(result.content);
    const nodes = parsed.content[0].content;

    expect(nodes).toHaveLength(1);
    expect(nodes[0].text).toBe("No wiki links here.");
    expect(nodes[0].marks).toBeUndefined();
  });

  it("should handle [[]] at the start and end of text", () => {
    const input = JSON.stringify({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "[[Start]]" }],
        },
      ],
    });

    const result = sanitizeTiptapContent(input);
    const parsed = JSON.parse(result.content);
    const nodes = parsed.content[0].content;

    expect(nodes).toHaveLength(1);
    expect(nodes[0].text).toBe("[[Start]]");
    expect(nodes[0].marks[0].type).toBe("wikiLink");
    expect(nodes[0].marks[0].attrs.title).toBe("Start");
  });

  it("should NOT convert [[]] inside codeBlock nodes", () => {
    const input = JSON.stringify({
      type: "doc",
      content: [
        {
          type: "codeBlock",
          attrs: { language: "javascript" },
          content: [{ type: "text", text: "const arr = [[1, 2]];" }],
        },
      ],
    });

    const result = sanitizeTiptapContent(input);
    const parsed = JSON.parse(result.content);
    const codeNode = parsed.content[0];

    expect(codeNode.content).toHaveLength(1);
    expect(codeNode.content[0].text).toBe("const arr = [[1, 2]];");
    expect(codeNode.content[0].marks).toBeUndefined();
  });

  it("should keep [[ ]] (empty title) as plain text, not wikiLink", () => {
    const input = JSON.stringify({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Empty [[ ]] brackets." }],
        },
      ],
    });

    const result = sanitizeTiptapContent(input);
    const parsed = JSON.parse(result.content);
    const nodes = parsed.content[0].content;

    expect(nodes).toHaveLength(3);
    expect(nodes[0].text).toBe("Empty ");
    expect(nodes[1].text).toBe("[[ ]]");
    expect(nodes[1].marks).toBeUndefined();
    expect(nodes[2].text).toBe(" brackets.");
  });

  it("should NOT convert [[]] in inline code (code mark)", () => {
    const input = JSON.stringify({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "[[not a link]]",
              marks: [{ type: "code" }],
            },
          ],
        },
      ],
    });

    const result = sanitizeTiptapContent(input);
    const parsed = JSON.parse(result.content);
    const nodes = parsed.content[0].content;

    expect(nodes).toHaveLength(1);
    expect(nodes[0].text).toBe("[[not a link]]");
    expect(nodes[0].marks).toHaveLength(1);
    expect(nodes[0].marks[0].type).toBe("code");
  });
});
