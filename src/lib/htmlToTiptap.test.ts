import { describe, it, expect } from "vitest";
import { formatClippedContentAsTiptap } from "./htmlToTiptap";

describe("formatClippedContentAsTiptap", () => {
  it("returns main content without citation block or thumbnail when thumbnailUrl is omitted", () => {
    const result = formatClippedContentAsTiptap(
      "<p>Hello world</p>",
      "https://example.com",
      "Example",
    );
    expect(result.type).toBe("doc");
    expect(result.content).toBeDefined();
    expect(Array.isArray(result.content)).toBe(true);
    // No citation block (📎 引用元), no horizontalRule, no image
    const hasCitationBlock = JSON.stringify(result).includes("引用元");
    expect(hasCitationBlock).toBe(false);
    const hasHorizontalRule = result.content?.some((n) => n.type === "horizontalRule");
    expect(hasHorizontalRule).toBe(false);
    const hasImage = result.content?.some((n) => n.type === "image");
    expect(hasImage).toBe(false);
    // Main content present
    expect(result.content?.length).toBeGreaterThan(0);
    const first = result.content?.[0];
    expect(first?.type).toBe("paragraph");
  });

  it("prepends image node when thumbnailUrl is provided", () => {
    const result = formatClippedContentAsTiptap(
      "<p>Body text</p>",
      "https://example.com",
      "Example",
      "https://cdn.example.com/thumb.png",
    );
    expect(result.type).toBe("doc");
    const first = result.content?.[0];
    expect(first?.type).toBe("image");
    expect(first).toMatchObject({
      type: "image",
      attrs: { src: "https://cdn.example.com/thumb.png", alt: "OGP thumbnail" },
    });
    const second = result.content?.[1];
    expect(second?.type).toBe("paragraph");
  });

  it("omits image when thumbnailUrl is empty string", () => {
    const result = formatClippedContentAsTiptap("<p>Body</p>", "https://example.com", null, "");
    const first = result.content?.[0];
    expect(first?.type).toBe("paragraph");
    expect(first?.type).not.toBe("image");
  });
});
