// @vitest-environment happy-dom
import type { Editor } from "@tiptap/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LONG_PAGE_BLOCKS } from "../../shared/import/splitDocument";
import { createEditor } from "./createEditor";
import { countTextblocks, isLongPage, watchPageSize } from "./pageSize";

let editor: Editor | null = null;

const localEditor = (html: string) => {
  const element = document.createElement("div");
  document.body.append(element);
  editor = createEditor({ element, searchTargets: async () => [] });
  editor.commands.setContent(html);
  return editor;
};

afterEach(() => {
  editor?.destroy();
  editor = null;
  document.body.replaceChildren();
});

describe("countTextblocks", () => {
  it("counts paragraphs, headings and the paragraphs inside lists and quotes", () => {
    const e = localEditor(
      // Ends with a paragraph: after a code block the editor would append an empty one.
      "<h1>T</h1><p>a</p><ul><li><p>b</p></li><li><p>c</p></li></ul><blockquote><p>d</p></blockquote><pre><code>e</code></pre><p>f</p>",
    );

    expect(countTextblocks(e.state.doc)).toBe(7);
  });
});

describe("isLongPage", () => {
  it("flags pages above the long-page limit", () => {
    expect(isLongPage(LONG_PAGE_BLOCKS)).toBe(false);
    expect(isLongPage(LONG_PAGE_BLOCKS + 1)).toBe(true);
  });
});

describe("watchPageSize", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("reports the current size right away", () => {
    const e = localEditor("<p>a</p><p>b</p>");
    const sizes: number[] = [];

    watchPageSize(e, (n) => sizes.push(n));

    expect(sizes).toEqual([2]);
  });

  it("recounts once after edits pause instead of on every keystroke", () => {
    const e = localEditor("<p>a</p>");
    const sizes: number[] = [];
    watchPageSize(e, (n) => sizes.push(n), 500);

    e.commands.insertContent("<p>b</p>");
    vi.advanceTimersByTime(200);
    e.commands.insertContent("<p>c</p>");
    expect(sizes).toEqual([1]);

    vi.advanceTimersByTime(500);
    expect(sizes).toEqual([1, 3]);
  });

  it("stops reporting after it is disposed", () => {
    const e = localEditor("<p>a</p>");
    const sizes: number[] = [];
    const stop = watchPageSize(e, (n) => sizes.push(n), 500);

    stop();
    e.commands.insertContent("<p>b</p>");
    vi.advanceTimersByTime(1000);

    expect(sizes).toEqual([1]);
  });
});
