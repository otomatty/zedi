import { describe, it, expect } from "vitest";
import {
  calculateLinkedPages,
  pageToCard,
  type LinkedPagesData,
} from "./useLinkedPages";
import type { Page } from "@/types/page";
import {
  createWikiLinkContent,
  createPlainTextContent,
} from "@/test/testDatabase";

// Helper to create a test page
function createTestPage(
  id: string,
  title: string,
  content: string,
  options?: Partial<Page>
): Page {
  const now = Date.now();
  return {
    id,
    title,
    content,
    createdAt: now,
    updatedAt: now,
    isDeleted: false,
    ...options,
  };
}

describe("pageToCard", () => {
  it("should convert Page to PageCard", () => {
    const page = createTestPage(
      "page-1",
      "Test Page",
      createPlainTextContent("This is test content")
    );

    const card = pageToCard(page);

    expect(card.id).toBe("page-1");
    expect(card.title).toBe("Test Page");
    expect(card.preview).toBe("This is test content");
    expect(card.updatedAt).toBe(page.updatedAt);
    expect(card.sourceUrl).toBeUndefined();
  });

  it("should include sourceUrl for web clipped pages", () => {
    const page = createTestPage(
      "page-1",
      "Web Article",
      createPlainTextContent("Article content"),
      { sourceUrl: "https://example.com/article" }
    );

    const card = pageToCard(page);

    expect(card.sourceUrl).toBe("https://example.com/article");
  });

  it("should truncate long preview text", () => {
    const longText = "A".repeat(100);
    const page = createTestPage(
      "page-1",
      "Long Content",
      createPlainTextContent(longText)
    );

    const card = pageToCard(page);

    expect(card.preview.length).toBeLessThanOrEqual(53); // 50 + "..."
  });
});

describe("calculateLinkedPages", () => {
  describe("Outgoing Links", () => {
    it("should extract outgoing links from WikiLinks in content", () => {
      const currentPage = createTestPage(
        "current",
        "Current Page",
        createWikiLinkContent(["Page A", "Page B"])
      );

      // Pages without children go to outgoingLinks
      const pageA = createTestPage(
        "page-a",
        "Page A",
        createPlainTextContent("Content A")
      );
      const pageB = createTestPage(
        "page-b",
        "Page B",
        createPlainTextContent("Content B")
      );

      const result = calculateLinkedPages({
        currentPage,
        pageId: "current",
        allPages: [currentPage, pageA, pageB],
        backlinkIds: [],
      });

      // Both pages have no children, so they go to outgoingLinks
      expect(result.outgoingLinks).toHaveLength(2);
      expect(result.outgoingLinks.map((l) => l.id)).toContain("page-a");
      expect(result.outgoingLinks.map((l) => l.id)).toContain("page-b");
      expect(result.outgoingLinksWithChildren).toHaveLength(0);
    });

    it("should exclude self-links", () => {
      const currentPage = createTestPage(
        "current",
        "Current Page",
        createWikiLinkContent(["Current Page", "Page A"])
      );

      const pageA = createTestPage(
        "page-a",
        "Page A",
        createPlainTextContent("Content A")
      );

      const result = calculateLinkedPages({
        currentPage,
        pageId: "current",
        allPages: [currentPage, pageA],
        backlinkIds: [],
      });

      expect(result.outgoingLinks).toHaveLength(1);
      expect(result.outgoingLinks[0].id).toBe("page-a");
    });

    it("should handle case-insensitive title matching", () => {
      const currentPage = createTestPage(
        "current",
        "Current Page",
        createWikiLinkContent(["PAGE A", "page b"])
      );

      const pageA = createTestPage(
        "page-a",
        "Page A",
        createPlainTextContent("Content A")
      );
      const pageB = createTestPage(
        "page-b",
        "Page B",
        createPlainTextContent("Content B")
      );

      const result = calculateLinkedPages({
        currentPage,
        pageId: "current",
        allPages: [currentPage, pageA, pageB],
        backlinkIds: [],
      });

      expect(result.outgoingLinks).toHaveLength(2);
    });

    it("should limit outgoing links without children to 10", () => {
      const links = Array.from({ length: 15 }, (_, i) => `Page ${i}`);
      const currentPage = createTestPage(
        "current",
        "Current Page",
        createWikiLinkContent(links)
      );

      const allPages = [
        currentPage,
        ...links.map((title, i) =>
          createTestPage(`page-${i}`, title, createPlainTextContent(`Content ${i}`))
        ),
      ];

      const result = calculateLinkedPages({
        currentPage,
        pageId: "current",
        allPages,
        backlinkIds: [],
      });

      expect(result.outgoingLinks).toHaveLength(10);
    });
  });

  describe("Ghost Links", () => {
    it("should identify non-existing links as ghost links", () => {
      const currentPage = createTestPage(
        "current",
        "Current Page",
        createWikiLinkContent(["Existing Page", "Non Existing Page"])
      );

      const existingPage = createTestPage(
        "existing",
        "Existing Page",
        createPlainTextContent("Content")
      );

      const result = calculateLinkedPages({
        currentPage,
        pageId: "current",
        allPages: [currentPage, existingPage],
        backlinkIds: [],
      });

      expect(result.outgoingLinks).toHaveLength(1);
      expect(result.ghostLinks).toHaveLength(1);
      expect(result.ghostLinks[0]).toBe("Non Existing Page");
    });

    it("should limit ghost links to 5", () => {
      const links = Array.from({ length: 10 }, (_, i) => `Ghost ${i}`);
      const currentPage = createTestPage(
        "current",
        "Current Page",
        createWikiLinkContent(links)
      );

      const result = calculateLinkedPages({
        currentPage,
        pageId: "current",
        allPages: [currentPage],
        backlinkIds: [],
      });

      expect(result.ghostLinks).toHaveLength(5);
    });
  });

  describe("Backlinks", () => {
    it("should return backlinks from provided backlink IDs", () => {
      const currentPage = createTestPage(
        "current",
        "Current Page",
        createPlainTextContent("Content")
      );

      const backlinkPage1 = createTestPage(
        "backlink-1",
        "Backlink Page 1",
        createPlainTextContent("Content 1")
      );
      const backlinkPage2 = createTestPage(
        "backlink-2",
        "Backlink Page 2",
        createPlainTextContent("Content 2")
      );

      const result = calculateLinkedPages({
        currentPage,
        pageId: "current",
        allPages: [currentPage, backlinkPage1, backlinkPage2],
        backlinkIds: ["backlink-1", "backlink-2"],
      });

      expect(result.backlinks).toHaveLength(2);
      expect(result.backlinks.map((l) => l.id)).toContain("backlink-1");
      expect(result.backlinks.map((l) => l.id)).toContain("backlink-2");
    });

    it("should exclude deleted pages from backlinks", () => {
      const currentPage = createTestPage(
        "current",
        "Current Page",
        createPlainTextContent("Content")
      );

      const activePage = createTestPage(
        "active",
        "Active Page",
        createPlainTextContent("Active content")
      );
      const deletedPage = createTestPage(
        "deleted",
        "Deleted Page",
        createPlainTextContent("Deleted content"),
        { isDeleted: true }
      );

      const result = calculateLinkedPages({
        currentPage,
        pageId: "current",
        allPages: [currentPage, activePage, deletedPage],
        backlinkIds: ["active", "deleted"],
      });

      expect(result.backlinks).toHaveLength(1);
      expect(result.backlinks[0].id).toBe("active");
    });

    it("should limit backlinks to 10", () => {
      const currentPage = createTestPage(
        "current",
        "Current Page",
        createPlainTextContent("Content")
      );

      const backlinkPages = Array.from({ length: 15 }, (_, i) =>
        createTestPage(`backlink-${i}`, `Backlink ${i}`, createPlainTextContent(`Content ${i}`))
      );

      const result = calculateLinkedPages({
        currentPage,
        pageId: "current",
        allPages: [currentPage, ...backlinkPages],
        backlinkIds: backlinkPages.map((p) => p.id),
      });

      expect(result.backlinks).toHaveLength(10);
    });
  });

  describe("2-hop Links and outgoingLinksWithChildren", () => {
    it("should group outgoing links with their children", () => {
      // Current -> Page A -> Page B (2-hop)
      const currentPage = createTestPage(
        "current",
        "Current Page",
        createWikiLinkContent(["Page A"])
      );

      const pageA = createTestPage(
        "page-a",
        "Page A",
        createWikiLinkContent(["Page B"])
      );

      const pageB = createTestPage(
        "page-b",
        "Page B",
        createPlainTextContent("Content B")
      );

      const result = calculateLinkedPages({
        currentPage,
        pageId: "current",
        allPages: [currentPage, pageA, pageB],
        backlinkIds: [],
      });

      // Page A has children, so it goes to outgoingLinksWithChildren
      expect(result.outgoingLinks).toHaveLength(0);
      expect(result.outgoingLinksWithChildren).toHaveLength(1);
      expect(result.outgoingLinksWithChildren[0].source.id).toBe("page-a");
      expect(result.outgoingLinksWithChildren[0].children).toHaveLength(1);
      expect(result.outgoingLinksWithChildren[0].children[0].id).toBe("page-b");

      // twoHopLinks still maintained for backward compatibility
      expect(result.twoHopLinks).toHaveLength(1);
      expect(result.twoHopLinks[0].id).toBe("page-b");
    });

    it("should exclude current page from 2-hop links", () => {
      // Current -> Page A -> Current (should not appear in 2-hop)
      const currentPage = createTestPage(
        "current",
        "Current Page",
        createWikiLinkContent(["Page A"])
      );

      const pageA = createTestPage(
        "page-a",
        "Page A",
        createWikiLinkContent(["Current Page"])
      );

      const result = calculateLinkedPages({
        currentPage,
        pageId: "current",
        allPages: [currentPage, pageA],
        backlinkIds: [],
      });

      // Page A has no valid children (only links to current), so goes to outgoingLinks
      expect(result.outgoingLinks).toHaveLength(1);
      expect(result.outgoingLinksWithChildren).toHaveLength(0);
      expect(result.twoHopLinks).toHaveLength(0);
    });

    it("should exclude outgoing links from 2-hop links (no duplicates)", () => {
      // Current -> Page A, Page B
      // Page A -> Page B (Page B should not appear in 2-hop since it's already outgoing)
      const currentPage = createTestPage(
        "current",
        "Current Page",
        createWikiLinkContent(["Page A", "Page B"])
      );

      const pageA = createTestPage(
        "page-a",
        "Page A",
        createWikiLinkContent(["Page B"])
      );

      const pageB = createTestPage(
        "page-b",
        "Page B",
        createPlainTextContent("Content B")
      );

      const result = calculateLinkedPages({
        currentPage,
        pageId: "current",
        allPages: [currentPage, pageA, pageB],
        backlinkIds: [],
      });

      // Page A links to Page B which is already an outgoing link, so no children
      // Page B has no children
      expect(result.outgoingLinks).toHaveLength(2);
      expect(result.outgoingLinksWithChildren).toHaveLength(0);
      expect(result.twoHopLinks).toHaveLength(0);
    });

    it("should deduplicate 2-hop links across sources", () => {
      // Current -> Page A, Page B
      // Page A -> Page C
      // Page B -> Page C (Page C should appear in both sources' children but once in twoHopLinks)
      const currentPage = createTestPage(
        "current",
        "Current Page",
        createWikiLinkContent(["Page A", "Page B"])
      );

      const pageA = createTestPage(
        "page-a",
        "Page A",
        createWikiLinkContent(["Page C"])
      );

      const pageB = createTestPage(
        "page-b",
        "Page B",
        createWikiLinkContent(["Page C"])
      );

      const pageC = createTestPage(
        "page-c",
        "Page C",
        createPlainTextContent("Content C")
      );

      const result = calculateLinkedPages({
        currentPage,
        pageId: "current",
        allPages: [currentPage, pageA, pageB, pageC],
        backlinkIds: [],
      });

      // Both Page A and Page B have children
      expect(result.outgoingLinksWithChildren).toHaveLength(2);
      expect(result.outgoingLinksWithChildren[0].children[0].id).toBe("page-c");
      expect(result.outgoingLinksWithChildren[1].children[0].id).toBe("page-c");

      // Global twoHopLinks should be deduplicated
      expect(result.twoHopLinks).toHaveLength(1);
      expect(result.twoHopLinks[0].id).toBe("page-c");
    });

    it("should limit children per source to 5", () => {
      const currentPage = createTestPage(
        "current",
        "Current Page",
        createWikiLinkContent(["Page A"])
      );

      const childTitles = Array.from({ length: 10 }, (_, i) => `Child ${i}`);
      const pageA = createTestPage(
        "page-a",
        "Page A",
        createWikiLinkContent(childTitles)
      );

      const childPages = childTitles.map((title, i) =>
        createTestPage(`child-${i}`, title, createPlainTextContent(`Content ${i}`))
      );

      const result = calculateLinkedPages({
        currentPage,
        pageId: "current",
        allPages: [currentPage, pageA, ...childPages],
        backlinkIds: [],
      });

      expect(result.outgoingLinksWithChildren).toHaveLength(1);
      expect(result.outgoingLinksWithChildren[0].children).toHaveLength(5);
    });

    it("should limit 2-hop links to 10", () => {
      const currentPage = createTestPage(
        "current",
        "Current Page",
        createWikiLinkContent(["Page A"])
      );

      const twoHopTitles = Array.from({ length: 15 }, (_, i) => `TwoHop ${i}`);
      const pageA = createTestPage(
        "page-a",
        "Page A",
        createWikiLinkContent(twoHopTitles)
      );

      const twoHopPages = twoHopTitles.map((title, i) =>
        createTestPage(`twohop-${i}`, title, createPlainTextContent(`Content ${i}`))
      );

      const result = calculateLinkedPages({
        currentPage,
        pageId: "current",
        allPages: [currentPage, pageA, ...twoHopPages],
        backlinkIds: [],
      });

      expect(result.twoHopLinks).toHaveLength(10);
    });
  });

  describe("Edge Cases", () => {
    it("should handle page with no links", () => {
      const currentPage = createTestPage(
        "current",
        "Current Page",
        createPlainTextContent("No links here")
      );

      const result = calculateLinkedPages({
        currentPage,
        pageId: "current",
        allPages: [currentPage],
        backlinkIds: [],
      });

      expect(result.outgoingLinks).toHaveLength(0);
      expect(result.outgoingLinksWithChildren).toHaveLength(0);
      expect(result.backlinks).toHaveLength(0);
      expect(result.twoHopLinks).toHaveLength(0);
      expect(result.ghostLinks).toHaveLength(0);
    });

    it("should handle empty content", () => {
      const currentPage = createTestPage("current", "Current Page", "");

      const result = calculateLinkedPages({
        currentPage,
        pageId: "current",
        allPages: [currentPage],
        backlinkIds: [],
      });

      expect(result.outgoingLinks).toHaveLength(0);
      expect(result.outgoingLinksWithChildren).toHaveLength(0);
      expect(result.ghostLinks).toHaveLength(0);
    });

    it("should handle circular links", () => {
      // Current -> Page A -> Page B -> Current
      const currentPage = createTestPage(
        "current",
        "Current Page",
        createWikiLinkContent(["Page A"])
      );

      const pageA = createTestPage(
        "page-a",
        "Page A",
        createWikiLinkContent(["Page B"])
      );

      const pageB = createTestPage(
        "page-b",
        "Page B",
        createWikiLinkContent(["Current Page"])
      );

      const result = calculateLinkedPages({
        currentPage,
        pageId: "current",
        allPages: [currentPage, pageA, pageB],
        backlinkIds: [],
      });

      // Page A has Page B as child
      expect(result.outgoingLinksWithChildren).toHaveLength(1);
      expect(result.outgoingLinksWithChildren[0].source.id).toBe("page-a");
      expect(result.outgoingLinksWithChildren[0].children[0].id).toBe("page-b");

      expect(result.twoHopLinks).toHaveLength(1);
      expect(result.twoHopLinks[0].id).toBe("page-b");
      // Current page should not appear in 2-hop (Page B -> Current is excluded)
    });
  });
});
