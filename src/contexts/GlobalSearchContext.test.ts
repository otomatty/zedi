import { describe, it, expect } from "vitest";
import { resolveSearchResultUrl } from "./GlobalSearchContext";
import type { GlobalSearchResultItem } from "@/hooks/useGlobalSearch";

/**
 * Issue #864 / #889 Phase 3 受け入れ基準: 検索結果クリック時の URL 組み立てが
 * 種別ごとに正しく行われることを保証する。Phase 3 で `/pages/:id` を撤去し、
 * 全ページ結果が `/notes/:noteId/:pageId` に統合された。
 *
 * Issue #864 / #889 Phase 3 acceptance criteria: URL composition branches
 * correctly on `kind`. Phase 3 retired `/pages/:id` and consolidated every
 * page result onto `/notes/:noteId/:pageId`.
 */
describe("resolveSearchResultUrl (Issue #864 / #889 Phase 3)", () => {
  it("routes personal page rows to /notes/:noteId/:pageId using their own note", () => {
    const item: GlobalSearchResultItem = {
      kind: "page",
      pageId: "p-1",
      noteId: "default-note",
      title: "Personal",
      highlightedText: "x",
      matchType: "content",
    };
    expect(resolveSearchResultUrl(item)).toBe("/notes/default-note/p-1");
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

  it("prefers the derived Zedi page (note-scoped) when a pdf_highlight has one", () => {
    const item: GlobalSearchResultItem = {
      kind: "pdf_highlight",
      highlightId: "h-1",
      sourceId: "src-1",
      sourceDisplayName: "doc.pdf",
      pdfPage: 5,
      derivedPageId: "derived-1",
      derivedPageNoteId: "note-derived",
      title: "doc.pdf (p.5)",
      highlightedText: "x",
      matchType: "content",
    };
    expect(resolveSearchResultUrl(item)).toBe("/notes/note-derived/derived-1");
  });

  it("deep-links into the PDF viewer when no derived page exists", () => {
    const item: GlobalSearchResultItem = {
      kind: "pdf_highlight",
      highlightId: "h-2",
      sourceId: "src-2",
      sourceDisplayName: "spec.pdf",
      pdfPage: 12,
      derivedPageId: null,
      derivedPageNoteId: null,
      title: "spec.pdf (p.12)",
      highlightedText: "x",
      matchType: "content",
    };
    expect(resolveSearchResultUrl(item)).toBe("/sources/src-2/pdf#page=12");
  });
});
