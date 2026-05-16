import { describe, it, expect } from "vitest";
import {
  searchPages,
  buildGlobalSearchResults,
  buildPdfHighlightItem,
  dedupSharedRowsAgainstPersonal,
  formatPdfHighlightDisplay,
  PDF_HIGHLIGHT_BASE_SCORE,
  type GlobalSearchResultItem,
} from "./useGlobalSearch";
import type { Page } from "@/types/page";
import type {
  SearchPageResultRow,
  SearchPdfHighlightResultRow,
  SearchResultRow,
} from "@/lib/api/types";
import { createPlainTextContent } from "@/test/testDatabase";
import { parseSearchQuery } from "@/lib/searchUtils";

// Helper to create a test page
function createTestPage(id: string, title: string, content: string, options?: Partial<Page>): Page {
  const now = Date.now();
  return {
    id,
    ownerUserId: "test-user",
    noteId: null,
    title,
    content,
    createdAt: now,
    updatedAt: now,
    isDeleted: false,
    ...options,
  };
}

describe("searchPages", () => {
  describe("Basic Search", () => {
    it("should return empty array for empty query", () => {
      const pages = [createTestPage("1", "Test Page", createPlainTextContent("content"))];
      const results = searchPages(pages, "");
      expect(results).toEqual([]);
    });

    it("should return empty array for whitespace-only query", () => {
      const pages = [createTestPage("1", "Test Page", createPlainTextContent("content"))];
      const results = searchPages(pages, "   ");
      expect(results).toEqual([]);
    });

    it("should find page by title", () => {
      const pages = [
        createTestPage("1", "機械学習入門", createPlainTextContent("content")),
        createTestPage("2", "Other Page", createPlainTextContent("content")),
      ];

      const results = searchPages(pages, "機械学習");

      expect(results).toHaveLength(1);
      expect(results[0].page.id).toBe("1");
    });

    it("should find page by content", () => {
      const pages = [
        createTestPage("1", "Title", createPlainTextContent("機械学習について")),
        createTestPage("2", "Other", createPlainTextContent("別のコンテンツ")),
      ];

      const results = searchPages(pages, "機械学習");

      expect(results).toHaveLength(1);
      expect(results[0].page.id).toBe("1");
    });

    it("should be case insensitive", () => {
      const pages = [createTestPage("1", "Hello World", createPlainTextContent("content"))];

      const results = searchPages(pages, "hello");

      expect(results).toHaveLength(1);
    });

    it("should exclude deleted pages", () => {
      const pages = [
        createTestPage("1", "Active Page", createPlainTextContent("content")),
        createTestPage("2", "Deleted Page", createPlainTextContent("content"), {
          isDeleted: true,
        }),
      ];

      const results = searchPages(pages, "Page");

      expect(results).toHaveLength(1);
      expect(results[0].page.id).toBe("1");
    });
  });

  describe("Multiple Keyword AND Search", () => {
    it("should require all keywords to match (AND)", () => {
      const pages = [
        createTestPage("1", "機械学習とニューラルネットワーク", createPlainTextContent("content")),
        createTestPage("2", "機械学習入門", createPlainTextContent("content")),
        createTestPage("3", "ニューラルネットワーク", createPlainTextContent("content")),
      ];

      const results = searchPages(pages, "機械学習 ニューラル");

      expect(results).toHaveLength(1);
      expect(results[0].page.id).toBe("1");
    });

    it("should match keywords across title and content", () => {
      const pages = [
        createTestPage("1", "機械学習", createPlainTextContent("ニューラルネットワークの説明")),
      ];

      const results = searchPages(pages, "機械学習 ニューラル");

      expect(results).toHaveLength(1);
    });

    it("should handle three or more keywords", () => {
      const pages = [
        createTestPage(
          "1",
          "深層学習",
          createPlainTextContent("機械学習とニューラルネットワークを使った深層学習"),
        ),
        createTestPage("2", "機械学習", createPlainTextContent("入門書")),
      ];

      const results = searchPages(pages, "機械学習 ニューラル 深層");

      expect(results).toHaveLength(1);
      expect(results[0].page.id).toBe("1");
    });
  });

  describe("Match Type", () => {
    it("should identify exact_title match", () => {
      const pages = [createTestPage("1", "機械学習", createPlainTextContent("content"))];

      const results = searchPages(pages, "機械学習");

      expect(results[0].matchType).toBe("exact_title");
    });

    it("should identify title match", () => {
      const pages = [createTestPage("1", "機械学習入門", createPlainTextContent("別のコンテンツ"))];

      const results = searchPages(pages, "機械学習");

      expect(results[0].matchType).toBe("title");
    });

    it("should identify content match", () => {
      const pages = [createTestPage("1", "入門書", createPlainTextContent("機械学習について"))];

      const results = searchPages(pages, "機械学習");

      expect(results[0].matchType).toBe("content");
    });

    it("should identify both match", () => {
      const pages = [createTestPage("1", "機械学習入門", createPlainTextContent("機械学習の基礎"))];

      const results = searchPages(pages, "機械学習");

      expect(results[0].matchType).toBe("both");
    });
  });

  describe("Highlighted Text", () => {
    it("should highlight keywords in snippet", () => {
      const pages = [createTestPage("1", "Title", createPlainTextContent("機械学習は重要です"))];

      const results = searchPages(pages, "機械学習");

      expect(results[0].highlightedText).toContain("【機械学習】");
    });

    it("should highlight multiple keywords", () => {
      const pages = [
        createTestPage("1", "Title", createPlainTextContent("機械学習とニューラルネットワーク")),
      ];

      const results = searchPages(pages, "機械学習 ニューラル");

      expect(results[0].highlightedText).toContain("【機械学習】");
      expect(results[0].highlightedText).toContain("【ニューラル】");
    });
  });

  describe("Scoring and Sorting", () => {
    it("should sort by score (exact_title first)", () => {
      const pages = [
        createTestPage("1", "機械学習入門", createPlainTextContent("content")),
        createTestPage("2", "機械学習", createPlainTextContent("content")),
        createTestPage("3", "Title", createPlainTextContent("機械学習について")),
      ];

      const results = searchPages(pages, "機械学習");

      // exact_title (id:2) should be first
      expect(results[0].page.id).toBe("2");
      // title match (id:1) should be before content match (id:3)
      expect(results[1].page.id).toBe("1");
      expect(results[2].page.id).toBe("3");
    });

    it("should limit results to 10", () => {
      const pages = Array.from({ length: 15 }, (_, i) =>
        createTestPage(`${i}`, `Test Page ${i}`, createPlainTextContent("content")),
      );

      const results = searchPages(pages, "Test");

      expect(results).toHaveLength(10);
    });

    it("should give bonus to newer pages", () => {
      const now = Date.now();
      const pages = [
        createTestPage("1", "Test Page", createPlainTextContent("content"), {
          updatedAt: now - 30 * 24 * 60 * 60 * 1000, // 30 days ago
        }),
        createTestPage("2", "Test Page", createPlainTextContent("content"), {
          updatedAt: now, // now
        }),
      ];

      const results = searchPages(pages, "Test");

      // Newer page should have higher score
      expect(results[0].page.id).toBe("2");
    });
  });

  describe("Smart Snippet", () => {
    it("should extract meaningful snippet around keyword", () => {
      const longContent = createPlainTextContent(
        "最初の文章です。機械学習は人工知能の一分野であり、データから学習します。最後の文章です。",
      );
      const pages = [createTestPage("1", "Title", longContent)];

      const results = searchPages(pages, "機械学習");

      expect(results[0].matchedText).toContain("機械学習");
      // Should not just be the keyword
      expect(results[0].matchedText.length).toBeGreaterThan(10);
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty pages array", () => {
      const results = searchPages([], "test");
      expect(results).toEqual([]);
    });

    it("should handle pages with empty content", () => {
      const pages = [createTestPage("1", "Test Page", "")];

      const results = searchPages(pages, "Test");

      expect(results).toHaveLength(1);
    });

    it("should handle special regex characters in query", () => {
      const pages = [
        createTestPage("1", "Test Page", createPlainTextContent("content with (special) chars")),
      ];

      const results = searchPages(pages, "(special)");

      expect(results).toHaveLength(1);
      // highlightedText should contain the highlighted keyword
      expect(results[0].highlightedText).toContain("【(special)】");
    });
  });
});

/**
 * 共有検索のページ行を作るテストヘルパー。`kind="page"` を default で埋める。
 *
 * Test helper that builds a `kind="page"` row for the shared-search response.
 */
function createSharedRow(
  overrides: Partial<SearchPageResultRow> & Pick<SearchPageResultRow, "id">,
): SearchPageResultRow {
  return {
    kind: "page",
    id: overrides.id,
    note_id: "note-default" as string,
    owner_id: "u1",
    title: "shared",
    content_preview: "preview",
    thumbnail_url: null,
    source_url: null,
    updated_at: new Date().toISOString(),
    ...overrides,
  } as SearchPageResultRow;
}

/**
 * Issue #864: PDF ハイライト行を作るテストヘルパー。
 *
 * Issue #864: builds a `kind="pdf_highlight"` row for the shared-search response.
 */
function createHighlightRow(
  overrides: Partial<SearchPdfHighlightResultRow> &
    Pick<SearchPdfHighlightResultRow, "highlight_id">,
): SearchPdfHighlightResultRow {
  return {
    kind: "pdf_highlight",
    highlight_id: overrides.highlight_id,
    source_id: "src-1",
    owner_id: "u1",
    pdf_page: 1,
    text: "highlighted body",
    derived_page_id: null,
    source_display_name: "paper.pdf",
    source_title: null,
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function createPersonalPage(id: string, title: string): Page {
  const now = Date.now();
  return {
    id,
    ownerUserId: "u1",
    noteId: null,
    title,
    content: createPlainTextContent("body"),
    createdAt: now,
    updatedAt: now,
    isDeleted: false,
  };
}

describe("buildGlobalSearchResults", () => {
  /**
   * Issue #718 Phase 5-4 (Codex / CodeRabbit 指摘反映後):
   * dedup は `pageId` の集合一致でのみ行う。`note_id IS NULL` の shared 行は
   * IDB に無いリンク済み個人ページの場合があり、安易に落とすと検索結果から
   * 漏れる。
   *
   * Phase 5-4 dedup contract (post Codex/CodeRabbit fix): only drop shared
   * rows whose `pageId` is already in the personal IDB result set. Don't use
   * `note_id` as a proxy because linked personal pages reachable via note
   * membership/ownership can have `note_id IS NULL` and aren't in IDB.
   */
  describe("Issue #718 Phase 5-4: dedup", () => {
    it("drops shared rows that overlap by id with personal IDB results", () => {
      const query = "alpha";
      const keywords = parseSearchQuery(query);
      const personal: Page[] = [createPersonalPage("p1", "alpha")];
      const shared: SearchResultRow[] = [
        createSharedRow({ id: "p1", note_id: "note-1", title: "alpha" }),
        createSharedRow({ id: "p2", note_id: "note-1", title: "alpha note" }),
      ];

      const results = buildGlobalSearchResults(personal, shared, query, keywords);

      const ids = results
        .filter((r): r is Extract<GlobalSearchResultItem, { kind: "page" }> => r.kind === "page")
        .map((r) => r.pageId)
        .sort();
      // `p1` だけが personal 由来で 1 回、`p2` がノート由来で 1 回。
      // `p1` only appears once (personal), `p2` once (shared note-native).
      expect(ids).toEqual(["p1", "p2"]);
    });

    it("keeps note-native shared rows with noteId for canonical /notes/:noteId/:pageId routing", () => {
      const query = "alpha";
      const keywords = parseSearchQuery(query);
      const shared: SearchResultRow[] = [
        createSharedRow({ id: "p3", note_id: "note-9", title: "alpha shared" }),
      ];

      const results = buildGlobalSearchResults([], shared, query, keywords);

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        kind: "page",
        pageId: "p3",
        noteId: "note-9",
      });
    });

    it("does not over-drop when IDB has not loaded yet", () => {
      const query = "alpha";
      const keywords = parseSearchQuery(query);
      const shared: SearchResultRow[] = [
        createSharedRow({ id: "a", note_id: "n2", title: "alpha" }),
        createSharedRow({ id: "b", note_id: "n1", title: "alpha b" }),
      ];

      const results = buildGlobalSearchResults([], shared, query, keywords);

      const ids = results
        .filter((r): r is Extract<GlobalSearchResultItem, { kind: "page" }> => r.kind === "page")
        .map((r) => r.pageId)
        .sort();
      expect(ids).toEqual(["a", "b"]);
    });

    it("returns empty when query is shorter than 3 chars", () => {
      const query = "ab";
      const shared: SearchResultRow[] = [createSharedRow({ id: "p1", note_id: "n1" })];
      const results = buildGlobalSearchResults([], shared, query, parseSearchQuery(query));
      expect(results).toEqual([]);
    });
  });

  // ── Issue #864: PDF ハイライト統合 / PDF highlight integration ──────────────
  describe("Issue #864: PDF highlight integration", () => {
    it("includes pdf_highlight rows as kind='pdf_highlight' items with deep-link fields", () => {
      const query = "alpha";
      const keywords = parseSearchQuery(query);
      const shared: SearchResultRow[] = [
        createHighlightRow({
          highlight_id: "h-1",
          source_id: "src-100",
          pdf_page: 12,
          text: "alpha appears in this passage",
          derived_page_id: "derived-1",
        }),
      ];

      const results = buildGlobalSearchResults([], shared, query, keywords);

      expect(results).toHaveLength(1);
      const item = results[0];
      expect(item.kind).toBe("pdf_highlight");
      if (item.kind !== "pdf_highlight") throw new Error("type narrowing");
      expect(item).toMatchObject({
        highlightId: "h-1",
        sourceId: "src-100",
        pdfPage: 12,
        derivedPageId: "derived-1",
      });
      expect(item.highlightedText).toContain("【alpha】");
    });

    it("keeps the priority order: title > content > pdf_highlight body", () => {
      const query = "alpha";
      const keywords = parseSearchQuery(query);
      // title 一致のページ / content 一致のページ / pdf_highlight 行
      // Title match page / content match page / pdf highlight row.
      const personal: Page[] = [createPersonalPage("page-title", "alpha header")];
      const shared: SearchResultRow[] = [
        createSharedRow({
          id: "page-content",
          note_id: "n1",
          title: "shared note",
          content_preview: "this mentions alpha somewhere",
        }),
        createHighlightRow({
          highlight_id: "h-9",
          text: "alpha in PDF body",
        }),
      ];

      const results = buildGlobalSearchResults(personal, shared, query, keywords);

      expect(results).toHaveLength(3);
      expect(results[0]).toMatchObject({ kind: "page", pageId: "page-title" });
      // The shared content-match page should outrank the pdf_highlight row.
      // 共有のコンテンツ一致ページが PDF ハイライト行より上位に来る。
      expect(results[1]).toMatchObject({ kind: "page", pageId: "page-content" });
      expect(results[2]).toMatchObject({ kind: "pdf_highlight", highlightId: "h-9" });
    });

    it("does not dedup pdf_highlight rows against personal page ids (separate entity)", () => {
      const query = "alpha";
      const keywords = parseSearchQuery(query);
      // page id と highlight id が偶然同じ値でも、別エンティティなので両方残る。
      // Even when a personal page id collides with a highlight id, both
      // survive — highlights live in their own table.
      const personal: Page[] = [createPersonalPage("collision-id", "alpha title")];
      const shared: SearchResultRow[] = [
        createHighlightRow({ highlight_id: "collision-id", text: "alpha body" }),
      ];

      const results = buildGlobalSearchResults(personal, shared, query, keywords);

      expect(results).toHaveLength(2);
      expect(results.some((r) => r.kind === "page" && r.pageId === "collision-id")).toBe(true);
      expect(
        results.some((r) => r.kind === "pdf_highlight" && r.highlightId === "collision-id"),
      ).toBe(true);
    });
  });
});

describe("buildPdfHighlightItem", () => {
  it("builds a UI item with display name, page number, and highlighted text", () => {
    const row = createHighlightRow({
      highlight_id: "h-42",
      source_id: "src-42",
      pdf_page: 7,
      text: "the quick brown alpha jumps",
      source_display_name: "spec.pdf",
    });
    const item = buildPdfHighlightItem(row, ["alpha"]);

    expect(item).toMatchObject({
      kind: "pdf_highlight",
      highlightId: "h-42",
      sourceId: "src-42",
      pdfPage: 7,
      sourceDisplayName: "spec.pdf",
      score: PDF_HIGHLIGHT_BASE_SCORE,
    });
    expect(item.highlightedText).toContain("【alpha】");
    // タイトルにファイル名とページ番号が含まれる。
    // Title includes both the file name and the page number.
    expect(item.title).toContain("spec.pdf");
    expect(item.title).toContain("7");
  });

  it("falls back to PDF title when display name is missing", () => {
    const row = createHighlightRow({
      highlight_id: "h-43",
      source_display_name: null,
      source_title: "From PDF Metadata",
    });
    const item = buildPdfHighlightItem(row, ["body"]);
    expect(item.sourceDisplayName).toBe("From PDF Metadata");
  });
});

/**
 * PR #873 review (Gemini): ヘッダードロップダウン (`buildPdfHighlightItem`) と
 * フル検索画面 (`SearchResults.tsx`) で同じ i18n / snippet 整形ロジックを共有することを
 * 単独でテストする。Translator 関数を差し替えられるので、デフォルト値の fallback と
 * snippet 長の上書きを直接アサートできる。
 *
 * PR #873 review (Gemini): exercises the shared formatter used by both the
 * header dropdown (`buildPdfHighlightItem`) and the full search page
 * (`SearchResults.tsx`). The translator is injected, so the fallback path and
 * the snippet-length override can be asserted without spinning up i18next.
 */
describe("formatPdfHighlightDisplay", () => {
  const passthroughTranslator = (key: string, options?: Record<string, unknown>) => {
    if (key === "common.pdfHighlightFallbackName")
      return (options?.defaultValue as string) ?? "PDF";
    if (key === "common.pdfHighlightResultTitle") {
      const file = options?.file as string;
      const page = options?.page as number;
      return `${file} (p.${page})`;
    }
    return key;
  };

  it("returns a title combining display name and page number", () => {
    const row = createHighlightRow({
      highlight_id: "h-1",
      source_display_name: "paper.pdf",
      pdf_page: 9,
      text: "alpha keyword text",
    });

    const result = formatPdfHighlightDisplay(row, ["alpha"], passthroughTranslator);

    expect(result.title).toBe("paper.pdf (p.9)");
    expect(result.displayName).toBe("paper.pdf");
    expect(result.highlightedText).toContain("【alpha】");
  });

  it("falls back to the i18n placeholder when both display name and PDF title are missing", () => {
    const row = createHighlightRow({
      highlight_id: "h-2",
      source_display_name: null,
      source_title: null,
    });

    const result = formatPdfHighlightDisplay(row, ["body"], passthroughTranslator);

    expect(result.displayName).toBe("PDF");
    expect(result.title).toBe("PDF (p.1)");
  });

  it("forwards the snippet length override to extractSmartSnippet (used by the full search page)", () => {
    // キーワードが見つからない長文では `maxLength` がそのまま境界として効くので、
    // 短尺 / 長尺の指定で snippet 長が変わることを観察できる。
    // When the keyword is absent, `extractSmartSnippet` truncates at `maxLength`
    // directly, so the override is observable as a snippet-length change.
    const longText = "padding ".repeat(60).trim();
    const row = createHighlightRow({ highlight_id: "h-3", text: longText });

    const short = formatPdfHighlightDisplay(row, ["nomatch"], passthroughTranslator, 50);
    const long = formatPdfHighlightDisplay(row, ["nomatch"], passthroughTranslator, 200);

    expect(short.snippet.length).toBeLessThan(long.snippet.length);
    expect(long.snippet.length).toBeGreaterThan(50);
  });
});

describe("dedupSharedRowsAgainstPersonal (Issue #718 Phase 5-4)", () => {
  it("drops rows whose id is in the personal id set", () => {
    const rows: SearchResultRow[] = [
      createSharedRow({ id: "p1", note_id: "n2" }),
      createSharedRow({ id: "p2", note_id: "n1" }),
      createSharedRow({ id: "p3", note_id: "n3" }),
    ];
    const personalIds = new Set(["p1"]);

    const filtered = dedupSharedRowsAgainstPersonal(rows, personalIds);

    expect(
      filtered
        .filter((r): r is SearchPageResultRow => r.kind === "page")
        .map((r) => r.id)
        .sort(),
    ).toEqual(["p2", "p3"]);
  });

  it("keeps every row when the personal id set is empty (IDB not hydrated)", () => {
    const rows: SearchResultRow[] = [
      createSharedRow({ id: "p1", note_id: "n1" }),
      createSharedRow({ id: "p2", note_id: "n2" }),
    ];
    const filtered = dedupSharedRowsAgainstPersonal(rows, new Set());
    expect(filtered).toHaveLength(2);
  });

  it("handles empty input", () => {
    expect(dedupSharedRowsAgainstPersonal([], new Set(["p1"]))).toEqual([]);
  });

  // Issue #864: pdf_highlight 行は別エンティティなので、page id とぶつかっても落とさない。
  // Issue #864: highlight rows live in a separate table; never dropped by page-id dedup.
  it("never drops pdf_highlight rows by id collision with personal pages", () => {
    const rows: SearchResultRow[] = [
      createSharedRow({ id: "shared-page", note_id: "n1" }),
      createHighlightRow({ highlight_id: "shared-page", text: "body" }),
    ];
    const personalIds = new Set(["shared-page"]);

    const filtered = dedupSharedRowsAgainstPersonal(rows, personalIds);

    expect(filtered).toHaveLength(1);
    expect(filtered[0].kind).toBe("pdf_highlight");
  });
});
