import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useCallback, useEffect, useState, useRef } from "react";
import {
  getLocalClient,
  saveLocalDatabase,
  syncWithRemote,
  triggerSync,
  getSyncStatus,
  subscribeSyncStatus,
  type SyncStatus,
} from "@/lib/turso";
import { PageRepository } from "@/lib/pageRepository";
import { getPageListPreview } from "@/lib/contentUtils";
import type { Page, PageSummary } from "@/types/page";

// Local user ID for unauthenticated users
const LOCAL_USER_ID = "local-user";

// Query keys
export const pageKeys = {
  all: ["pages"] as const,
  lists: () => [...pageKeys.all, "list"] as const,
  list: (userId: string) => [...pageKeys.lists(), userId] as const,
  summaries: () => [...pageKeys.all, "summary"] as const,
  summary: (userId: string) => [...pageKeys.summaries(), userId] as const,
  details: () => [...pageKeys.all, "detail"] as const,
  detail: (userId: string, pageId: string) =>
    [...pageKeys.details(), userId, pageId] as const,
  search: (userId: string, query: string) =>
    [...pageKeys.all, "search", userId, query] as const,
};

/**
 * Hook to get sync status for UI display
 */
export function useSyncStatus(): SyncStatus {
  const [status, setStatus] = useState<SyncStatus>(getSyncStatus());

  useEffect(() => {
    const unsubscribe = subscribeSyncStatus(setStatus);
    return unsubscribe;
  }, []);

  return status;
}

/**
 * Hook to manually trigger sync (Delta sync - only changes since last sync)
 */
export function useSync() {
  const { getToken, userId, isSignedIn } = useAuth();
  const [isSyncing, setIsSyncing] = useState(false);
  const queryClient = useQueryClient();

  const sync = useCallback(async () => {
    if (!isSignedIn || !userId) return;

    setIsSyncing(true);
    try {
      console.log("[Sync] Manual sync requested", { userId });
      const token = await getToken({ template: "turso" });
      if (token) {
        await triggerSync(token, userId);
        // Invalidate queries to refetch with updated local data
        queryClient.invalidateQueries({ queryKey: pageKeys.all });
      } else {
        console.warn("[Sync] Manual sync skipped: missing token");
      }
    } catch (error) {
      console.error("Sync failed:", error);
    } finally {
      setIsSyncing(false);
    }
  }, [getToken, userId, isSignedIn, queryClient]);

  return { sync, isSyncing };
}

/**
 * Hook to get the appropriate repository based on auth state
 *
 * LOCAL-FIRST ARCHITECTURE:
 * - All reads/writes go to local WASM database (Rows Read = 0)
 * - Sync only on: 1) Initial page load, 2) Manual sync button
 * - Delta sync: Only fetches changes since last sync time
 * - Data persisted to IndexedDB for offline support
 */
export function useRepository() {
  const { getToken, isSignedIn, userId, isLoaded } = useAuth();
  const [isLocalDbReady, setIsLocalDbReady] = useState(false);
  const initialSyncDone = useRef(false);

  const effectiveUserId = isSignedIn && userId ? userId : LOCAL_USER_ID;

  // Initialize local database
  useEffect(() => {
    getLocalClient(effectiveUserId)
      .then(() => {
        setIsLocalDbReady(true);
      })
      .catch((error) => {
        console.error("Failed to initialize local database:", error);
        setIsLocalDbReady(true); // Still mark as ready to avoid blocking
      });
  }, [effectiveUserId]);

  // Initial sync on page load for authenticated users (once per session)
  useEffect(() => {
    if (isSignedIn && userId && isLocalDbReady && !initialSyncDone.current) {
      initialSyncDone.current = true;

      // Trigger delta sync on initial page load
      (async () => {
        try {
          console.log("[Sync] Initial sync requested", { userId });
          const token = await getToken({ template: "turso" });
          if (token) {
            await syncWithRemote(token, userId);
          } else {
            console.warn("[Sync] Initial sync skipped: missing token");
          }
        } catch (error) {
          console.error("Initial sync failed:", error);
        }
      })();
    }
  }, [isSignedIn, userId, isLocalDbReady, getToken]);

  const getRepository = useCallback(async (): Promise<PageRepository> => {
    // Always use local database (Local-First)
    const client = await getLocalClient(effectiveUserId);
    return new PageRepository(client, { onMutate: saveLocalDatabase });
  }, [effectiveUserId]);

  return {
    getRepository,
    userId: effectiveUserId,
    isSignedIn: isSignedIn ?? false,
    isLoaded: isLoaded && isLocalDbReady,
  };
}

/**
 * Hook to fetch all pages for the current user
 * WARNING: This fetches content for all pages - use usePagesSummary() for list views
 */
export function usePages() {
  const { getRepository, userId, isLoaded } = useRepository();

  const query = useQuery({
    queryKey: pageKeys.list(userId),
    queryFn: async () => {
      const repo = await getRepository();
      return repo.getPages(userId);
    },
    enabled: isLoaded,
    staleTime: 1000 * 60, // 1 minute
  });

  return {
    ...query,
    isLoading: query.isLoading || !isLoaded,
    isRepositoryReady: isLoaded,
  };
}

/**
 * Hook to fetch page summaries for the current user (without content)
 * Use this for list views to minimize data transfer and reduce Turso Rows Read
 */
export function usePagesSummary() {
  const { getRepository, userId, isLoaded } = useRepository();

  const query = useQuery({
    queryKey: pageKeys.summary(userId),
    queryFn: async () => {
      const repo = await getRepository();
      return repo.getPagesSummary(userId);
    },
    enabled: isLoaded,
    staleTime: 1000 * 60, // 1 minute
  });

  return {
    ...query,
    isLoading: query.isLoading || !isLoaded,
    isRepositoryReady: isLoaded,
  };
}

/**
 * Hook to fetch a single page by ID
 */
type UsePageOptions = {
  enabled?: boolean;
};

export function usePage(pageId: string, options?: UsePageOptions) {
  const { getRepository, userId, isLoaded } = useRepository();
  const isEnabled = (options?.enabled ?? true) && isLoaded && !!pageId;

  const query = useQuery({
    queryKey: pageKeys.detail(userId, pageId),
    queryFn: async () => {
      const repo = await getRepository();
      return repo.getPage(userId, pageId);
    },
    enabled: isEnabled,
  });

  return {
    ...query,
    isLoading: (options?.enabled ?? true) && (query.isLoading || !isLoaded),
    isRepositoryReady: isLoaded,
  };
}

/**
 * Hook to search pages
 */
export function useSearchPages(query: string) {
  const { getRepository, userId, isLoaded } = useRepository();

  return useQuery({
    queryKey: pageKeys.search(userId, query),
    queryFn: async () => {
      if (!query.trim()) return [];
      const repo = await getRepository();
      return repo.searchPages(userId, query);
    },
    enabled: isLoaded && query.trim().length > 0,
  });
}

/**
 * Hook to create a new page
 */
export function useCreatePage() {
  const { getRepository, userId } = useRepository();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      title = "",
      content = "",
    }: {
      title?: string;
      content?: string;
    }) => {
      // デバッグ: スタックトレースを出力
      console.log("=== createPage called ===");
      console.log("title:", title);
      console.log("Stack trace:", new Error().stack);
      const repo = await getRepository();
      return repo.createPage(userId, title, content);
    },
    onSuccess: (newPage) => {
      console.log("=== createPage success ===", newPage.id);
      // Invalidate and refetch pages list
      queryClient.invalidateQueries({ queryKey: pageKeys.lists() });
      queryClient.invalidateQueries({ queryKey: pageKeys.summaries() });

      // Optimistically update the cache
      queryClient.setQueryData<Page[]>(pageKeys.list(userId), (old = []) => [
        newPage,
        ...old,
      ]);

      // Also update summary cache
      const newSummary: PageSummary = {
        id: newPage.id,
        title: newPage.title,
        contentPreview: newPage.contentPreview,
        thumbnailUrl: newPage.thumbnailUrl,
        sourceUrl: newPage.sourceUrl,
        createdAt: newPage.createdAt,
        updatedAt: newPage.updatedAt,
        isDeleted: newPage.isDeleted,
      };
      queryClient.setQueryData<PageSummary[]>(
        pageKeys.summary(userId),
        (old = []) => [newSummary, ...old]
      );
    },
  });
}

/**
 * Hook to update a page
 */
export function useUpdatePage() {
  const { getRepository, userId } = useRepository();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      pageId,
      updates,
    }: {
      pageId: string;
      updates: Partial<
        Pick<Page, "title" | "content" | "thumbnailUrl" | "sourceUrl">
      >;
    }) => {
      const getCachedPage = (
        targetPageId: string
      ): Page | PageSummary | null => {
        const detail = queryClient.getQueryData<Page | null>(
          pageKeys.detail(userId, targetPageId)
        );
        if (detail) return detail;

        const list = queryClient.getQueryData<Page[]>(pageKeys.list(userId));
        if (list) {
          const found = list.find((page) => page.id === targetPageId);
          if (found) return found;
        }

        const summaries = queryClient.getQueryData<PageSummary[]>(
          pageKeys.summary(userId)
        );
        if (summaries) {
          const found = summaries.find((page) => page.id === targetPageId);
          if (found) return found;
        }

        return null;
      };

      const existing = getCachedPage(pageId);
      const existingContent =
        existing && "content" in existing ? existing.content : undefined;

      const actualUpdates: Partial<
        Pick<Page, "title" | "content" | "thumbnailUrl" | "sourceUrl">
      > = {};

      if (updates.title !== undefined) {
        if (!existing || existing.title !== updates.title) {
          actualUpdates.title = updates.title;
        }
      }
      if (updates.content !== undefined) {
        if (existingContent === undefined || existingContent !== updates.content) {
          actualUpdates.content = updates.content;
        }
      }
      if (updates.thumbnailUrl !== undefined) {
        if (!existing || existing.thumbnailUrl !== updates.thumbnailUrl) {
          actualUpdates.thumbnailUrl = updates.thumbnailUrl;
        }
      }
      if (updates.sourceUrl !== undefined) {
        if (!existing || existing.sourceUrl !== updates.sourceUrl) {
          actualUpdates.sourceUrl = updates.sourceUrl;
        }
      }

      if (Object.keys(actualUpdates).length === 0) {
        return { pageId, updates: actualUpdates, skipped: true };
      }

      const repo = await getRepository();
      await repo.updatePage(userId, pageId, actualUpdates);
      return { pageId, updates: actualUpdates, skipped: false };
    },
    onSuccess: ({ pageId, updates, skipped }) => {
      if (skipped) return;
      const now = Date.now();
      const contentPreview =
        updates.content !== undefined
          ? getPageListPreview(updates.content)
          : undefined;

      // Update the specific page in cache
      queryClient.setQueryData<Page | null>(
        pageKeys.detail(userId, pageId),
        (old) =>
          old
            ? {
                ...old,
                ...updates,
                ...(contentPreview !== undefined ? { contentPreview } : {}),
                updatedAt: now,
              }
            : null
      );

      // Update the page in the list cache
      queryClient.setQueryData<Page[]>(pageKeys.list(userId), (old = []) =>
        old.map((page) =>
          page.id === pageId
            ? {
                ...page,
                ...updates,
                ...(contentPreview !== undefined ? { contentPreview } : {}),
                updatedAt: now,
              }
            : page
        )
      );

      // Update the page in the summary cache (only title, thumbnailUrl, sourceUrl)
      const summaryUpdates: Partial<PageSummary> = { updatedAt: now };
      if (updates.title !== undefined) summaryUpdates.title = updates.title;
      if (updates.thumbnailUrl !== undefined)
        summaryUpdates.thumbnailUrl = updates.thumbnailUrl;
      if (updates.sourceUrl !== undefined)
        summaryUpdates.sourceUrl = updates.sourceUrl;
      if (contentPreview !== undefined)
        summaryUpdates.contentPreview = contentPreview;

      queryClient.setQueryData<PageSummary[]>(
        pageKeys.summary(userId),
        (old = []) =>
          old.map((page) =>
            page.id === pageId ? { ...page, ...summaryUpdates } : page
          )
      );
    },
  });
}

/**
 * Hook to delete a page
 */
export function useDeletePage() {
  const { getRepository, userId } = useRepository();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (pageId: string) => {
      const repo = await getRepository();
      await repo.deletePage(userId, pageId);
      return pageId;
    },
    onSuccess: (pageId) => {
      // Remove from list cache
      queryClient.setQueryData<Page[]>(pageKeys.list(userId), (old = []) =>
        old.filter((page) => page.id !== pageId)
      );

      // Remove from summary cache
      queryClient.setQueryData<PageSummary[]>(
        pageKeys.summary(userId),
        (old = []) => old.filter((page) => page.id !== pageId)
      );

      // Invalidate detail query
      queryClient.invalidateQueries({
        queryKey: pageKeys.detail(userId, pageId),
      });
    },
  });
}

/**
 * Hook to get a page by title
 */
export function usePageByTitle(title: string) {
  const { getRepository, userId, isLoaded } = useRepository();

  return useQuery({
    queryKey: [...pageKeys.all, "byTitle", userId, title],
    queryFn: async () => {
      if (!title.trim()) return null;
      const repo = await getRepository();
      return repo.getPageByTitle(userId, title);
    },
    enabled: isLoaded && title.trim().length > 0,
  });
}

// --- Link hooks ---

/**
 * Hook to add a link between pages
 */
export function useAddLink() {
  const { getRepository } = useRepository();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      sourceId,
      targetId,
    }: {
      sourceId: string;
      targetId: string;
    }) => {
      const repo = await getRepository();
      await repo.addLink(sourceId, targetId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pageKeys.all });
    },
  });
}

/**
 * Hook to remove a link between pages
 */
export function useRemoveLink() {
  const { getRepository } = useRepository();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      sourceId,
      targetId,
    }: {
      sourceId: string;
      targetId: string;
    }) => {
      const repo = await getRepository();
      await repo.removeLink(sourceId, targetId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pageKeys.all });
    },
  });
}

// --- Ghost Link hooks ---

/**
 * Hook to check if a link text is referenced in ghost_links table from OTHER pages
 */
export function useCheckGhostLinkReferenced() {
  const { getRepository } = useRepository();

  const checkReferenced = useCallback(
    async (linkText: string, currentPageId?: string): Promise<boolean> => {
      try {
        const repo = await getRepository();
        const sources = await repo.getGhostLinkSources(linkText);
        // Referenced if at least one OTHER page has this ghost link
        const otherSources = currentPageId
          ? sources.filter((id) => id !== currentPageId)
          : sources;
        return otherSources.length > 0;
      } catch (error) {
        console.error("Error checking ghost link:", error);
        return false;
      }
    },
    [getRepository]
  );

  return { checkReferenced };
}

/**
 * Hook to check for duplicate page titles
 */
export function useCheckDuplicateTitle() {
  const { getRepository, userId, isLoaded } = useRepository();

  const checkDuplicate = useCallback(
    async (title: string, excludePageId?: string): Promise<Page | null> => {
      if (!isLoaded || !title.trim()) return null;
      try {
        const repo = await getRepository();
        return await repo.checkDuplicateTitle(userId, title, excludePageId);
      } catch (error) {
        console.error("Error checking duplicate title:", error);
        return null;
      }
    },
    [getRepository, userId, isLoaded]
  );

  return { checkDuplicate, isLoaded };
}

/**
 * Hook to add a ghost link
 */
export function useAddGhostLink() {
  const { getRepository } = useRepository();

  return useMutation({
    mutationFn: async ({
      linkText,
      sourcePageId,
    }: {
      linkText: string;
      sourcePageId: string;
    }) => {
      const repo = await getRepository();
      await repo.addGhostLink(linkText, sourcePageId);
    },
  });
}

/**
 * Hook to promote a ghost link to a real page
 */
export function usePromoteGhostLink() {
  const { getRepository, userId } = useRepository();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (linkText: string) => {
      const repo = await getRepository();
      return repo.promoteGhostLink(userId, linkText);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pageKeys.all });
    },
  });
}

/**
 * Hook to sync WikiLinks when saving a page
 * - Updates links table for existing pages
 * - Updates ghost_links table for non-existing pages
 * - Promotes ghost links if referenced from 2+ pages
 *
 * OPTIMIZED: Uses getPagesSummary() instead of getPages() to reduce Rows Read
 */
export function useSyncWikiLinks() {
  const { getRepository, userId } = useRepository();

  const syncLinks = useCallback(
    async (
      sourcePageId: string,
      wikiLinks: Array<{ title: string; exists: boolean }>
    ): Promise<void> => {
      const repo = await getRepository();

      // OPTIMIZED: Use summary (no content) to check which links are valid
      const pages = await repo.getPagesSummary(userId);
      const pageTitleToId = new Map(
        pages.map((p) => [p.title.toLowerCase().trim(), p.id])
      );

      // Process each WikiLink
      for (const link of wikiLinks) {
        const normalizedTitle = link.title.toLowerCase().trim();
        const targetPageId = pageTitleToId.get(normalizedTitle);

        if (targetPageId && targetPageId !== sourcePageId) {
          // Existing page - add to links table
          await repo.addLink(sourcePageId, targetPageId);
          // Remove from ghost_links if it was there
          await repo.removeGhostLink(link.title, sourcePageId);
        } else if (!targetPageId) {
          // Non-existing page - add to ghost_links
          await repo.addGhostLink(link.title, sourcePageId);
        }
      }

      // Note: Ghost links referenced from multiple pages will have their
      // "referenced" attribute set to true for styling purposes, but
      // pages are NOT automatically created. Users must explicitly create
      // pages by clicking on the link.
    },
    [getRepository, userId]
  );

  return { syncLinks };
}

/**
 * Hook to get data needed to update WikiLink exists status
 * Returns a function that checks if pages exist by their titles
 *
 * OPTIMIZED: Uses getPagesSummary() instead of getPages() to reduce Rows Read
 */
export function useWikiLinkExistsChecker() {
  const { getRepository, userId, isLoaded } = useRepository();

  const checkExistence = useCallback(
    async (
      titles: string[],
      currentPageId?: string
    ): Promise<{
      pageTitles: Set<string>;
      referencedTitles: Set<string>;
    }> => {
      if (!isLoaded || titles.length === 0) {
        return { pageTitles: new Set(), referencedTitles: new Set() };
      }

      const repo = await getRepository();

      // OPTIMIZED: Use summary (no content) to check existence
      const pages = await repo.getPagesSummary(userId);
      const pageTitles = new Set(
        pages.map((p) => p.title.toLowerCase().trim())
      );

      // Get ghost links to check referenced status
      const ghostLinks = await repo.getGhostLinks(userId);
      const referencedTitles = new Set<string>();

      // Group ghost links by link_text
      const ghostLinksByText = new Map<string, string[]>();
      for (const gl of ghostLinks) {
        const normalized = gl.linkText.toLowerCase().trim();
        const sources = ghostLinksByText.get(normalized) || [];
        sources.push(gl.sourcePageId);
        ghostLinksByText.set(normalized, sources);
      }

      // A title is "referenced" if it appears in ghost_links from OTHER pages
      for (const title of titles) {
        const normalized = title.toLowerCase().trim();
        const sources = ghostLinksByText.get(normalized) || [];
        const otherSources = currentPageId
          ? sources.filter((id) => id !== currentPageId)
          : sources;
        if (otherSources.length > 0) {
          referencedTitles.add(normalized);
        }
      }

      return { pageTitles, referencedTitles };
    },
    [getRepository, userId, isLoaded]
  );

  return { checkExistence, isLoaded };
}
