import { describe, it, expect } from "vitest";
import {
  searchPages,
  buildGlobalSearchResults,
  dedupSharedRowsAgainstPersonal,
  type GlobalSearchResultItem,
} from "@/hooks/search/useGlobalSearch";
import type { Page } from "@/types/page";
import type { SearchPageResultRow, SearchResultRow } from "@/lib/api/types";
import { createPlainTextContent } from "@/test/testDatabase";
import { parseSearchQuery } from "@/lib/searchUtils";

// Helper to create a test page
function createTestPage(id: string, title: string, content: string, options?: Partial<Page>): Page {
  const now = Date.now();
  return {
    id,
    ownerUserId: "test-user",
    noteId: "default-note",
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

function createPersonalPage(id: string, title: string): Page {
  const now = Date.now();
  return {
    id,
    ownerUserId: "u1",
    noteId: "default-note",
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
});
