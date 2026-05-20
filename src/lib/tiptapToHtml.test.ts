import { describe, it, expect } from "vitest";
import { tiptapToHtml } from "./tiptapToHtml";

describe("tiptapToHtml", () => {
  it("converts a paragraph node to a <p> block", () => {
    const json = JSON.stringify({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Hello world" }] }],
    });
    expect(tiptapToHtml(json)).toBe("<p>Hello world</p>");
  });

  it("converts body headings (levels 2–5) to matching h2–h5 tags", () => {
    const json = JSON.stringify({
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "H2" }] },
        { type: "heading", attrs: { level: 3 }, content: [{ type: "text", text: "H3" }] },
        { type: "heading", attrs: { level: 4 }, content: [{ type: "text", text: "H4" }] },
        { type: "heading", attrs: { level: 5 }, content: [{ type: "text", text: "H5" }] },
      ],
    });
    const html = tiptapToHtml(json);
    expect(html).toContain("<h2>H2</h2>");
    expect(html).toContain("<h3>H3</h3>");
    expect(html).toContain("<h4>H4</h4>");
    expect(html).toContain("<h5>H5</h5>");
  });

  // 旧データに残っている level 1 / 欠損 level は最小の本文見出し `h2` にフォールバックさせる。
  // Legacy heading nodes with level 1 (or a missing level attribute) fall back to `h2`.
  it("falls back to <h2> when heading level is missing or below 2", () => {
    const json = JSON.stringify({
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Legacy" }] },
        { type: "heading", content: [{ type: "text", text: "NoLevel" }] },
      ],
    });
    const html = tiptapToHtml(json);
    expect(html).toContain("<h2>Legacy</h2>");
    expect(html).toContain("<h2>NoLevel</h2>");
    expect(html).not.toContain("<h1>");
  });

  it("converts bullet and ordered lists, including nested lists", () => {
    const json = JSON.stringify({
      type: "doc",
      content: [
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                { type: "paragraph", content: [{ type: "text", text: "A" }] },
                {
                  type: "bulletList",
                  content: [
                    {
                      type: "listItem",
                      content: [{ type: "paragraph", content: [{ type: "text", text: "A-1" }] }],
                    },
                  ],
                },
              ],
            },
            {
              type: "listItem",
              content: [{ type: "paragraph", content: [{ type: "text", text: "B" }] }],
            },
          ],
        },
        {
          type: "orderedList",
          content: [
            {
              type: "listItem",
              content: [{ type: "paragraph", content: [{ type: "text", text: "1st" }] }],
            },
          ],
        },
      ],
    });
    const html = tiptapToHtml(json);
    expect(html).toContain("<ul>");
    // ネストした `<ul>` が外側の `<li>` 内側に来ること。
    // The nested `<ul>` appears inside the outer `<li>`.
    expect(html).toMatch(/<li><p>A<\/p><ul><li><p>A-1<\/p><\/li><\/ul><\/li>/);
    expect(html).toContain("<li><p>B</p></li>");
    expect(html).toContain("<ol>");
    expect(html).toContain("<li><p>1st</p></li>");
  });

  it("converts blockquote and horizontalRule", () => {
    const json = JSON.stringify({
      type: "doc",
      content: [
        {
          type: "blockquote",
          content: [{ type: "paragraph", content: [{ type: "text", text: "Quoted" }] }],
        },
        { type: "horizontalRule" },
      ],
    });
    const html = tiptapToHtml(json);
    expect(html).toContain("<blockquote>");
    expect(html).toContain("Quoted");
    expect(html).toContain("</blockquote>");
    expect(html).toContain("<hr");
  });

  it("renders codeBlock with language class and escapes HTML inside", () => {
    const json = JSON.stringify({
      type: "doc",
      content: [
        {
          type: "codeBlock",
          attrs: { language: "ts" },
          content: [{ type: "text", text: "<script>alert(1)</script>" }],
        },
      ],
    });
    const html = tiptapToHtml(json);
    expect(html).toContain('<pre><code class="language-ts">');
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>alert(1)</script>");
  });

  it("applies bold, italic, strike, inline-code, and link marks", () => {
    const json = JSON.stringify({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "b", marks: [{ type: "bold" }] },
            { type: "text", text: "i", marks: [{ type: "italic" }] },
            { type: "text", text: "s", marks: [{ type: "strike" }] },
            { type: "text", text: "c", marks: [{ type: "code" }] },
            {
              type: "text",
              text: "link",
              marks: [{ type: "link", attrs: { href: "https://example.com/" } }],
            },
          ],
        },
      ],
    });
    const html = tiptapToHtml(json);
    expect(html).toContain("<strong>b</strong>");
    expect(html).toContain("<em>i</em>");
    expect(html).toContain("<s>s</s>");
    expect(html).toContain("<code>c</code>");
    expect(html).toContain('<a href="https://example.com/">link</a>');
  });

  it("escapes HTML-special characters in text nodes and attributes", () => {
    const json = JSON.stringify({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "<>&\"'" },
            {
              type: "text",
              text: "x",
              marks: [{ type: "link", attrs: { href: 'javascript:alert("x")' } }],
            },
          ],
        },
      ],
    });
    const html = tiptapToHtml(json);
    expect(html).toContain("&lt;&gt;&amp;&quot;&#39;");
    // 不正 scheme は完全に除外し、空 href として描画する（XSS 防止）。
    // Reject non-http(s) schemes outright; emit an empty href to neutralise XSS.
    expect(html).not.toContain('href="javascript:');
  });

  it("renders images with src/alt/title attribute escaping", () => {
    const json = JSON.stringify({
      type: "doc",
      content: [
        {
          type: "image",
          attrs: {
            src: "https://example.com/img.png",
            alt: 'alt "quote"',
            title: "t<itle>",
          },
        },
      ],
    });
    const html = tiptapToHtml(json);
    expect(html).toContain('src="https://example.com/img.png"');
    expect(html).toContain('alt="alt &quot;quote&quot;"');
    expect(html).toContain('title="t&lt;itle&gt;"');
  });

  it("renders wikiLink as bracketed text (no anchor target)", () => {
    const json = JSON.stringify({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "wikiLink", attrs: { title: "Foo" } }],
        },
      ],
    });
    expect(tiptapToHtml(json)).toContain("[[Foo]]");
  });

  it("emits empty output for malformed youtubeEmbed and a safe anchor for valid id", () => {
    const invalid = JSON.stringify({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "youtubeEmbed", attrs: { videoId: "" } }] }],
    });
    expect(tiptapToHtml(invalid)).toBe("<p></p>");

    const valid = JSON.stringify({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "youtubeEmbed", attrs: { videoId: "abcdefghijk" } }],
        },
      ],
    });
    expect(tiptapToHtml(valid)).toContain(
      '<a href="https://www.youtube.com/watch?v=abcdefghijk">YouTube</a>',
    );
  });

  it("wraps non-JSON plain text in a single <p>", () => {
    expect(tiptapToHtml("just text")).toBe("<p>just text</p>");
  });

  // PR #921 codex P1: 読み取り専用パスは Hocuspocus の `extractTextFromYXml`
  // で抽出したプレーンテキスト（ブロック間に `\n`）を渡してくる。空行で
  // 区切られた段落を `<p>` ブロックに、単独の `\n` を `<br />` に落とす。
  //
  // PR #921 codex P1: the read-only path feeds plain text whose blocks are
  // separated by `\n` (and sometimes `\n\n`). Blank-line runs delimit `<p>`
  // paragraphs; single `\n` becomes `<br />` to preserve line structure.
  it("preserves paragraph and line-break structure for plain-text fallback", () => {
    const text = "First paragraph\nstill first.\n\nSecond paragraph.\n\n\nThird paragraph.";
    expect(tiptapToHtml(text)).toBe(
      "<p>First paragraph<br />still first.</p><p>Second paragraph.</p><p>Third paragraph.</p>",
    );
  });

  it("escapes HTML metacharacters in the plain-text fallback", () => {
    expect(tiptapToHtml("<script>")).toBe("<p>&lt;script&gt;</p>");
  });

  it("normalises CRLF line endings in the plain-text fallback", () => {
    expect(tiptapToHtml("a\r\n\r\nb")).toBe("<p>a</p><p>b</p>");
  });

  it("renders an empty string for empty input", () => {
    expect(tiptapToHtml("")).toBe("");
  });

  it("treats whitespace-only input as empty in the plain-text fallback", () => {
    expect(tiptapToHtml("\n\n\n")).toBe("");
  });

  // PR #921 gemini-code-assist high: 相対 URL 内のドットを許可する。
  // PR #921 gemini-code-assist high: dotted relative URLs must be allowed.
  it("keeps dotted relative image paths through sanitizeUrl", () => {
    const json = JSON.stringify({
      type: "doc",
      content: [{ type: "image", attrs: { src: "image.png", alt: "x" } }],
    });
    expect(tiptapToHtml(json)).toContain('src="image.png"');
  });
});
