import { describe, it, expect } from "vitest";
import { resolveSearchResultUrl } from "./GlobalSearchContext";
import type { GlobalSearchResultItem } from "@/hooks/search/useGlobalSearch";

/**
 * Issue #889 Phase 3 受け入れ基準: Phase 3 で `/pages/:id` を撤去し、
 * 全ページ結果が `/notes/:noteId/:pageId` に統合された。
 *
 * Issue #889 Phase 3 acceptance criteria: `/pages/:id` was retired and every
 * page result routes to `/notes/:noteId/:pageId`.
 */
describe("resolveSearchResultUrl (Issue #889 Phase 3)", () => {
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
});
