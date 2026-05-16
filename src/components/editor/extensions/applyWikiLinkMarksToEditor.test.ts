import { describe, it, expect } from "vitest";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { WikiLink } from "./WikiLinkExtension";
import { applyWikiLinkMarksToEditor } from "./applyWikiLinkMarksToEditor";

/**
 * 初期同期後の `[[Title]]` → `wikiLink` mark 一括正規化テスト。
 * Issue #880 Phase B（Hocuspocus からロードした既存 Y.Doc に対する正規化）。
 *
 * Tests cover acceptance criteria for issue #880 Phase B:
 *   - plain `[[Title]]` text is promoted to a `wikiLink` mark
 *   - already-marked wiki links are not double-marked
 *   - code-block / inline-code text stays literal
 *   - status attributes (`exists` / `referenced` / `targetId`) start unresolved
 */
function makeEditor(initialContent: string): Editor {
  return new Editor({
    extensions: [StarterKit, WikiLink],
    content: initialContent,
  });
}

/**
 * Find the first `wikiLink` mark and return its `attrs`.
 * 最初に見つかった `wikiLink` mark の attrs を取り出すヘルパー。
 */
function firstWikiMarkAttrs(editor: Editor): Record<string, unknown> | null {
  let result: Record<string, unknown> | null = null;
  editor.state.doc.descendants((node) => {
    if (!node.isText || result) return;
    const mark = node.marks.find((m) => m.type.name === "wikiLink");
    if (mark) {
      result = mark.attrs as Record<string, unknown>;
    }
  });
  return result;
}

/**
 * Count total wikiLink-marked text segments in the document.
 * 文書内の wikiLink mark 付きセグメント数を数える。
 */
function countWikiMarks(editor: Editor): number {
  let count = 0;
  editor.state.doc.descendants((node) => {
    if (!node.isText) return;
    if (node.marks.some((m) => m.type.name === "wikiLink")) count += 1;
  });
  return count;
}

describe("applyWikiLinkMarksToEditor", () => {
  it("promotes a plain `[[Title]]` text node to a wikiLink mark", () => {
    const editor = makeEditor("<p>see [[Foo]] for details</p>");
    try {
      const applied = applyWikiLinkMarksToEditor(editor);
      expect(applied).toBe(true);

      const attrs = firstWikiMarkAttrs(editor);
      expect(attrs).not.toBeNull();
      expect(attrs?.title).toBe("Foo");
      // 初期同期直後の正規化は未解決状態でマークする。`useWikiLinkStatusSync`
      // が後段で `exists/referenced/targetId` を埋める設計（issue #880 受入条件）。
      // Issue #880 acceptance criteria: post-sync normalization marks links as
      // unresolved; `useWikiLinkStatusSync` later fills in status attrs.
      expect(attrs?.exists).toBe(false);
      expect(attrs?.referenced).toBe(false);
      expect(attrs?.targetId).toBeNull();
    } finally {
      editor.destroy();
    }
  });

  it("does not double-mark an already-marked wikiLink", () => {
    // 既に WikiLink mark が付いている text node は対象外。
    // Already-marked wikiLink text must not be re-marked.
    const editor = makeEditor(
      '<p><span data-wiki-link data-title="Foo" data-exists="true" data-referenced="false">[[Foo]]</span></p>',
    );
    try {
      const before = countWikiMarks(editor);
      const applied = applyWikiLinkMarksToEditor(editor);
      expect(applied).toBe(false);
      expect(countWikiMarks(editor)).toBe(before);

      // 既存マークの `exists=true` を温存する。再 mark すると `exists=false` に
      // 巻き戻ってしまうため、これは重要な不変条件。
      // The mark must keep its existing `exists=true`; a second pass would
      // regress it back to `false`, which is a regression we explicitly guard
      // against.
      const attrs = firstWikiMarkAttrs(editor);
      expect(attrs?.exists).toBe(true);
    } finally {
      editor.destroy();
    }
  });

  it("does not mark `[[Title]]` inside an inline code mark", () => {
    const editor = makeEditor("<p><code>[[Foo]]</code></p>");
    try {
      const applied = applyWikiLinkMarksToEditor(editor);
      expect(applied).toBe(false);
      expect(countWikiMarks(editor)).toBe(0);
    } finally {
      editor.destroy();
    }
  });

  it("does not mark `[[Title]]` inside a code block", () => {
    const editor = makeEditor("<pre><code>[[Foo]]</code></pre>");
    try {
      const applied = applyWikiLinkMarksToEditor(editor);
      expect(applied).toBe(false);
      expect(countWikiMarks(editor)).toBe(0);
    } finally {
      editor.destroy();
    }
  });

  it("skips empty title `[[   ]]`", () => {
    // 空タイトルは `transformWikiLinksInContent` と同じ契約でスキップ。
    // Empty titles are skipped, matching the paste-time normalizer contract.
    const editor = makeEditor("<p>[[   ]]</p>");
    try {
      const applied = applyWikiLinkMarksToEditor(editor);
      expect(applied).toBe(false);
      expect(countWikiMarks(editor)).toBe(0);
    } finally {
      editor.destroy();
    }
  });

  it("marks multiple `[[Title]]` patterns in the same paragraph", () => {
    const editor = makeEditor("<p>see [[A]] and [[B]]</p>");
    try {
      const applied = applyWikiLinkMarksToEditor(editor);
      expect(applied).toBe(true);
      expect(countWikiMarks(editor)).toBe(2);

      const titles: string[] = [];
      editor.state.doc.descendants((node) => {
        if (!node.isText) return;
        const mark = node.marks.find((m) => m.type.name === "wikiLink");
        if (mark) titles.push(mark.attrs.title as string);
      });
      expect(titles).toEqual(["A", "B"]);
    } finally {
      editor.destroy();
    }
  });

  it("returns false when no `[[Title]]` patterns exist", () => {
    const editor = makeEditor("<p>just plain text</p>");
    try {
      const applied = applyWikiLinkMarksToEditor(editor);
      expect(applied).toBe(false);
    } finally {
      editor.destroy();
    }
  });

  it("trims whitespace from the title attribute and marks the full bracket span", () => {
    // 表示テキストは `[[ Foo Bar ]]` 全体に mark が乗り、attrs.title はトリム後の値。
    // (Note: ProseMirror's HTML parser collapses consecutive whitespace, so the
    // input `[[  Foo Bar  ]]` becomes `[[ Foo Bar ]]` once it lands in the doc.
    // What the helper guarantees is that the mark spans the brackets verbatim
    // and `attrs.title` holds the trimmed value.)
    //
    // Display text retains the bracket form and the mark spans the whole
    // `[[...]]`; `attrs.title` is the trimmed inner string.
    const editor = makeEditor("<p>[[ Foo Bar ]]</p>");
    try {
      const applied = applyWikiLinkMarksToEditor(editor);
      expect(applied).toBe(true);

      const attrs = firstWikiMarkAttrs(editor);
      expect(attrs?.title).toBe("Foo Bar");

      let text = "";
      editor.state.doc.descendants((node) => {
        if (node.isText && node.marks.some((m) => m.type.name === "wikiLink")) {
          text = node.text ?? "";
        }
      });
      expect(text).toBe("[[ Foo Bar ]]");
    } finally {
      editor.destroy();
    }
  });
});
