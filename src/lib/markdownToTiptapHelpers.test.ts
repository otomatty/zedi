import { describe, it, expect } from "vitest";
import { sanitizeLinkUrl, parseInlineContent } from "./markdownToTiptapHelpers";

describe("sanitizeLinkUrl", () => {
  it("allows https and http", () => {
    expect(sanitizeLinkUrl("https://example.com")).toBe("https://example.com");
    expect(sanitizeLinkUrl("http://example.com")).toBe("http://example.com");
  });

  it("allows mailto and tel", () => {
    expect(sanitizeLinkUrl("mailto:test@example.com")).toBe("mailto:test@example.com");
    expect(sanitizeLinkUrl("tel:+81123456789")).toBe("tel:+81123456789");
  });

  it("rejects javascript:", () => {
    expect(sanitizeLinkUrl("javascript:alert(1)")).toBeNull();
  });

  it("rejects data:", () => {
    expect(sanitizeLinkUrl("data:text/html,<script>alert(1)</script>")).toBeNull();
  });

  it("rejects vbscript:", () => {
    expect(sanitizeLinkUrl("vbscript:msgbox(1)")).toBeNull();
  });

  it("allows relative paths", () => {
    expect(sanitizeLinkUrl("/path/to/page")).toBe("/path/to/page");
    expect(sanitizeLinkUrl("./relative")).toBe("./relative");
  });

  it("returns null for empty string", () => {
    expect(sanitizeLinkUrl("")).toBeNull();
    expect(sanitizeLinkUrl("   ")).toBeNull();
  });
});

describe("parseInlineContent", () => {
  it("returns single text node for plain text", () => {
    const result = parseInlineContent("Hello world");
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ type: "text", text: "Hello world" });
  });

  it("parses wiki link and wraps in wikiLink mark", () => {
    const result = parseInlineContent("See [[PageA]] here");
    expect(result.length).toBeGreaterThanOrEqual(1);
    const wikiNode = result.find((n) => n.marks?.some((m) => m.type === "wikiLink"));
    expect(wikiNode).toBeDefined();
    expect(wikiNode?.text).toBe("[[PageA]]");
  });

  it("parses bold", () => {
    const result = parseInlineContent("**bold** text");
    const boldNode = result.find((n) => n.marks?.some((m) => m.type === "bold"));
    expect(boldNode).toBeDefined();
    expect(boldNode?.text).toBe("bold");
  });

  it("parses italic", () => {
    const result = parseInlineContent("*italic* text");
    const italicNode = result.find((n) => n.marks?.some((m) => m.type === "italic"));
    expect(italicNode).toBeDefined();
    expect(italicNode?.text).toBe("italic");
  });

  it("parses bold+italic (***...***)", () => {
    const result = parseInlineContent("***bold italic*** text");
    const node = result.find(
      (n) => n.marks?.some((m) => m.type === "bold") && n.marks?.some((m) => m.type === "italic"),
    );
    expect(node).toBeDefined();
    expect(node?.text).toBe("bold italic");
  });

  it("parses markdown link and sanitizes href", () => {
    const result = parseInlineContent("[Link](https://example.com)");
    const linkNode = result.find((n) => n.marks?.some((m) => m.type === "link"));
    expect(linkNode).toBeDefined();
    expect(linkNode?.marks?.[0]).toMatchObject({
      type: "link",
      attrs: expect.objectContaining({
        href: "https://example.com",
        target: "_blank",
        rel: "noopener noreferrer",
      }),
    });
  });

  it("drops link mark for javascript: href", () => {
    const result = parseInlineContent("[Bad](javascript:alert(1))");
    const linkNode = result.find((n) => n.marks?.some((m) => m.type === "link"));
    expect(linkNode).toBeUndefined();
  });
});
