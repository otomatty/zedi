import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/clerk-react";
import { useCallback, useEffect, useState } from "react";
import { createAuthenticatedTursoClient } from "@/lib/turso";
import { PageRepository } from "@/lib/pageRepository";
import { LocalPageRepository } from "@/lib/localPageRepository";
import { initLocalDatabase } from "@/lib/localDatabase";
import type { Page } from "@/types/page";
import type { Database } from "sql.js";

// Local user ID for unauthenticated users
const LOCAL_USER_ID = "local-user";

// Query keys
export const pageKeys = {
  all: ["pages"] as const,
  lists: () => [...pageKeys.all, "list"] as const,
  list: (userId: string) => [...pageKeys.lists(), userId] as const,
  details: () => [...pageKeys.all, "detail"] as const,
  detail: (userId: string, pageId: string) =>
    [...pageKeys.details(), userId, pageId] as const,
  search: (userId: string, query: string) =>
    [...pageKeys.all, "search", userId, query] as const,
};

// Repository type
type RepositoryType = PageRepository | LocalPageRepository;

/**
 * Hook to get the appropriate repository based on auth state
 */
function useRepository() {
  const { getToken, isSignedIn, userId, isLoaded } = useAuth();
  const [localDb, setLocalDb] = useState<Database | null>(null);
  const [isLocalDbReady, setIsLocalDbReady] = useState(false);

  // Initialize local database
  useEffect(() => {
    initLocalDatabase()
      .then((db) => {
        setLocalDb(db);
        setIsLocalDbReady(true);
      })
      .catch((error) => {
        console.error("Failed to initialize local database:", error);
        setIsLocalDbReady(true); // Still mark as ready to avoid blocking
      });
  }, []);

  const getRepository = useCallback(async (): Promise<RepositoryType> => {
    if (isSignedIn && userId) {
      // Try to use Turso for authenticated users
      try {
        const token = await getToken({ template: "turso" });
        if (token) {
          const client = createAuthenticatedTursoClient(token);
          return new PageRepository(client);
        }
      } catch (error) {
        // JWT Template may not be configured yet, fall back to local
        console.warn("Failed to get Turso token, using local database:", error);
      }
    }

    // Use local SQLite for unauthenticated users or when Turso token fails
    if (!localDb) {
      const db = await initLocalDatabase();
      return new LocalPageRepository(db);
    }
    return new LocalPageRepository(localDb);
  }, [getToken, isSignedIn, userId, localDb]);

  const effectiveUserId = isSignedIn && userId ? userId : LOCAL_USER_ID;

  return {
    getRepository,
    userId: effectiveUserId,
    isSignedIn: isSignedIn ?? false,
    isLoaded: isLoaded && isLocalDbReady,
  };
}

/**
 * Hook to fetch all pages for the current user
 */
export function usePages() {
  const { getRepository, userId, isLoaded } = useRepository();

  return useQuery({
    queryKey: pageKeys.list(userId),
    queryFn: async () => {
      const repo = await getRepository();
      return repo.getPages(userId);
    },
    enabled: isLoaded,
    staleTime: 1000 * 60, // 1 minute
  });
}

/**
 * Hook to fetch a single page by ID
 */
export function usePage(pageId: string) {
  const { getRepository, userId, isLoaded } = useRepository();

  return useQuery({
    queryKey: pageKeys.detail(userId, pageId),
    queryFn: async () => {
      const repo = await getRepository();
      return repo.getPage(userId, pageId);
    },
    enabled: isLoaded && !!pageId,
  });
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
      const repo = await getRepository();
      return repo.createPage(userId, title, content);
    },
    onSuccess: (newPage) => {
      // Invalidate and refetch pages list
      queryClient.invalidateQueries({ queryKey: pageKeys.lists() });

      // Optimistically update the cache
      queryClient.setQueryData<Page[]>(pageKeys.list(userId), (old = []) => [
        newPage,
        ...old,
      ]);
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
      const repo = await getRepository();
      await repo.updatePage(userId, pageId, updates);
      return { pageId, updates };
    },
    onSuccess: ({ pageId, updates }) => {
      // Update the specific page in cache
      queryClient.setQueryData<Page | null>(
        pageKeys.detail(userId, pageId),
        (old) => (old ? { ...old, ...updates, updatedAt: Date.now() } : null)
      );

      // Update the page in the list cache
      queryClient.setQueryData<Page[]>(pageKeys.list(userId), (old = []) =>
        old.map((page) =>
          page.id === pageId
            ? { ...page, ...updates, updatedAt: Date.now() }
            : page
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
