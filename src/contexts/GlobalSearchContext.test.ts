import { describe, it, expect } from "vitest";
import { resolveSearchResultUrl } from "./GlobalSearchContext";
import type { GlobalSearchResultItem } from "@/hooks/useGlobalSearch";

/**
 * Issue #864 受け入れ基準: 検索結果クリック時の URL 組み立てが種別ごとに正しく
 * 行われることを保証する。
 *
 * Issue #864 acceptance criteria: URL composition branches correctly on
 * `kind`. Personal/page/note rows stay on the existing routes; highlight rows
 * prefer the derived Zedi page when available and otherwise deep-link into
 * the PDF viewer with a `#page=N` hash.
 */
describe("resolveSearchResultUrl (Issue #864)", () => {
  it("routes personal page rows to /pages/:pageId", () => {
    const item: GlobalSearchResultItem = {
      kind: "page",
      pageId: "p-1",
      title: "Personal",
      highlightedText: "x",
      matchType: "content",
    };
    expect(resolveSearchResultUrl(item)).toBe("/pages/p-1");
  });

  it("routes shared note rows to /notes/:noteId/:pageId", () => {
    const item: GlobalSearchResultItem = {
      kind: "page",
      pageId: "p-2",
      noteId: "n-9",
      title: "Shared",
      highlightedText: "x",
      matchType: "content",
    };
    expect(resolveSearchResultUrl(item)).toBe("/notes/n-9/p-2");
  });

  it("prefers the derived Zedi page when a pdf_highlight has one", () => {
    const item: GlobalSearchResultItem = {
      kind: "pdf_highlight",
      highlightId: "h-1",
      sourceId: "src-1",
      sourceDisplayName: "doc.pdf",
      pdfPage: 5,
      derivedPageId: "derived-1",
      title: "doc.pdf (p.5)",
      highlightedText: "x",
      matchType: "content",
    };
    expect(resolveSearchResultUrl(item)).toBe("/pages/derived-1");
  });

  it("deep-links into the PDF viewer when no derived page exists", () => {
    const item: GlobalSearchResultItem = {
      kind: "pdf_highlight",
      highlightId: "h-2",
      sourceId: "src-2",
      sourceDisplayName: "spec.pdf",
      pdfPage: 12,
      derivedPageId: null,
      title: "spec.pdf (p.12)",
      highlightedText: "x",
      matchType: "content",
    };
    expect(resolveSearchResultUrl(item)).toBe("/sources/src-2/pdf#page=12");
  });
});
