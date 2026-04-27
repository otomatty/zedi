import { describe, it, expect } from "vitest";
import { formatClippedContentAsTiptap, htmlToTiptapJSON } from "./htmlToTiptap";

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
      "Page Title",
    );
    expect(result.type).toBe("doc");
    const first = result.content?.[0];
    expect(first?.type).toBe("image");
    expect(first).toMatchObject({
      type: "image",
      attrs: { src: "https://cdn.example.com/thumb.png", alt: "Page Title" },
    });
    const second = result.content?.[1];
    expect(second?.type).toBe("paragraph");
  });

  it("includes storageProviderId in image attrs when provided", () => {
    const result = formatClippedContentAsTiptap(
      "<p>Body</p>",
      "https://example.com",
      null,
      "https://cdn.example.com/thumb.png",
      "Title",
      "s3",
    );
    const first = result.content?.[0];
    expect(first?.type).toBe("image");
    expect(first).toMatchObject({
      type: "image",
      attrs: {
        src: "https://cdn.example.com/thumb.png",
        alt: "Title",
        storageProviderId: "s3",
      },
    });
  });

  it("omits image when thumbnailUrl is empty string", () => {
    const result = formatClippedContentAsTiptap(
      "<p>Body</p>",
      "https://example.com",
      null,
      "",
      null,
    );
    const first = result.content?.[0];
    expect(first?.type).toBe("paragraph");
    expect(first?.type).not.toBe("image");
  });
});

describe("htmlToTiptapJSON", () => {
  it("rejects javascript: and data: URI schemes in links", () => {
    const html =
      '<p><a href="javascript:alert(1)">bad-js</a> <a href="data:text/html;base64,AAAA">bad-data</a></p>';
    const result = htmlToTiptapJSON(html);
    const json = JSON.stringify(result);
    expect(json).not.toContain("javascript:alert(1)");
    expect(json).not.toContain("data:text/html");
  });

  it("allows safe URI schemes (https, mailto, tel) and relative paths", () => {
    const html = [
      '<p><a href="https://example.com">https</a>',
      '<a href="mailto:test@example.com">mail</a>',
      '<a href="tel:+819012345678">tel</a>',
      '<a href="/relative/path">relative</a></p>',
    ].join(" ");
    const result = htmlToTiptapJSON(html);
    const json = JSON.stringify(result);
    expect(json).toContain("https://example.com");
    expect(json).toContain("mailto:test@example.com");
    expect(json).toContain("tel:+819012345678");
    expect(json).toContain("/relative/path");
  });

  it("converts inline <img> tags to image nodes", () => {
    const html = '<p>Before</p><img src="https://example.com/photo.png" alt="photo"><p>After</p>';
    const result = htmlToTiptapJSON(html);

    expect(result.type).toBe("doc");
    const imageNodes = result.content?.filter((n) => n.type === "image") ?? [];
    expect(imageNodes.length).toBe(1);
    expect(imageNodes[0]).toMatchObject({
      type: "image",
      attrs: expect.objectContaining({
        src: "https://example.com/photo.png",
        alt: "photo",
      }),
    });
  });

  it("preserves multiple inline images in article body", () => {
    const html = [
      "<p>Intro</p>",
      '<img src="https://example.com/img1.png" alt="first">',
      "<p>Middle</p>",
      '<img src="https://example.com/img2.jpg" alt="second">',
      "<p>End</p>",
    ].join("");
    const result = htmlToTiptapJSON(html);

    const imageNodes = result.content?.filter((n) => n.type === "image") ?? [];
    expect(imageNodes.length).toBe(2);
    expect(imageNodes[0]?.attrs).toMatchObject({ src: "https://example.com/img1.png" });
    expect(imageNodes[1]?.attrs).toMatchObject({ src: "https://example.com/img2.jpg" });
  });

  it("converts <img> wrapped in other elements", () => {
    const html =
      '<div><figure><img src="https://example.com/fig.webp" alt="figure"></figure></div>';
    const result = htmlToTiptapJSON(html);

    const imageNodes = result.content?.filter((n) => n.type === "image") ?? [];
    expect(imageNodes.length).toBe(1);
    expect(imageNodes[0]?.attrs).toMatchObject({ src: "https://example.com/fig.webp" });
  });

  // Regression for PR #777 review (Devin): keep <h1> as a heading node so that
  // editor-time clamping (HeadingLevelClamp / sanitizeTiptapContent) can demote
  // it to level 2. Dropping <h1> at parse time would silently lose semantics.
  it("preserves <h1>..<h3> as heading nodes (clamping happens later)", () => {
    const html = "<h1>Top</h1><h2>Sub</h2><h3>Detail</h3>";
    const result = htmlToTiptapJSON(html);
    const headings = result.content?.filter((n) => n.type === "heading") ?? [];
    expect(headings).toHaveLength(3);
    expect(headings[0]?.attrs).toMatchObject({ level: 1 });
    expect(headings[1]?.attrs).toMatchObject({ level: 2 });
    expect(headings[2]?.attrs).toMatchObject({ level: 3 });
  });
});
