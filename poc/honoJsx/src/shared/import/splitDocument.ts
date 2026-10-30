/**
 * Splitting long imported content (web clips, PDF text) into several linked pages.
 * 長い取り込みコンテンツ（Web クリップ・PDF のテキスト）を複数のリンクされたページに分ける。
 *
 * Measured in this PoC: collaborative typing stays close to a local editor up to about
 * 1,000 text blocks, doubles at 2,000 and falls behind at 4,000 (README, "Large documents").
 * 計測では約 1,000 ブロックまでローカル編集並み、2,000 で 2 倍、4,000 で入力が追いつかない。
 */

/** ProseMirror JSON node as produced by `editor.getJSON()` or an importer. */
export interface BlockNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: BlockNode[];
  text?: string;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
}

/** Pages up to this many text blocks are left alone; the editor warns above it. */
export const LONG_PAGE_BLOCKS = 1000;
/** Split pages are packed up to this size, leaving room to keep writing. */
export const TARGET_PART_BLOCKS = 800;

const isInline = (node: BlockNode) => node.type === "text" || node.content === undefined;
const isTextblock = (node: BlockNode) =>
  node.content !== undefined && (node.content.length === 0 || node.content.every(isInline));

/**
 * Number of text blocks (paragraphs, headings, list item paragraphs…) in a block, the unit
 * that editing cost grows with. A block without text (e.g. a divider) counts as one.
 * ブロック内のテキストブロック数（編集コストが比例する単位）。テキストを持たないブロックは 1。
 */
export function blockWeight(node: BlockNode): number {
  if (node.content === undefined || isTextblock(node)) return 1;
  const children = node.content.filter((child) => !isInline(child));
  return Math.max(
    1,
    children.reduce((sum, child) => sum + blockWeight(child), 0),
  );
}

const totalWeight = (blocks: readonly BlockNode[]) =>
  blocks.reduce((sum, block) => sum + blockWeight(block), 0);

const headingLevel = (node: BlockNode): number | null =>
  node.type === "heading" && typeof node.attrs?.level === "number" ? node.attrs.level : null;

/** Cuts before each block that matches, keeping blocks before the first match as a section. */
function cutBefore(blocks: readonly BlockNode[], matches: (node: BlockNode) => boolean) {
  const sections: BlockNode[][] = [];
  for (const block of blocks) {
    const current = sections.at(-1);
    if (!current || matches(block)) sections.push([block]);
    else current.push(block);
  }
  return sections;
}

/** Splits text without usable headings into pages of about the same size. */
function cutEvenly(blocks: readonly BlockNode[], target: number): BlockNode[][] {
  const total = totalWeight(blocks);
  const size = Math.ceil(total / Math.ceil(total / target));
  const parts: BlockNode[][] = [];
  let current: BlockNode[] = [];
  let weight = 0;
  for (const block of blocks) {
    const w = blockWeight(block);
    if (current.length > 0 && weight + w > size) {
      parts.push(current);
      current = [];
      weight = 0;
    }
    current.push(block);
    weight += w;
  }
  if (current.length > 0) parts.push(current);
  return parts;
}

function partition(blocks: readonly BlockNode[], fromLevel: number, target: number): BlockNode[][] {
  if (totalWeight(blocks) <= target) return [[...blocks]];
  const levels = blocks
    .map(headingLevel)
    .filter((level): level is number => level !== null && level >= fromLevel);
  if (levels.length === 0) return cutEvenly(blocks, target);
  const level = Math.min(...levels);

  const parts: BlockNode[][] = [];
  let pending: BlockNode[] = [];
  let pendingWeight = 0;
  const flush = () => {
    if (pending.length > 0) parts.push(pending);
    pending = [];
    pendingWeight = 0;
  };
  for (const section of cutBefore(blocks, (node) => headingLevel(node) === level)) {
    const weight = totalWeight(section);
    if (weight > target) {
      // Only sections of the same chapter are packed together, so flush before descending.
      flush();
      parts.push(...partition(section, level + 1, target));
      continue;
    }
    if (pendingWeight + weight > target) flush();
    pending.push(...section);
    pendingWeight += weight;
  }
  flush();
  return parts;
}

/**
 * Splits a long document into pages. Documents up to `maxBlocks` stay whole. Longer ones are
 * cut before the highest heading level they use, oversized sections are cut again at the next
 * level, and consecutive sections of the same chapter are packed up to `targetBlocks`.
 * Text without headings is cut into even pages. Top-level blocks are never broken up.
 * 長い文書をページに分ける。`maxBlocks` 以下はそのまま。超える場合は最上位の見出しで切り、
 * 大きすぎる節は次の見出しレベルで切り直し、同じ章の連続する節を `targetBlocks` まで詰める。
 * 見出しのない本文は均等に切る。トップレベルのブロック自体は分割しない。
 */
export function splitDocument(
  blocks: readonly BlockNode[],
  options: { maxBlocks?: number; targetBlocks?: number } = {},
): BlockNode[][] {
  const { maxBlocks = LONG_PAGE_BLOCKS, targetBlocks = TARGET_PART_BLOCKS } = options;
  if (totalWeight(blocks) <= maxBlocks) return [[...blocks]];
  return partition(blocks, 1, targetBlocks);
}

/** A page to create: client-generated id, title and ProseMirror JSON blocks. */
export interface PageDraft {
  id: string;
  title: string;
  blocks: BlockNode[];
}

const text = (value: string): BlockNode => ({ type: "text", text: value });
const link = (page: { id: string; title: string }): BlockNode => ({
  type: "wikiLink",
  attrs: { title: page.title, targetId: page.id },
});
const plainText = (node: BlockNode): string =>
  node.text ?? (node.content ?? []).map(plainText).join("");

/**
 * Turns split parts into pages: an index page that links to every part, and parts that start
 * with a link back to the index and end with links to the previous and next part.
 * 分割結果をページにする。目次ページは全パートへリンクし、各パートは先頭に目次への
 * リンク、末尾に前後のパートへのリンクを持つ。
 */
export function linkSplitPages(input: {
  title: string;
  parts: readonly BlockNode[][];
  newId: () => string;
}): { index: PageDraft; parts: PageDraft[] } {
  const { title, parts, newId } = input;
  const index = { id: newId(), title };
  const count = parts.length;
  const named = parts.map((blocks, i) => {
    const first = blocks[0];
    const heading = first && headingLevel(first) !== null ? plainText(first).trim() : "";
    const position = `${title} (${i + 1}/${count})`;
    return { id: newId(), title: heading ? `${position}: ${heading}` : position, blocks };
  });

  const pages = named.map((page, i): PageDraft => {
    const prev = named[i - 1];
    const next = named[i + 1];
    const footer: BlockNode[] = [
      ...(prev ? [text("← "), link(prev)] : []),
      ...(prev && next ? [text(" · ")] : []),
      ...(next ? [link(next), text(" →")] : []),
    ];
    return {
      id: page.id,
      title: page.title,
      blocks: [
        { type: "paragraph", content: [link(index), text(` · ${i + 1}/${count}`)] },
        ...page.blocks,
        ...(footer.length > 0 ? [{ type: "paragraph", content: footer }] : []),
      ],
    };
  });

  return {
    index: {
      ...index,
      blocks: [
        {
          type: "paragraph",
          content: [text(`長い文書のため ${count} ページに分けて取り込みました。`)],
        },
        {
          type: "orderedList",
          content: named.map((page) => ({
            type: "listItem",
            content: [{ type: "paragraph", content: [link(page)] }],
          })),
        },
      ],
    },
    parts: pages,
  };
}
