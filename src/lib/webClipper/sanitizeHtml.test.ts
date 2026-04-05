import { describe, it, expect } from "vitest";
import { sanitizeHtml } from "./sanitizeHtml";

describe("sanitizeHtml", () => {
  it("通常の HTML をそのまま返す / preserves safe HTML", () => {
    const html = "<p>Hello <strong>world</strong></p>";
    expect(sanitizeHtml(html)).toBe(html);
  });

  it("script タグを除去する / removes script tags", () => {
    const result = sanitizeHtml('<p>ok</p><script>alert("xss")</script>');
    expect(result).not.toContain("<script");
    expect(result).toContain("<p>ok</p>");
  });

  it("iframe タグを除去する / removes iframe tags", () => {
    const result = sanitizeHtml('<iframe src="https://evil.example.com"></iframe><p>safe</p>');
    expect(result).not.toContain("<iframe");
    expect(result).toContain("<p>safe</p>");
  });

  it("object・embed タグを除去する / removes object and embed tags", () => {
    const result = sanitizeHtml('<object data="x"></object><embed src="y"><p>ok</p>');
    expect(result).not.toContain("<object");
    expect(result).not.toContain("<embed");
  });

  it("form 関連タグを除去する / removes form elements", () => {
    const result = sanitizeHtml(
      '<form action="/"><input type="text"><button>Submit</button><select><option>1</option></select><textarea>x</textarea></form><p>ok</p>',
    );
    expect(result).not.toContain("<form");
    expect(result).not.toContain("<input");
    expect(result).not.toContain("<button");
    expect(result).not.toContain("<select");
    expect(result).not.toContain("<textarea");
  });

  it("on* イベントハンドラ属性を除去する / removes on* event handlers", () => {
    const result = sanitizeHtml('<p onclick="alert(1)" onmouseover="hack()">text</p>');
    expect(result).not.toContain("onclick");
    expect(result).not.toContain("onmouseover");
    expect(result).toContain("<p>text</p>");
  });

  it("javascript: URL を除去する / removes javascript: URLs", () => {
    const result = sanitizeHtml('<a href="javascript:alert(1)">click</a>');
    expect(result).not.toContain("javascript:");
  });

  it("data: URL を除去する / removes data: URLs in href", () => {
    const result = sanitizeHtml('<a href="data:text/html,<script>alert(1)</script>">x</a>');
    expect(result).not.toContain("data:");
  });

  it("style 属性を除去する / removes style attributes", () => {
    const result = sanitizeHtml('<p style="color:red">text</p>');
    expect(result).not.toContain("style");
    expect(result).toContain("text");
  });

  it("svg タグを除去する / removes svg tags", () => {
    const result = sanitizeHtml('<svg onload="alert(1)"><circle r="10"/></svg><p>ok</p>');
    expect(result).not.toContain("<svg");
    expect(result).toContain("<p>ok</p>");
  });

  it("math タグを除去する / removes math tags", () => {
    const result = sanitizeHtml("<math><mi>x</mi></math><p>ok</p>");
    expect(result).not.toContain("<math");
  });

  it("template タグを除去する / removes template tags", () => {
    const result = sanitizeHtml("<template><img src=x onerror=alert(1)></template><p>ok</p>");
    expect(result).not.toContain("<template");
  });

  it("base タグを除去する / removes base tags", () => {
    const result = sanitizeHtml('<base href="https://evil.example.com"><p>ok</p>');
    expect(result).not.toContain("<base");
  });

  it("meta タグを除去する / removes meta tags", () => {
    const result = sanitizeHtml(
      '<meta http-equiv="refresh" content="0;url=https://evil.example.com"><p>ok</p>',
    );
    expect(result).not.toContain("<meta");
  });

  it("許可されたタグと属性は保持する / preserves allowed tags and attributes", () => {
    const html =
      '<h1>Title</h1><a href="https://example.com" title="link">link</a><img src="photo.jpg" alt="photo" loading="lazy">';
    const result = sanitizeHtml(html);
    expect(result).toContain("<h1>");
    expect(result).toContain('href="https://example.com"');
    expect(result).toContain('title="link"');
    expect(result).toContain('src="photo.jpg"');
    expect(result).toContain('alt="photo"');
    expect(result).toContain('loading="lazy"');
  });

  it("テーブル要素を保持する / preserves table elements", () => {
    const html =
      "<table><thead><tr><th>A</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table>";
    const result = sanitizeHtml(html);
    expect(result).toContain("<table>");
    expect(result).toContain("<th>A</th>");
    expect(result).toContain("<td>1</td>");
  });

  it("空文字列を処理できる / handles empty string", () => {
    expect(sanitizeHtml("")).toBe("");
  });

  it("制御文字で難読化された javascript: スキームを除去する / removes obfuscated javascript: scheme", () => {
    const result = sanitizeHtml('<a href="java\tscript:alert(1)">x</a>');
    expect(result).not.toContain("javascript");
  });

  it("noscript タグを除去する / removes noscript tags", () => {
    const result = sanitizeHtml("<noscript><p>fallback</p></noscript><p>ok</p>");
    expect(result).not.toContain("<noscript");
  });

  it("vbscript: URL を除去する / removes vbscript: URLs", () => {
    const result = sanitizeHtml('<a href="vbscript:MsgBox(1)">click</a>');
    expect(result).not.toContain("vbscript:");
  });

  it("data:image URI は img src で許可する / allows safe data:image URIs in img src", () => {
    const result = sanitizeHtml('<img src="data:image/png;base64,iVBORw0KGgo=" alt="icon">');
    expect(result).toContain("data:image/png;base64,iVBORw0KGgo=");
    expect(result).toContain('alt="icon"');
  });

  it("autoplay 属性を除去する / strips autoplay attribute", () => {
    const result = sanitizeHtml('<video src="v.mp4" autoplay controls></video>');
    expect(result).not.toContain("autoplay");
    expect(result).toContain("controls");
  });

  it("許可されていない属性を除去する / strips non-allowlisted attributes", () => {
    const result = sanitizeHtml('<div data-custom="x" tabindex="0" class="ok">text</div>');
    expect(result).not.toContain("data-custom");
    expect(result).not.toContain("tabindex");
    expect(result).toContain('class="ok"');
  });
});
