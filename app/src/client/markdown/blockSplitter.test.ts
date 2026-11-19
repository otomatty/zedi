import { marked } from "marked";
import { describe, expect, it } from "vitest";
import { createBlockSplitter } from "./blockSplitter";

/** Feeds `text` in chunks of `size` and returns every completed block plus the flushed rest. */
function split(text: string, size = text.length): string[] {
  const splitter = createBlockSplitter();
  const blocks: string[] = [];
  for (let i = 0; i < text.length; i += size)
    blocks.push(...splitter.push(text.slice(i, i + size)));
  blocks.push(...splitter.finish());
  return blocks;
}

const SAMPLE = [
  "# 見出し",
  "",
  "段落の一行目",
  "二行目 **太字** と `code`",
  "",
  "- 項目 A",
  "- 項目 B",
  "",
  "- ゆるいリスト",
  "",
  "  続きの段落",
  "",
  "1. 一",
  "2. 二",
  "",
  "```ts",
  "const a = 1;",
  "",
  "# コード内の見出しではない",
  "```",
  "| 列1 | 列2 |",
  "| --- | --- |",
  "| a | b |",
  "",
  "> 引用",
  "> 続き",
  "",
  "---",
  "最後の段落",
].join("\n");

describe("createBlockSplitter", () => {
  it("rendering the blocks one by one gives the same HTML as rendering the whole text", () => {
    const html = split(SAMPLE)
      .map((block) => marked.parse(block, { async: false }))
      .join("");
    expect(html).toBe(marked.parse(SAMPLE, { async: false }));
  });

  it("produces the same blocks whatever the chunk size", () => {
    const whole = split(SAMPLE);
    for (const size of [1, 2, 3, 7, 16]) expect(split(SAMPLE, size)).toEqual(whole);
  });

  it("keeps a fenced code block together, including blank lines and Markdown-looking lines", () => {
    const blocks = split("intro\n\n```\na\n\n# not a heading\n```\nafter\n");
    expect(blocks).toEqual(["intro", "```\na\n\n# not a heading\n```", "after"]);
  });

  it("completes a block only once the next block starts (streaming-safe)", () => {
    const splitter = createBlockSplitter();
    expect(splitter.push("first paragraph\n\n")).toEqual([]);
    expect(splitter.tail()).toBe("first paragraph\n\n");
    expect(splitter.push("second")).toEqual(["first paragraph"]);
    expect(splitter.tail()).toBe("second");
  });

  it("treats an indented line or another list item after a blank line as part of the same list", () => {
    expect(split("- a\n\n  more\n- b\n\nnext")).toEqual(["- a\n\n  more\n- b", "next"]);
  });

  it("emits ATX headings and standalone thematic breaks as their own blocks", () => {
    expect(split("para\n# Title\ntext\n\n---\nnext")).toEqual([
      "para",
      "# Title",
      "text",
      "---",
      "next",
    ]);
  });

  it("keeps a setext underline with its paragraph (it makes a heading, not a break)", () => {
    const blocks = split("intro\n\nTitle\n---\nbody");
    expect(blocks).toEqual(["intro", "Title\n---", "body"]);
    expect(blocks.map((b) => marked.parse(b, { async: false })).join("")).toBe(
      marked.parse("intro\n\nTitle\n---\nbody", { async: false }),
    );
  });

  it("flushes an unterminated fence on finish", () => {
    expect(split("```js\nconst x = 1;")).toEqual(["```js\nconst x = 1;"]);
  });
});
