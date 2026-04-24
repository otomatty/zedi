import { describe, it, expect } from "vitest";
import { Tag, TAG_PASTE_REGEX, extractTagName, isExcludedTagName } from "./TagExtension";

/**
 * Tests for Tag mark extension (hashtag `#name` syntax).
 * タグマーク拡張（`#name` 形式）のテスト。
 *
 * See issue #725 (Phase 1). The regex is intentionally broad; fine-grained
 * exclusions (numeric-only, hex colors) are enforced in `getAttributes` via
 * `isExcludedTagName` so that reject reasons are colocated with the data shape.
 *
 * `TAG_PASTE_REGEX` intentionally has no capture group so Tiptap's
 * `markPasteRule` applies the mark to the full `#name` literal (the same
 * contract as `WIKI_LINK_PASTE_REGEX`). Tests below assert the full match
 * includes the leading `#` and that no capture group is introduced.
 */
describe("TagExtension paste rule", () => {
  describe("TAG_PASTE_REGEX", () => {
    it("has no capture group — full match preserves the leading `#`", () => {
      // `markPasteRule` が最後のキャプチャグループを優先する仕様を悪用しない
      // ように、正規表現全体を単一の一致として扱う。
      // Guards against a regression where a capture group is reintroduced and
      // `markPasteRule` strips the leading `#` from pasted text.
      const matches = [..."#tech".matchAll(TAG_PASTE_REGEX)];
      expect(matches).toHaveLength(1);
      expect(matches[0]).toHaveLength(1);
      expect(matches[0][0]).toBe("#tech");
    });

    it("matches a basic #tag pattern", () => {
      const text = "I like #tech";
      const matches = [...text.matchAll(TAG_PASTE_REGEX)];
      expect(matches).toHaveLength(1);
      expect(matches[0][0]).toBe("#tech");
    });

    it("matches multiple tags in a sentence", () => {
      const text = "See #tech and #design for details";
      const matches = [...text.matchAll(TAG_PASTE_REGEX)];
      expect(matches).toHaveLength(2);
      expect(matches[0][0]).toBe("#tech");
      expect(matches[1][0]).toBe("#design");
    });

    it("matches a tag at the very start of input", () => {
      const text = "#intro leads the document";
      const matches = [...text.matchAll(TAG_PASTE_REGEX)];
      expect(matches).toHaveLength(1);
      expect(matches[0][0]).toBe("#intro");
    });

    it("matches CJK / Japanese tag names", () => {
      const text = "これは #技術 と #趣味 のテスト";
      const matches = [...text.matchAll(TAG_PASTE_REGEX)];
      expect(matches).toHaveLength(2);
      expect(matches[0][0]).toBe("#技術");
      expect(matches[1][0]).toBe("#趣味");
    });

    it("matches tags with hyphens and underscores", () => {
      const text = "#front-end and #back_end";
      const matches = [...text.matchAll(TAG_PASTE_REGEX)];
      expect(matches).toHaveLength(2);
      expect(matches[0][0]).toBe("#front-end");
      expect(matches[1][0]).toBe("#back_end");
    });

    it("does not match `#` followed by whitespace (Markdown heading)", () => {
      const text = "# Heading";
      const matches = [...text.matchAll(TAG_PASTE_REGEX)];
      expect(matches).toHaveLength(0);
    });

    it("does not match `## ` (Markdown level 2 heading)", () => {
      const text = "## Subheading";
      const matches = [...text.matchAll(TAG_PASTE_REGEX)];
      expect(matches).toHaveLength(0);
    });

    it("does not match `#` embedded in a word (e.g. `abc#tag`)", () => {
      // `abc#tag` のように単語中に現れる `#` はタグと見なさない（URLやID等）。
      // `#` inside a word is not a tag (could be URL/ID).
      const text = "abc#tag";
      const matches = [...text.matchAll(TAG_PASTE_REGEX)];
      expect(matches).toHaveLength(0);
    });

    it("does not match URL fragments (e.g. `example.com#section`)", () => {
      const text = "Visit https://example.com#section for details";
      const matches = [...text.matchAll(TAG_PASTE_REGEX)];
      expect(matches).toHaveLength(0);
    });

    it("does not match a slash-prefixed fragment (e.g. `/page#anchor`)", () => {
      const text = "See /page#anchor";
      const matches = [...text.matchAll(TAG_PASTE_REGEX)];
      expect(matches).toHaveLength(0);
    });

    it("terminates on punctuation boundaries", () => {
      const text = "finish #tech, then #design.";
      const matches = [...text.matchAll(TAG_PASTE_REGEX)];
      expect(matches).toHaveLength(2);
      expect(matches[0][0]).toBe("#tech");
      expect(matches[1][0]).toBe("#design");
    });

    it("terminates on Japanese punctuation boundaries (、。)", () => {
      const text = "まず#技術、それから#趣味。";
      const matches = [...text.matchAll(TAG_PASTE_REGEX)];
      expect(matches).toHaveLength(2);
      expect(matches[0][0]).toBe("#技術");
      expect(matches[1][0]).toBe("#趣味");
    });

    it("does not match empty `#` alone", () => {
      const text = "# ";
      const matches = [...text.matchAll(TAG_PASTE_REGEX)];
      expect(matches).toHaveLength(0);
    });
  });

  describe("isExcludedTagName", () => {
    // 数字のみ: `#1`, `#42` などは連番参照である可能性が高くタグとしない。
    // Numeric-only names are likely ordinal references (issue numbers etc.), not tags.
    it("excludes purely numeric names", () => {
      expect(isExcludedTagName("1")).toBe(true);
      expect(isExcludedTagName("42")).toBe(true);
      expect(isExcludedTagName("2024")).toBe(true);
    });

    it("does not exclude alphanumeric names with any letter", () => {
      expect(isExcludedTagName("v1")).toBe(false);
      expect(isExcludedTagName("tag2024")).toBe(false);
      expect(isExcludedTagName("2024年")).toBe(false);
    });

    // 6 桁 / 8 桁の純 hex はカラーコードの可能性が高い。
    // 6-/8-char pure hex is very likely a CSS color literal.
    it("excludes 6-character pure hex (CSS color)", () => {
      expect(isExcludedTagName("FF0000")).toBe(true);
      expect(isExcludedTagName("abcdef")).toBe(true);
      expect(isExcludedTagName("0A1B2C")).toBe(true);
    });

    it("excludes 8-character pure hex (CSS color with alpha)", () => {
      expect(isExcludedTagName("FF0000FF")).toBe(true);
      expect(isExcludedTagName("deadbeef")).toBe(true);
    });

    it("does not exclude 3-character hex (ambiguous, accept as tag)", () => {
      // `#abc` は 3 桁 hex 色でもあり得るがタグ名としても自然なため採用側に倒す。
      // `#abc` is ambiguous with a short CSS color; lean toward treating as a tag.
      expect(isExcludedTagName("abc")).toBe(false);
      expect(isExcludedTagName("fff")).toBe(false);
    });

    it("does not exclude 7-character alphanumeric (not a valid hex color length)", () => {
      expect(isExcludedTagName("abcdefg")).toBe(false);
      expect(isExcludedTagName("FFFFFFF")).toBe(false);
    });

    it("does not exclude names with hyphens/underscores even if otherwise hex", () => {
      expect(isExcludedTagName("abc-def")).toBe(false);
      expect(isExcludedTagName("ab_cd_ef")).toBe(false);
    });

    it("excludes empty and whitespace-only names", () => {
      expect(isExcludedTagName("")).toBe(true);
      expect(isExcludedTagName("   ")).toBe(true);
    });
  });

  describe("extractTagName", () => {
    it("returns the trimmed name without the leading `#`", () => {
      expect(extractTagName("#tech")).toBe("tech");
      expect(extractTagName("#技術")).toBe("技術");
      expect(extractTagName("#front-end")).toBe("front-end");
    });

    it("returns null when the literal is empty or has no name", () => {
      expect(extractTagName("#")).toBeNull();
      expect(extractTagName("")).toBeNull();
    });

    it("returns null when the literal does not start with `#`", () => {
      expect(extractTagName("tech")).toBeNull();
    });
  });
});

describe("Tag extension configuration", () => {
  it("has addPasteRules defined", () => {
    const extension = Tag.configure({});
    expect(extension.config.addPasteRules).toBeDefined();
    expect(typeof extension.config.addPasteRules).toBe("function");
  });

  it("keeps existing functionality (parseHTML, renderHTML, addAttributes)", () => {
    const extension = Tag.configure({});
    expect(extension.config.parseHTML).toBeDefined();
    expect(extension.config.renderHTML).toBeDefined();
    expect(extension.config.addAttributes).toBeDefined();
  });
});
