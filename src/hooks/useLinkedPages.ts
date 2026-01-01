import { useQuery } from "@tanstack/react-query";
import { useRepository, usePage, pageKeys } from "./usePageQueries";
import {
  extractWikiLinksFromContent,
  getUniqueWikiLinkTitles,
} from "@/lib/wikiLinkUtils";
import { getContentPreview } from "@/lib/contentUtils";
import type { Page } from "@/types/page";

/**
 * Card data for linked pages display
 */
export interface PageCard {
  id: string;
  title: string;
  preview: string; // Content preview (50 chars)
  updatedAt: number;
  sourceUrl?: string;
}

/**
 * Data structure for linked pages
 */
export interface LinkedPagesData {
  outgoingLinks: PageCard[]; // Pages linked from this page
  backlinks: PageCard[]; // Pages linking to this page
  twoHopLinks: PageCard[]; // 2-hop links (links from linked pages)
  ghostLinks: string[]; // Non-existing link targets
}

/**
 * Input data for calculating linked pages
 */
export interface CalculateLinkedPagesInput {
  currentPage: Page;
  pageId: string;
  allPages: Page[];
  backlinkIds: string[];
}

/**
 * Convert Page to PageCard
 */
export function pageToCard(page: Page): PageCard {
  return {
    id: page.id,
    title: page.title,
    preview: getContentPreview(page.content, 50),
    updatedAt: page.updatedAt,
    sourceUrl: page.sourceUrl,
  };
}

/**
 * Pure function to calculate linked pages data
 * This is extracted for easier testing
 */
export function calculateLinkedPages(
  input: CalculateLinkedPagesInput
): LinkedPagesData {
  const { currentPage, pageId, allPages, backlinkIds } = input;

  // 1. Extract WikiLinks from current page content
  const wikiLinks = extractWikiLinksFromContent(currentPage.content);
  const linkTitles = getUniqueWikiLinkTitles(wikiLinks);

  // 2. Create page mappings
  const pageByTitle = new Map(
    allPages.map((p) => [p.title.toLowerCase().trim(), p])
  );
  const pageById = new Map(allPages.map((p) => [p.id, p]));

  // 3. Outgoing Links (existing pages only)
  const outgoingLinks: PageCard[] = [];
  const ghostLinks: string[] = [];

  for (const title of linkTitles) {
    const targetPage = pageByTitle.get(title.toLowerCase().trim());
    if (targetPage && targetPage.id !== pageId) {
      outgoingLinks.push(pageToCard(targetPage));
    } else if (!targetPage) {
      ghostLinks.push(title);
    }
  }

  // 4. Backlinks (from links table)
  const backlinks: PageCard[] = backlinkIds
    .map((id) => pageById.get(id))
    .filter((p): p is Page => p !== undefined && !p.isDeleted)
    .map(pageToCard);

  // 5. 2-hop Links (outgoing links from linked pages)
  const twoHopSet = new Set<string>();
  const twoHopLinks: PageCard[] = [];
  const outgoingIds = new Set(outgoingLinks.map((o) => o.id));

  for (const outgoing of outgoingLinks) {
    const outgoingPage = pageById.get(outgoing.id);
    if (!outgoingPage) continue;

    const secondaryLinks = extractWikiLinksFromContent(outgoingPage.content);
    for (const link of secondaryLinks) {
      const targetPage = pageByTitle.get(link.title.toLowerCase().trim());
      if (
        targetPage &&
        targetPage.id !== pageId &&
        !twoHopSet.has(targetPage.id) &&
        !outgoingIds.has(targetPage.id)
      ) {
        twoHopSet.add(targetPage.id);
        twoHopLinks.push(pageToCard(targetPage));
      }
    }
  }

  return {
    outgoingLinks: outgoingLinks.slice(0, 10),
    backlinks: backlinks.slice(0, 10),
    twoHopLinks: twoHopLinks.slice(0, 10),
    ghostLinks: ghostLinks.slice(0, 5),
  };
}

/**
 * Hook to fetch linked pages data for a given page
 */
export function useLinkedPages(pageId: string) {
  const { getRepository, userId, isLoaded } = useRepository();
  const { data: currentPage } = usePage(pageId);

  return useQuery({
    queryKey: [...pageKeys.all, "linkedPages", userId, pageId],
    queryFn: async (): Promise<LinkedPagesData> => {
      if (!currentPage) {
        return {
          outgoingLinks: [],
          backlinks: [],
          twoHopLinks: [],
          ghostLinks: [],
        };
      }

      const repo = await getRepository();
      const allPages = await repo.getPages(userId);
      const backlinkIds = await repo.getBacklinks(pageId);

      return calculateLinkedPages({
        currentPage,
        pageId,
        allPages,
        backlinkIds,
      });
    },
    enabled: isLoaded && !!pageId && !!currentPage,
    staleTime: 1000 * 30, // 30 seconds
  });
}
