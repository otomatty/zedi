import { describe, expect, it } from "vitest";
import {
  LONG_PAGE_BLOCKS,
  blockWeight,
  linkSplitPages,
  splitDocument,
  type BlockNode,
} from "./splitDocument";

const paragraph = (text: string): BlockNode => ({
  type: "paragraph",
  content: [{ type: "text", text }],
});
const heading = (level: number, text: string): BlockNode => ({
  type: "heading",
  attrs: { level },
  content: [{ type: "text", text }],
});
const paragraphs = (count: number, label = "p"): BlockNode[] =>
  Array.from({ length: count }, (_, i) => paragraph(`${label} ${i}`));
const bulletList = (items: number): BlockNode => ({
  type: "bulletList",
  content: Array.from({ length: items }, (_, i) => ({
    type: "listItem",
    content: [paragraph(`item ${i}`)],
  })),
});
const chapter = (level: number, title: string, body: number): BlockNode[] => [
  heading(level, title),
  ...paragraphs(body - 1, title),
];

const weights = (parts: BlockNode[][]) =>
  parts.map((p) => p.reduce((n, b) => n + blockWeight(b), 0));
const firstHeadings = (parts: BlockNode[][]) =>
  parts.map((p) => (p[0]?.type === "heading" ? p[0].content?.[0]?.text : null));
const textOf = (node: BlockNode): string =>
  node.text ??
  (node.type === "wikiLink" ? `[[${String(node.attrs?.title)}]]` : "") +
    (node.content ?? []).map(textOf).join("");

describe("blockWeight", () => {
  it("counts a text block as one", () => {
    expect(blockWeight(paragraph("a"))).toBe(1);
    expect(blockWeight(heading(2, "a"))).toBe(1);
    expect(blockWeight({ type: "horizontalRule" })).toBe(1);
  });

  it("counts every text block inside lists and quotes", () => {
    expect(blockWeight(bulletList(30))).toBe(30);
    expect(
      blockWeight({ type: "blockquote", content: [paragraph("a"), bulletList(2), paragraph("b")] }),
    ).toBe(4);
  });
});

describe("splitDocument", () => {
  it("keeps a document up to the long-page limit on one page", () => {
    const blocks = paragraphs(LONG_PAGE_BLOCKS);

    expect(splitDocument(blocks)).toEqual([blocks]);
  });

  it("splits a longer document before its top-level headings", () => {
    const blocks = [
      ...chapter(1, "One", 500),
      ...chapter(1, "Two", 500),
      ...chapter(1, "Three", 500),
    ];

    const parts = splitDocument(blocks);

    expect(firstHeadings(parts)).toEqual(["One", "Two", "Three"]);
    expect(parts.flat()).toEqual(blocks);
  });

  it("packs consecutive short chapters into one page", () => {
    const blocks = Array.from({ length: 10 }, (_, i) => chapter(1, `C${i}`, 150)).flat();

    const parts = splitDocument(blocks, { targetBlocks: 800 });

    expect(weights(parts)).toEqual([750, 750]);
    expect(firstHeadings(parts)).toEqual(["C0", "C5"]);
  });

  it("splits an oversized chapter before its next heading level", () => {
    const blocks = [
      heading(1, "Book"),
      ...chapter(2, "A", 500),
      ...chapter(2, "B", 500),
      ...chapter(2, "C", 500),
    ];

    const parts = splitDocument(blocks, { targetBlocks: 800 });

    expect(parts.map((p) => p.slice(0, 2).map(textOf))).toEqual([
      ["Book", "A"],
      ["B", "B 0"],
      ["C", "C 0"],
    ]);
    expect(parts.flat()).toEqual(blocks);
  });

  it("does not pack sections of different chapters together", () => {
    const blocks = [
      heading(1, "First"),
      ...chapter(2, "A", 500),
      ...chapter(2, "B", 500),
      ...chapter(2, "C", 100),
      ...chapter(1, "Second", 200),
    ];

    const parts = splitDocument(blocks, { targetBlocks: 800 });

    expect(weights(parts)).toEqual([501, 600, 200]);
    expect(firstHeadings(parts)).toEqual(["First", "B", "Second"]);
  });

  it("skips heading levels the document does not use", () => {
    const blocks = [...chapter(3, "X", 700), ...chapter(3, "Y", 700)];

    expect(firstHeadings(splitDocument(blocks, { targetBlocks: 800 }))).toEqual(["X", "Y"]);
  });

  it("cuts text without headings into pages of even size", () => {
    const parts = splitDocument(paragraphs(2500), { targetBlocks: 800 });

    expect(weights(parts)).toEqual([625, 625, 625, 625]);
  });

  it("keeps a list whole and counts its items toward the page size", () => {
    const list = bulletList(900);
    const blocks = [...paragraphs(200, "intro"), list];

    const parts = splitDocument(blocks, { targetBlocks: 800 });

    expect(parts).toEqual([paragraphs(200, "intro"), [list]]);
  });

  it("puts a block larger than a page on a page of its own", () => {
    const list = bulletList(1500);
    const blocks = [...paragraphs(100, "a"), list, ...paragraphs(100, "b")];

    const parts = splitDocument(blocks, { targetBlocks: 800 });

    expect(parts).toEqual([paragraphs(100, "a"), [list], paragraphs(100, "b")]);
  });
});

describe("linkSplitPages", () => {
  const ids = () => {
    let n = 0;
    return () => `id-${(n += 1)}`;
  };

  it("names each part after the document, its position and its first heading", () => {
    const pages = linkSplitPages({
      title: "Guide",
      parts: [[heading(1, "Setup"), paragraph("x")], [paragraph("y")]],
      newId: ids(),
    });

    expect(pages.index).toMatchObject({ id: "id-1", title: "Guide" });
    expect(pages.parts.map((p) => [p.id, p.title])).toEqual([
      ["id-2", "Guide (1/2): Setup"],
      ["id-3", "Guide (2/2)"],
    ]);
  });

  it("lists every part on the index page in order", () => {
    const pages = linkSplitPages({
      title: "Guide",
      parts: [[paragraph("a")], [paragraph("b")], [paragraph("c")]],
      newId: ids(),
    });

    const links: unknown[] = [];
    const collect = (node: BlockNode) => {
      if (node.type === "wikiLink") links.push(node.attrs);
      node.content?.forEach(collect);
    };
    pages.index.blocks.forEach(collect);

    expect(links).toEqual(pages.parts.map((p) => ({ title: p.title, targetId: p.id })));
  });

  it("frames each part with a link back to the index and links to its neighbours", () => {
    const pages = linkSplitPages({
      title: "Guide",
      parts: [[paragraph("a")], [paragraph("b")], [paragraph("c")]],
      newId: ids(),
    });

    const middle = pages.parts[1];
    expect(middle?.blocks.map(textOf)).toEqual([
      "[[Guide]] · 2/3",
      "b",
      "← [[Guide (1/3)]] · [[Guide (3/3)]] →",
    ]);
    expect(pages.parts[0]?.blocks.at(-1)).toSatisfy(
      (b: BlockNode) => textOf(b) === "[[Guide (2/3)]] →",
    );
    expect(pages.parts[2]?.blocks.at(-1)).toSatisfy(
      (b: BlockNode) => textOf(b) === "← [[Guide (2/3)]]",
    );
  });
});
