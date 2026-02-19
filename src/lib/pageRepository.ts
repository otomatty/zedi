import type { Page, PageSummary, Link, GhostLink } from "@/types/page";

/**
 * C3-7: Common interface for page repository implementations.
 * Implemented by StorageAdapterPageRepository (adapter + API).
 */
/** Optional metadata when creating a page (e.g. from URL clip). */
export interface CreatePageOptions {
  sourceUrl?: string | null;
  thumbnailUrl?: string | null;
}

export interface IPageRepository {
  createPage(userId: string, title?: string, content?: string, options?: CreatePageOptions): Promise<Page>;
  getPage(userId: string, pageId: string): Promise<Page | null>;
  getPages(userId: string): Promise<Page[]>;
  getPagesSummary(userId: string): Promise<PageSummary[]>;
  getPagesByIds(userId: string, pageIds: string[]): Promise<Page[]>;
  getPageByTitle(userId: string, title: string): Promise<Page | null>;
  checkDuplicateTitle(userId: string, title: string, excludePageId?: string): Promise<Page | null>;
  updatePage(
    userId: string,
    pageId: string,
    updates: Partial<Pick<Page, "title" | "content" | "thumbnailUrl" | "sourceUrl">>
  ): Promise<void>;
  deletePage(userId: string, pageId: string): Promise<void>;
  searchPages(userId: string, query: string): Promise<Page[]>;
  addLink(sourceId: string, targetId: string): Promise<void>;
  removeLink(sourceId: string, targetId: string): Promise<void>;
  getOutgoingLinks(pageId: string): Promise<string[]>;
  getBacklinks(pageId: string): Promise<string[]>;
  getLinks(userId: string): Promise<Link[]>;
  addGhostLink(linkText: string, sourcePageId: string): Promise<void>;
  removeGhostLink(linkText: string, sourcePageId: string): Promise<void>;
  getGhostLinkSources(linkText: string): Promise<string[]>;
  getGhostLinks(userId: string): Promise<GhostLink[]>;
  /** Link texts (titles) for ghost links from a single source page. Used for delta sync. */
  getGhostLinksBySourcePage(sourcePageId: string): Promise<string[]>;
  promoteGhostLink(userId: string, linkText: string): Promise<Page | null>;
}

/**
 * Options for repository implementations that support mutation callbacks.
 */
export interface PageRepositoryOptions {
  /**
   * Callback to call after any mutation (create, update, delete)
   */
  onMutate?: () => void | Promise<void>;
}
