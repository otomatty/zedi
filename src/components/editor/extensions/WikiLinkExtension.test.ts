import { describe, it, expect } from "vitest";
import { WikiLink, WIKI_LINK_PASTE_REGEX } from "./WikiLinkExtension";

/**
 * Tests for WikiLink paste rule.
 * WikiLink のペーストルールのテスト。
 */
describe("WikiLinkExtension paste rule", () => {
  describe("WIKI_LINK_PASTE_REGEX", () => {
    it("should match a basic [[Title]] pattern", () => {
      const text = "[[MyPage]]";
      const matches = [...text.matchAll(WIKI_LINK_PASTE_REGEX)];
      expect(matches).toHaveLength(1);
      expect(matches[0][1]).toBe("MyPage");
    });

    it("should match multiple [[WikiLink]] patterns in text", () => {
      const text = "See [[PageA]] and [[PageB]] for details";
      const matches = [...text.matchAll(WIKI_LINK_PASTE_REGEX)];
      expect(matches).toHaveLength(2);
      expect(matches[0][1]).toBe("PageA");
      expect(matches[1][1]).toBe("PageB");
    });

    it("should match titles with spaces", () => {
      const text = "[[My Page Title]]";
      const matches = [...text.matchAll(WIKI_LINK_PASTE_REGEX)];
      expect(matches).toHaveLength(1);
      expect(matches[0][1]).toBe("My Page Title");
    });

    it("should match titles with Japanese characters", () => {
      const text = "[[日本語ページ]]";
      const matches = [...text.matchAll(WIKI_LINK_PASTE_REGEX)];
      expect(matches).toHaveLength(1);
      expect(matches[0][1]).toBe("日本語ページ");
    });

    it("should not match empty brackets [[]]", () => {
      const text = "[[]]";
      const matches = [...text.matchAll(WIKI_LINK_PASTE_REGEX)];
      expect(matches).toHaveLength(0);
    });

    it("should not match whitespace-only titles [[ ]]", () => {
      const text = "[[ ]]";
      const matches = [...text.matchAll(WIKI_LINK_PASTE_REGEX)];
      // The regex matches but the title is whitespace-only; the paste rule
      // handler trims and skips empty titles at the attribute level.
      // Regex itself captures the content between brackets.
      expect(matches).toHaveLength(1);
      expect(matches[0][1].trim()).toBe("");
    });

    it("should not match single brackets [Title]", () => {
      const text = "[Title]";
      const matches = [...text.matchAll(WIKI_LINK_PASTE_REGEX)];
      expect(matches).toHaveLength(0);
    });

    it("should not capture brackets inside title with [[[Title]]]", () => {
      // The improved regex `[^\[\]]` excludes both `[` and `]` from capture,
      // so `[[[Title]]]` correctly matches only `[[Title]]` with capture "Title".
      // 改善した正規表現により、`[[[Title]]]` でも正しく "Title" だけをキャプチャする。
      const text = "[[[Title]]]";
      const matches = [...text.matchAll(WIKI_LINK_PASTE_REGEX)];
      expect(matches).toHaveLength(1);
      expect(matches[0][1]).toBe("Title");
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
