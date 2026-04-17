/**
 * indexBuilder 純関数のユニットテスト。
 * Unit tests for the pure helpers in indexBuilder.
 */
import { describe, it, expect } from "vitest";
import {
  buildIndexFromPages,
  categoryLabelFor,
  compareCategoryLabels,
  renderIndexMarkdown,
  INDEX_PAGE_TITLE,
} from "../../services/indexBuilder.js";

describe("categoryLabelFor", () => {
  it("returns (無題 / Untitled) for null, undefined, and whitespace-only", () => {
    expect(categoryLabelFor(null)).toBe("(無題 / Untitled)");
    expect(categoryLabelFor(undefined)).toBe("(無題 / Untitled)");
    expect(categoryLabelFor("   ")).toBe("(無題 / Untitled)");
  });

  it("returns upper-cased first ASCII letter", () => {
    expect(categoryLabelFor("apple")).toBe("A");
    expect(categoryLabelFor("Zebra")).toBe("Z");
    expect(categoryLabelFor("wiki")).toBe("W");
  });

  it("returns 0-9 for digit-leading titles", () => {
    expect(categoryLabelFor("2025 年のまとめ")).toBe("0-9");
    expect(categoryLabelFor("100 things")).toBe("0-9");
  });

  it("returns 日本語 for Japanese leading character", () => {
    expect(categoryLabelFor("日本の歴史")).toBe("日本語");
    expect(categoryLabelFor("あいさつ")).toBe("日本語");
    expect(categoryLabelFor("カメラ")).toBe("日本語");
  });

  it("returns その他 / Other for symbols or emoji", () => {
    expect(categoryLabelFor("#hashtag")).toBe("その他 / Other");
    expect(categoryLabelFor("🔥 burns")).toBe("その他 / Other");
  });
});

describe("compareCategoryLabels", () => {
  it("orders digits before letters, letters before Japanese, Japanese before Other", () => {
    const labels = ["日本語", "A", "0-9", "その他 / Other", "Z"];
    const sorted = [...labels].sort(compareCategoryLabels);
    expect(sorted).toEqual(["0-9", "A", "Z", "日本語", "その他 / Other"]);
  });

  it("places (無題 / Untitled) last", () => {
    const labels = ["(無題 / Untitled)", "A", "日本語"];
    const sorted = [...labels].sort(compareCategoryLabels);
    expect(sorted[sorted.length - 1]).toBe("(無題 / Untitled)");
  });
});

describe("buildIndexFromPages", () => {
  const FIXED_NOW = new Date("2026-04-17T10:00:00Z");

  it("groups pages by first-letter category with stable ordering", () => {
    const doc = buildIndexFromPages(
      [
        { id: "p1", title: "Alpha", updatedAt: FIXED_NOW },
        { id: "p2", title: "beta", updatedAt: FIXED_NOW },
        { id: "p3", title: "猫のページ", updatedAt: FIXED_NOW },
        { id: "p4", title: "2025 review", updatedAt: FIXED_NOW },
      ],
      FIXED_NOW,
    );
    expect(doc.totalPages).toBe(4);
    expect(doc.categories.map((c) => c.label)).toEqual(["0-9", "A", "B", "日本語"]);
    expect(doc.generatedAt).toBe(FIXED_NOW.toISOString());
  });

  it("sorts entries within a category by title (locale ja)", () => {
    const doc = buildIndexFromPages(
      [
        { id: "p1", title: "Banana", updatedAt: FIXED_NOW },
        { id: "p2", title: "Apple", updatedAt: FIXED_NOW },
        { id: "p3", title: "apricot", updatedAt: FIXED_NOW },
      ],
      FIXED_NOW,
    );
    const aCat = doc.categories.find((c) => c.label === "A");
    expect(aCat).toBeDefined();
    expect(aCat?.entries.map((e) => e.title)).toEqual(["Apple", "apricot"]);
  });

  it("accepts ISO-string updatedAt and passes it through", () => {
    const iso = "2026-04-01T00:00:00.000Z";
    const doc = buildIndexFromPages([{ id: "p1", title: "Alpha", updatedAt: iso }], FIXED_NOW);
    expect(doc.categories[0]?.entries[0]?.updatedAt).toBe(iso);
  });

  it("produces markdown that includes category headings and wiki links", () => {
    const doc = buildIndexFromPages(
      [{ id: "p1", title: "Alpha", updatedAt: FIXED_NOW }],
      FIXED_NOW,
    );
    expect(doc.markdown).toContain("# Wiki Index");
    expect(doc.markdown).toContain("## A");
    expect(doc.markdown).toContain("[[Alpha]]");
  });
});

describe("renderIndexMarkdown", () => {
  it("produces the empty-state hint when no categories", () => {
    const md = renderIndexMarkdown([], "2026-04-17T00:00:00Z");
    expect(md).toContain("まだページがありません");
  });
});

describe("INDEX_PAGE_TITLE", () => {
  it("equals the expected special kind identifier", () => {
    expect(INDEX_PAGE_TITLE).toBe("__index__");
  });
});
