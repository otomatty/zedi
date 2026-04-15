import { describe, it, expect } from "vitest";
import { WikiLink, WIKI_LINK_PASTE_REGEX } from "./WikiLinkExtension";

/**
 * Tests for WikiLink paste rule.
 * WikiLink のペーストルールのテスト。
 */
describe("WikiLinkExtension paste rule", () => {
  describe("WIKI_LINK_PASTE_REGEX", () => {
    // 正規表現はキャプチャグループを持たず、マッチ全体 `[[Title]]` を対象とする
    // （Tiptap の `markPasteRule` に括弧ごとマークを付与させるため）。
    // The regex has no capture group; the full `[[Title]]` match is the target
    // so that Tiptap's `markPasteRule` applies the mark to the brackets as well.

    it("should match a basic [[Title]] pattern (full bracket form)", () => {
      const text = "[[MyPage]]";
      const matches = [...text.matchAll(WIKI_LINK_PASTE_REGEX)];
      expect(matches).toHaveLength(1);
      expect(matches[0][0]).toBe("[[MyPage]]");
    });

    it("should match multiple [[WikiLink]] patterns in text", () => {
      const text = "See [[PageA]] and [[PageB]] for details";
      const matches = [...text.matchAll(WIKI_LINK_PASTE_REGEX)];
      expect(matches).toHaveLength(2);
      expect(matches[0][0]).toBe("[[PageA]]");
      expect(matches[1][0]).toBe("[[PageB]]");
    });

    it("should match titles with spaces", () => {
      const text = "[[My Page Title]]";
      const matches = [...text.matchAll(WIKI_LINK_PASTE_REGEX)];
      expect(matches).toHaveLength(1);
      expect(matches[0][0]).toBe("[[My Page Title]]");
    });

    it("should match titles with Japanese characters", () => {
      const text = "[[日本語ページ]]";
      const matches = [...text.matchAll(WIKI_LINK_PASTE_REGEX)];
      expect(matches).toHaveLength(1);
      expect(matches[0][0]).toBe("[[日本語ページ]]");
    });

    it("should not match empty brackets [[]]", () => {
      const text = "[[]]";
      const matches = [...text.matchAll(WIKI_LINK_PASTE_REGEX)];
      expect(matches).toHaveLength(0);
    });

    it("should match whitespace-only titles [[ ]] (handler filters via getAttributes)", () => {
      const text = "[[ ]]";
      const matches = [...text.matchAll(WIKI_LINK_PASTE_REGEX)];
      // 正規表現自体は空白のみのタイトルもマッチさせるが、`getAttributes` 側で
      // トリム後に空だった場合は `false` を返してマーク適用を抑止する。
      // The regex itself matches whitespace-only titles, but `getAttributes`
      // returns `false` after trimming so no mark is applied.
      expect(matches).toHaveLength(1);
      expect(matches[0][0]).toBe("[[ ]]");
    });

    it("should not match single brackets [Title]", () => {
      const text = "[Title]";
      const matches = [...text.matchAll(WIKI_LINK_PASTE_REGEX)];
      expect(matches).toHaveLength(0);
    });

    it("should not include extra outer brackets in a [[[Title]]] match", () => {
      // `[^[\]]` が `[` と `]` の両方を除外するため、`[[[Title]]]` は
      // 内側の `[[Title]]` のみにマッチする。
      // Because `[^[\]]` excludes both `[` and `]`, `[[[Title]]]` matches only
      // the inner `[[Title]]`.
      const text = "[[[Title]]]";
      const matches = [...text.matchAll(WIKI_LINK_PASTE_REGEX)];
      expect(matches).toHaveLength(1);
      expect(matches[0][0]).toBe("[[Title]]");
    });
  });

  describe("WikiLink extension configuration", () => {
    it("should have addPasteRules defined", () => {
      const extension = WikiLink.configure({});
      // The extension config should have paste rules
      expect(extension.config.addPasteRules).toBeDefined();
      expect(typeof extension.config.addPasteRules).toBe("function");
    });

    it("should keep existing functionality (parseHTML, renderHTML)", () => {
      const extension = WikiLink.configure({});
      expect(extension.config.parseHTML).toBeDefined();
      expect(extension.config.renderHTML).toBeDefined();
      expect(extension.config.addAttributes).toBeDefined();
    });
  });
});
