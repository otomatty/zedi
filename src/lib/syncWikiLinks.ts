import type { IPageRepository } from "@/lib/pageRepository";

export interface WikiLinkForSync {
  title: string;
  exists?: boolean;
}

/**
 * Sync WikiLinks for a page (delta update).
 * - Removes links/ghost_links that are no longer in content.
 * - Adds links for current content (existing pages → links, others → ghost_links).
 *
 * Extracted for unit testing with a mock repo.
 */
export async function syncLinksWithRepo(
  repo: IPageRepository,
  userId: string,
  sourcePageId: string,
  wikiLinks: WikiLinkForSync[],
): Promise<void> {
  const pages = await repo.getPagesSummary(userId);
  const pageTitleToId = new Map(pages.map((p) => [p.title.toLowerCase().trim(), p.id]));
  const idToNormalizedTitle = new Map(pages.map((p) => [p.id, p.title.toLowerCase().trim()]));
  const currentNormalizedTitles = new Set(wikiLinks.map((l) => l.title.toLowerCase().trim()));

  // Delta: remove links that are no longer in content
  const [oldOutgoingTargetIds, oldGhostTexts] = await Promise.all([
    repo.getOutgoingLinks(sourcePageId),
    repo.getGhostLinksBySourcePage(sourcePageId),
  ]);
  for (const targetId of oldOutgoingTargetIds) {
    const norm = idToNormalizedTitle.get(targetId);
    if (norm !== undefined && !currentNormalizedTitles.has(norm)) {
      await repo.removeLink(sourcePageId, targetId);
    }
  }
  for (const linkText of oldGhostTexts) {
    const norm = linkText.toLowerCase().trim();
    if (!currentNormalizedTitles.has(norm)) {
      await repo.removeGhostLink(linkText, sourcePageId);
    }
  }

  // Add/update: current content's links
  for (const link of wikiLinks) {
    const normalizedTitle = link.title.toLowerCase().trim();
    const targetPageId = pageTitleToId.get(normalizedTitle);

    if (targetPageId && targetPageId !== sourcePageId) {
      await repo.addLink(sourcePageId, targetPageId);
      await repo.removeGhostLink(link.title, sourcePageId);
    } else if (!targetPageId) {
      await repo.addGhostLink(link.title, sourcePageId);
    }
  }
}
