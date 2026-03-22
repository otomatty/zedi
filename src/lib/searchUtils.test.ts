import { describe, it, expect, vi, afterEach } from "vitest";
import {
  escapeRegExp,
  extractSmartSnippet,
  highlightKeywords,
  determineMatchType,
  calculateEnhancedScore,
  parseSearchQuery,
} from "./searchUtils";
import type { Page } from "@/types/page";
import { createPlainTextContent } from "@/test/testDatabase";

// Helper to create a test page
function createTestPage(id: string, title: string, content: string, options?: Partial<Page>): Page {
  const now = Date.now();
  return {
    id,
    ownerUserId: "test-user",
    title,
    content,
    createdAt: now,
    updatedAt: now,
    isDeleted: false,
    ...options,
  };
}

describe("parseSearchQuery", () => {
  it("should split query by whitespace", () => {
    const result = parseSearchQuery("機械学習 ニューラル");
    expect(result).toEqual(["機械学習", "ニューラル"]);
  });

  it("should handle multiple spaces", () => {
    const result = parseSearchQuery("hello   world");
    expect(result).toEqual(["hello", "world"]);
  });

  it("should trim leading and trailing whitespace", () => {
    const result = parseSearchQuery("  test  ");
    expect(result).toEqual(["test"]);
  });

  it("should return empty array for empty query", () => {
    const result = parseSearchQuery("");
    expect(result).toEqual([]);
  });

  it("should return empty array for whitespace-only query", () => {
    const result = parseSearchQuery("   ");
    expect(result).toEqual([]);
  });

  it("should handle single keyword", () => {
    const result = parseSearchQuery("keyword");
    expect(result).toEqual(["keyword"]);
  });
});

describe("escapeRegExp", () => {
  it("should escape special regex characters", () => {
    expect(escapeRegExp("hello.world")).toBe("hello\\.world");
    expect(escapeRegExp("test*")).toBe("test\\*");
    expect(escapeRegExp("(test)")).toBe("\\(test\\)");
    expect(escapeRegExp("[a-z]")).toBe("\\[a-z\\]");
  });

  it("should not modify plain strings", () => {
    expect(escapeRegExp("hello")).toBe("hello");
    expect(escapeRegExp("機械学習")).toBe("機械学習");
  });
});

describe("extractSmartSnippet", () => {
  it("should extract sentence containing keyword", () => {
    const text = "最初の文章です。機械学習は人工知能の一分野です。最後の文章です。";
    const result = extractSmartSnippet(text, ["機械学習"]);
    expect(result).toContain("機械学習");
  });

  it("should prioritize sentence with most keywords", () => {
    const text = "AIについて。機械学習とニューラルネットワークの説明。別の話題です。";
    const result = extractSmartSnippet(text, ["機械学習", "ニューラル"]);
    expect(result).toContain("機械学習");
    expect(result).toContain("ニューラル");
  });

  it("should handle text without sentence delimiters", () => {
    const text = "This is a long text without any sentence delimiters that contains keyword here";
    const result = extractSmartSnippet(text, ["keyword"], 50);
    // May include ellipsis on both sides ("..." + content + "...")
    expect(result.length).toBeLessThanOrEqual(60);
  });

  it("should return beginning of text when keywords not found", () => {
    const text = "This is some text that does not contain the search term";
    const result = extractSmartSnippet(text, ["xyz"], 30);
    expect(result).toContain("This is");
  });

  it("should handle empty text", () => {
    const result = extractSmartSnippet("", ["keyword"]);
    expect(result).toBe("");
  });

  it("should handle empty keywords", () => {
    const text = "Some text content";
    const result = extractSmartSnippet(text, []);
    expect(result).toContain("Some text");
  });

  it("should truncate long sentences around keyword", () => {
    const text =
      "これは非常に長い文章でありまして、機械学習という単語がこの文章の中に含まれていますが、文章自体がとても長いので省略されるべきです。";
    const result = extractSmartSnippet(text, ["機械学習"], 60);
    expect(result.length).toBeLessThanOrEqual(66); // 60 + ellipsis margin
    expect(result).toContain("機械学習");
  });

  // 同スコアの文が複数あるときは先に出現した文を選ぶ（> と >= で結果が変わる mutation を検知）
  // When two sentences tie on keyword count, prefer the earlier sentence (detects > vs >=).
  it("prefers the first sentence when keyword counts are equal", () => {
    const text = "First line has keyword here. Second line also has keyword here.";
    const result = extractSmartSnippet(text, ["keyword"]);
    expect(result.toLowerCase()).toContain("first");
  });
});

describe("highlightKeywords", () => {
  it("should wrap keyword with brackets", () => {
    const result = highlightKeywords("機械学習は重要です", ["機械学習"]);
    expect(result).toBe("【機械学習】は重要です");
  });

  it("should highlight multiple keywords", () => {
    const result = highlightKeywords("機械学習とニューラルネットワーク", [
      "機械学習",
      "ニューラル",
    ]);
    expect(result).toBe("【機械学習】と【ニューラル】ネットワーク");
  });

  it("should be case insensitive", () => {
    const result = highlightKeywords("Hello World", ["hello"]);
    expect(result).toBe("【Hello】 World");
  });

  it("should handle multiple occurrences", () => {
    const result = highlightKeywords("test test test", ["test"]);
    expect(result).toBe("【test】 【test】 【test】");
  });

  it("should handle special regex characters in keywords", () => {
    const result = highlightKeywords("test (value) here", ["(value)"]);
    expect(result).toBe("test 【(value)】 here");
  });

  it("should not modify text when no keywords match", () => {
    const result = highlightKeywords("Hello World", ["xyz"]);
    expect(result).toBe("Hello World");
  });
});

describe("determineMatchType", () => {
  it("should return exact_title for exact title match", () => {
    const result = determineMatchType("機械学習", "コンテンツ", ["機械学習"], "機械学習");
    expect(result).toBe("exact_title");
  });

  it("should return title for title partial match", () => {
    const result = determineMatchType("機械学習入門", "別のコンテンツ", ["機械"], "機械");
    expect(result).toBe("title");
  });

  it("should return both when keywords in title and content", () => {
    const result = determineMatchType(
      "機械学習入門",
      "これは機械学習についてです",
      ["機械学習"],
      "機械学習",
    );
    expect(result).toBe("both");
  });

  it("should return content for content-only match", () => {
    const result = determineMatchType("入門書", "機械学習について学ぶ", ["機械学習"], "機械学習");
    expect(result).toBe("content");
  });

  it("should handle multiple keywords for title match", () => {
    const result = determineMatchType(
      "機械学習とニューラルネットワーク",
      "別のコンテンツ",
      ["機械学習", "ニューラル"],
      "機械学習 ニューラル",
    );
    expect(result).toBe("title");
  });

  it("should be case insensitive", () => {
    const result = determineMatchType("HELLO", "world", ["hello"], "hello");
    expect(result).toBe("exact_title");
  });
});

describe("calculateEnhancedScore", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("should give highest score for exact_title", () => {
    const page = createTestPage("1", "機械学習", createPlainTextContent("content"));
    const score = calculateEnhancedScore(page, ["機械学習"], "exact_title");
    expect(score).toBeGreaterThanOrEqual(200);
  });

  it("should give higher score for title match than content", () => {
    const page = createTestPage("1", "機械学習", createPlainTextContent("content"));
    const titleScore = calculateEnhancedScore(page, ["機械"], "title");
    const contentScore = calculateEnhancedScore(page, ["機械"], "content");
    expect(titleScore).toBeGreaterThan(contentScore);
  });

  it("should add bonus for title starting with keyword", () => {
    const page = createTestPage("1", "機械学習入門", createPlainTextContent("content"));
    const score = calculateEnhancedScore(page, ["機械"], "title");
    // Should have prefix bonus
    expect(score).toBeGreaterThan(100);
  });

  it("should add bonus for keyword occurrences in content", () => {
    const contentWithOccurrences = createPlainTextContent("機械学習 機械学習 機械学習");
    const page = createTestPage("1", "Title", contentWithOccurrences);
    const score = calculateEnhancedScore(page, ["機械学習"], "content");
    // Should have occurrence bonus
    expect(score).toBeGreaterThan(30);
  });

  it("should add recency bonus for new pages", () => {
    const now = Date.now();
    const newPage = createTestPage("1", "Title", createPlainTextContent("content"), {
      updatedAt: now,
    });
    const oldPage = createTestPage("2", "Title", createPlainTextContent("content"), {
      updatedAt: now - 30 * 24 * 60 * 60 * 1000, // 30 days ago
    });

    const newScore = calculateEnhancedScore(newPage, ["Title"], "title");
    const oldScore = calculateEnhancedScore(oldPage, ["Title"], "title");

    expect(newScore).toBeGreaterThan(oldScore);
  });

  // 以下は global regex・算術・min/max の誤変更を検知するため、固定時刻で期待差分を厳密に見る
  // Tight score diffs with frozen time to catch bad edits to regex flags, arithmetic, min/max.
  it("adds exactly 4 points for two extra keyword occurrences in plain text", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-06-10T12:00:00.000Z"));
    const t = Date.now();
    const oneKw = createTestPage("1", "T", createPlainTextContent("kw padding"), { updatedAt: t });
    const threeKw = createTestPage("2", "T", createPlainTextContent("kw kw kw padding"), {
      updatedAt: t,
    });
    const s1 = calculateEnhancedScore(oneKw, ["kw"], "content");
    const s3 = calculateEnhancedScore(threeKw, ["kw"], "content");
    expect(s3 - s1).toBe(4);
  });

  it("caps occurrence bonus so five and six hits yield the same score", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-06-10T12:00:00.000Z"));
    const t = Date.now();
    const fiveHits = createPlainTextContent("kw kw kw kw kw tail");
    const sixHits = createPlainTextContent("kw kw kw kw kw kw tail");
    const p5 = createTestPage("1", "T", fiveHits, { updatedAt: t });
    const p6 = createTestPage("2", "T", sixHits, { updatedAt: t });
    expect(calculateEnhancedScore(p5, ["kw"], "content")).toBe(
      calculateEnhancedScore(p6, ["kw"], "content"),
    );
  });

  it("applies a recency delta of exactly 10 between same-day and 15-day-old pages", () => {
    vi.useFakeTimers();
    const instant = new Date("2025-03-01T09:00:00.000Z").getTime();
    vi.setSystemTime(new Date("2025-03-01T09:00:00.000Z"));
    const recent = createTestPage("1", "T", createPlainTextContent("x"), { updatedAt: instant });
    const old = createTestPage("2", "T", createPlainTextContent("x"), {
      updatedAt: instant - 15 * 24 * 60 * 60 * 1000,
    });
    const sRecent = calculateEnhancedScore(recent, ["nomatch"], "content");
    const sOld = calculateEnhancedScore(old, ["nomatch"], "content");
    expect(sRecent - sOld).toBe(10);
  });
});
