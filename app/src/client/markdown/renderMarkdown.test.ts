// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { renderMarkdown } from "./renderMarkdown";

function html(src: string): string {
  const host = document.createElement("div");
  host.append(renderMarkdown(src));
  return host.innerHTML;
}

describe("renderMarkdown (tokens → DOM, no innerHTML)", () => {
  it("renders headings, paragraphs and inline formatting", () => {
    expect(html("## 見出し\n\n本文 **太字** *斜体* ~~取消~~ `code`")).toBe(
      "<h2>見出し</h2><p>本文 <strong>太字</strong> <em>斜体</em> <del>取消</del> <code>code</code></p>",
    );
  });

  it("escapes code blocks and tags them with the language", () => {
    expect(html("```ts\nconst a = '<script>';\n```")).toBe(
      "<pre><code class=\"language-ts\">const a = '&lt;script&gt;';</code></pre>",
    );
  });

  it("renders raw HTML as text instead of markup", () => {
    expect(html('<img src=x onerror="alert(1)">')).toBe(
      '<p>&lt;img src=x onerror="alert(1)"&gt;</p>',
    );
  });

  it("keeps safe links and drops unsafe URL schemes", () => {
    expect(html("[ok](https://example.com) [x](javascript:alert(1))")).toBe(
      '<p><a href="https://example.com" rel="noopener noreferrer" target="_blank">ok</a> x</p>',
    );
  });

  it("drops protocol-relative links, including the backslash form browsers treat as one", () => {
    // ブラウザは http(s) URL の `\` を `/` とみなすため、`/\evil.com` は外部サイトに飛ぶ。
    // Browsers treat `\` as `/` in http(s) URLs, so `/\evil.com` would leave the site.
    expect(html("[x](/\\evil.com) [y](//evil.com)")).toBe("<p>x y</p>");
  });

  it("renders ordered, unordered and task lists", () => {
    expect(html("3. c\n4. d")).toBe('<ol start="3"><li>c</li><li>d</li></ol>');
    expect(html("- [x] done\n- [ ] todo")).toBe(
      '<ul><li><input type="checkbox" disabled="" checked="">done</li><li><input type="checkbox" disabled="">todo</li></ul>',
    );
  });

  it("renders tables with header cells and alignment", () => {
    expect(html("| a | b |\n| :-- | --: |\n| 1 | 2 |")).toBe(
      '<table><thead><tr><th style="text-align: left;">a</th><th style="text-align: right;">b</th></tr></thead>' +
        '<tbody><tr><td style="text-align: left;">1</td><td style="text-align: right;">2</td></tr></tbody></table>',
    );
  });

  it("renders blockquotes and thematic breaks", () => {
    expect(html("> 引用\n\n---")).toBe("<blockquote><p>引用</p></blockquote><hr>");
  });
});
