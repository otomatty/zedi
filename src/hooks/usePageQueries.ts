import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useCallback, useEffect, useState, useRef } from "react";
import {
  runApiSync,
  getSyncStatus,
  subscribeSyncStatus,
  resetSyncFailures,
  type SyncStatus,
} from "@/lib/sync";
import { createStorageAdapter } from "@/lib/storageAdapter";
import { createApiClient } from "@/lib/api";
import { StorageAdapterPageRepository } from "@/lib/pageRepository/StorageAdapterPageRepository";
import type { IPageRepository } from "@/lib/pageRepository";
import { syncLinksWithRepo } from "@/lib/syncWikiLinks";
import { getPageListPreview } from "@/lib/contentUtils";
import type { Page, PageSummary } from "@/types/page";

// Local user ID for unauthenticated users
const LOCAL_USER_ID = "local-user";

/**
 * Track which userIds have already requested initial sync this session.
 * useRepository() is used by many components (PageGrid, FAB, GlobalSearch, etc.);
 * each hook instance has its own ref, so without this we'd trigger N sync
 * requests and N "[Sync] Initial sync requested" logs (and 2N under Strict Mode).
 */
const initialSyncRequestedForUser = new Set<string>();

/**
 * ページ系クエリ・ミューテーションが共有する React Query キー群。
 * React Query key factory shared by page-related queries and mutations.
 */
export const pageKeys = {
  all: ["pages"] as const,
  lists: () => [...pageKeys.all, "list"] as const,
  list: (userId: string) => [...pageKeys.lists(), userId] as const,
  summaries: () => [...pageKeys.all, "summary"] as const,
  summary: (userId: string) => [...pageKeys.summaries(), userId] as const,
  details: () => [...pageKeys.all, "detail"] as const,
  detail: (userId: string, pageId: string) => [...pageKeys.details(), userId, pageId] as const,
  byTitles: (userId: string) => [...pageKeys.all, "byTitle", userId] as const,
  byTitle: (userId: string, title: string) => [...pageKeys.byTitles(userId), title.trim()] as const,
  search: (userId: string, query: string) => [...pageKeys.all, "search", userId, query] as const,
  searchShared: (query: string) => [...pageKeys.all, "searchShared", query] as const,
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
 * Hook to manually trigger sync (C3-7: API + StorageAdapter)
 */
export function useSync() {
  const { getToken, userId, isSignedIn } = useAuth();
  const [isSyncing, setIsSyncing] = useState(false);
  const queryClient = useQueryClient();

  const sync = useCallback(async () => {
    if (!isSignedIn || !userId) return;

    setIsSyncing(true);
    try {
      // Manual sync: reset failure counter and force past the auto-retry guard
      resetSyncFailures();
      await runApiSync(userId, getToken, { force: true });
      queryClient.invalidateQueries({ queryKey: pageKeys.all });
    } catch (error) {
      console.error("Sync failed:", error);
    } finally {
      setIsSyncing(false);
    }
  }, [getToken, userId, isSignedIn, queryClient]);

  return { sync, isSyncing };
}

/**
 * Hook to get the appropriate repository based on auth state (C3-7: StorageAdapter + API)
 *
 * LOCAL-FIRST:
 * - Reads/writes go to StorageAdapter (IndexedDB). Sync via runApiSync (GET/POST /api/sync/pages).
 * - Initial sync on load; manual sync via useSync().
 */
export function useRepository() {
  const { getToken, isSignedIn, userId, isLoaded } = useAuth();
  const queryClient = useQueryClient();
  const [isAdapterReady, setIsAdapterReady] = useState(false);
  const adapterRef = useRef<ReturnType<typeof createStorageAdapter> | null>(null);
  const apiRef = useRef<ReturnType<typeof createApiClient> | null>(null);

  const effectiveUserId = isSignedIn && userId ? userId : LOCAL_USER_ID;

  // Create adapter + api and initialize adapter for current user
  useEffect(() => {
    queueMicrotask(() => setIsAdapterReady(false));
    const adapter = createStorageAdapter();
    const api = createApiClient({ getToken });
    adapterRef.current = adapter;
    apiRef.current = api;
    adapter
      .initialize(effectiveUserId)
      .then(() => setIsAdapterReady(true))
      .catch((err) => {
        console.error("Failed to initialize storage adapter:", err);
        setIsAdapterReady(true);
      });
    return () => {
      // NOTE:
      // IndexedDBStorageAdapter currently keeps its DB handle at module scope.
      // Closing it from each hook instance cleanup can tear down active sync
      // running in another instance (e.g. StrictMode double-mount), causing:
      // "IndexedDBStorageAdapter: not initialized".
      // Keep the adapter alive and let initialize(userId) handle user switches.
      adapterRef.current = null;
      apiRef.current = null;
    };
  }, [effectiveUserId, getToken]);

  // Clear initial-sync flags when user signs out
  useEffect(() => {
    if (!isSignedIn) {
      initialSyncRequestedForUser.clear();
    }
  }, [isSignedIn]);

  // Initial sync for authenticated users (once per userId per session).
  // On failure the guard is NOT removed — this prevents infinite retry loops.
  // The user can manually retry via the SyncIndicator button.
  useEffect(() => {
    if (!isSignedIn || !userId || !isAdapterReady) return;
    if (initialSyncRequestedForUser.has(userId)) return;
    initialSyncRequestedForUser.add(userId);

    (async () => {
      try {
        await runApiSync(userId, getToken);
        // Refetch page list so UI shows data pulled into IndexedDB (avoids stuck loading/empty)
        queryClient.invalidateQueries({ queryKey: pageKeys.all });
      } catch (error) {
        console.error("Initial sync failed:", error);
        // Refetch so UI reflects current IndexedDB state (e.g. partial pull)
        queryClient.invalidateQueries({ queryKey: pageKeys.all });

        // NOTE: Do NOT delete from initialSyncRequestedForUser here on failure.
        // Removing the guard on failure can cause infinite retry loops
        // when the API is unreachable (CORS, network error, invalid JSON, etc.).
        // Manual retry via useSync() or page reload will re-attempt.
      }
    })();
  }, [isSignedIn, userId, isAdapterReady, getToken, queryClient]);

  const getRepository = useCallback(async (): Promise<IPageRepository> => {
    const adapter = adapterRef.current;
    const api = apiRef.current;
    if (!adapter || !api) throw new Error("Repository not ready");
    return new StorageAdapterPageRepository(adapter, api);
  }, []);

  return {
    getRepository,
    userId: effectiveUserId,
    isSignedIn: isSignedIn ?? false,
    isLoaded: isLoaded && isAdapterReady,
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
 * `usePagesSummary` のオプション。`enabled: false` を渡すと IndexedDB への
 * 問い合わせをスキップできる（ノートスコープ編集時に個人ページを取りに
 * 行かないように抑止するなど。Issue #713 Phase 4）。
 * Options for {@link usePagesSummary}; pass `enabled: false` to skip the
 * IndexedDB lookup (e.g. in note scope where personal pages are irrelevant,
 * see issue #713 Phase 4).
 */
type UsePagesSummaryOptions = {
  enabled?: boolean;
};

/**
 * Hook to fetch page summaries for the current user (without content)
 * Use this for list views to minimize data transfer
 */
export function usePagesSummary(options?: UsePagesSummaryOptions) {
  const { getRepository, userId, isLoaded } = useRepository();
  const callerEnabled = options?.enabled ?? true;
  const isEnabled = callerEnabled && isLoaded;

  const query = useQuery({
    queryKey: pageKeys.summary(userId),
    queryFn: async () => {
      const repo = await getRepository();
      return repo.getPagesSummary(userId);
    },
    enabled: isEnabled,
    staleTime: 1000 * 60, // 1 minute
  });

  return {
    ...query,
    isLoading: callerEnabled && (query.isLoading || !isLoaded),
    isRepositoryReady: isLoaded,
  };
}

/**
 * `usePage` のオプション。`enabled: false` でリクエストを抑止できる。
 * Options for {@link usePage}; pass `enabled: false` to suppress the request.
 */
type UsePageOptions = {
  enabled?: boolean;
};

/**
 * ID 指定で単一ページを取得するフック。取得前は `data = undefined`。
 * Hook that fetches a single page by ID; `data` is `undefined` until loaded.
 */
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
 * Hook to search pages (personal; StorageAdapter)
 */
export function useSearchPages(query: string) {
  const { getRepository, userId, isLoaded } = useRepository();

  return useQuery({
    queryKey: pageKeys.search(userId, query),
    queryFn: async () => {
      if (!query.trim()) return [];
      try {
        const repo = await getRepository();
        const results = await repo.searchPages(userId, query);
        return results;
      } catch (error) {
        console.error("[searchPages] Failed", {
          query,
          error,
          message: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    },
    enabled: isLoaded && query.trim().length >= 3,
  });
}

/**
 * Hook to search shared notes (API: GET /api/search?q=&scope=shared). C3-8.
 */
export function useSearchSharedNotes(query: string) {
  const { getToken, isSignedIn } = useAuth();

  return useQuery({
    queryKey: pageKeys.searchShared(query),
    queryFn: async () => {
      try {
        const api = createApiClient({ getToken });
        const result = await api.searchSharedNotes(query);
        return result;
      } catch (error) {
        console.error("[searchSharedNotes] Failed", {
          query,
          error,
          message: error instanceof Error ? error.message : String(error),
          status: (error as { status?: number }).status,
        });
        throw error;
      }
    },
    enabled: isSignedIn && query.trim().length >= 3,
    retry: false, // サーバーが 500 を返す場合リトライしない
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
      sourceUrl,
      thumbnailUrl,
    }: {
      title?: string;
      content?: string;
      sourceUrl?: string | null;
      thumbnailUrl?: string | null;
    }) => {
      const repo = await getRepository();
      return repo.createPage(userId, title, content, {
        sourceUrl: sourceUrl ?? undefined,
        thumbnailUrl: thumbnailUrl ?? undefined,
      });
    },
    onSuccess: (newPage) => {
      // Invalidate and refetch pages list
      queryClient.invalidateQueries({ queryKey: pageKeys.lists() });
      queryClient.invalidateQueries({ queryKey: pageKeys.summaries() });
      queryClient.invalidateQueries({ queryKey: pageKeys.byTitles(userId) });

      // 作成したページの detail キャッシュを即時設定（リンクから作成後すぐの遷移でタイトル・コンテンツが正しく表示されるようにする）
      queryClient.setQueryData<Page | null>(pageKeys.detail(userId, newPage.id), newPage);
      queryClient.setQueryData<Page | null>(
        pageKeys.byTitle(userId, newPage.title.trim()),
        newPage,
      );

      // Optimistically update the cache
      queryClient.setQueryData<Page[]>(pageKeys.list(userId), (old = []) => [newPage, ...old]);

      // Also update summary cache
      const newSummary: PageSummary = {
        id: newPage.id,
        ownerUserId: newPage.ownerUserId,
        // useCreatePage は個人ページ作成しか経由しないので常に `null`。Issue #713。
        // useCreatePage only creates personal pages, so noteId is always null.
        noteId: newPage.noteId,
        title: newPage.title,
        contentPreview: newPage.contentPreview,
        thumbnailUrl: newPage.thumbnailUrl,
        sourceUrl: newPage.sourceUrl,
        createdAt: newPage.createdAt,
        updatedAt: newPage.updatedAt,
        isDeleted: newPage.isDeleted,
      };
      queryClient.setQueryData<PageSummary[]>(pageKeys.summary(userId), (old = []) => [
        newSummary,
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
      updates: Partial<Pick<Page, "title" | "content" | "thumbnailUrl" | "sourceUrl">>;
    }) => {
      const getCachedPage = (targetPageId: string): Page | PageSummary | null => {
        const detail = queryClient.getQueryData<Page | null>(pageKeys.detail(userId, targetPageId));
        if (detail) return detail;

        const list = queryClient.getQueryData<Page[]>(pageKeys.list(userId));
        if (list) {
          const found = list.find((page) => page.id === targetPageId);
          if (found) return found;
        }

        const summaries = queryClient.getQueryData<PageSummary[]>(pageKeys.summary(userId));
        if (summaries) {
          const found = summaries.find((page) => page.id === targetPageId);
          if (found) return found;
        }

        return null;
      };

      const existing = getCachedPage(pageId);
      const existingContent = existing && "content" in existing ? existing.content : undefined;

      const actualUpdates: Partial<Pick<Page, "title" | "content" | "thumbnailUrl" | "sourceUrl">> =
        {};

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
        updates.content !== undefined ? getPageListPreview(updates.content) : undefined;

      // Update the specific page in cache
      queryClient.setQueryData<Page | null>(pageKeys.detail(userId, pageId), (old) =>
        old
          ? {
              ...old,
              ...updates,
              ...(contentPreview !== undefined ? { contentPreview } : {}),
              updatedAt: now,
            }
          : null,
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
            : page,
        ),
      );

      // Update the page in the summary cache (only title, thumbnailUrl, sourceUrl)
      const summaryUpdates: Partial<PageSummary> = { updatedAt: now };
      if (updates.title !== undefined) summaryUpdates.title = updates.title;
      if (updates.thumbnailUrl !== undefined) summaryUpdates.thumbnailUrl = updates.thumbnailUrl;
      if (updates.sourceUrl !== undefined) summaryUpdates.sourceUrl = updates.sourceUrl;
      if (contentPreview !== undefined) summaryUpdates.contentPreview = contentPreview;

      queryClient.setQueryData<PageSummary[]>(pageKeys.summary(userId), (old = []) =>
        old.map((page) => (page.id === pageId ? { ...page, ...summaryUpdates } : page)),
      );

      queryClient.invalidateQueries({ queryKey: pageKeys.byTitles(userId) });
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
        old.filter((page) => page.id !== pageId),
      );

      // Remove from summary cache
      queryClient.setQueryData<PageSummary[]>(pageKeys.summary(userId), (old = []) =>
        old.filter((page) => page.id !== pageId),
      );

      // Invalidate detail and byTitle caches
      queryClient.invalidateQueries({
        queryKey: pageKeys.detail(userId, pageId),
      });
      queryClient.invalidateQueries({ queryKey: pageKeys.byTitles(userId) });
    },
  });
}

/**
 * Hook to get a page by title
 */
export function usePageByTitle(title: string) {
  const { getRepository, userId, isLoaded } = useRepository();

  return useQuery({
    queryKey: pageKeys.byTitle(userId, title),
    queryFn: async () => {
      const normalized = title.trim();
      if (!normalized) return null;
      const repo = await getRepository();
      return repo.getPageByTitle(userId, normalized);
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
    mutationFn: async ({ sourceId, targetId }: { sourceId: string; targetId: string }) => {
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
    mutationFn: async ({ sourceId, targetId }: { sourceId: string; targetId: string }) => {
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
        const otherSources = currentPageId ? sources.filter((id) => id !== currentPageId) : sources;
        return otherSources.length > 0;
      } catch (error) {
        console.error("Error checking ghost link:", error);
        return false;
      }
    },
    [getRepository],
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
    [getRepository, userId, isLoaded],
  );

  return { checkDuplicate, isLoaded };
}

/**
 * Hook to add a ghost link
 */
export function useAddGhostLink() {
  const { getRepository } = useRepository();

  return useMutation({
    mutationFn: async ({ linkText, sourcePageId }: { linkText: string; sourcePageId: string }) => {
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
 * `useSyncWikiLinks` のオプション。WikiLink 同期のスコープを個人ページと
 * ノートネイティブページで切り替える（Issue #713 Phase 4）。
 *
 * - `pageNoteId === null` / 省略: 個人スコープ。`repo.getPagesSummary()`
 *   が返す個人ページのみを解決候補にする。
 * - `pageNoteId !== null`: ノートスコープ。呼び出し側は同じノートに所属する
 *   ページ一覧（`useNotePages` で取得）を `notePages` に渡す。
 *
 * Options for {@link useSyncWikiLinks}. Switches sync scope between personal
 * and note-native pages. When `pageNoteId` is set, callers must supply
 * `notePages` (typically from `useNotePages`) because the repository does
 * not hold note-native page summaries locally. See issue #713 Phase 4.
 */
export type UseSyncWikiLinksOptions = {
  pageNoteId?: string | null;
  notePages?: Array<Pick<PageSummary, "id" | "title">>;
};

/**
 * Hook to sync WikiLinks when saving a page (delta update).
 * - Removes links/ghost_links that are no longer in content.
 * - Adds or updates links for current content (existing pages → links, others → ghost_links).
 *
 * Only touches the saved page; no full-scan of all pages.
 * OPTIMIZED: Uses getPagesSummary() for title↔id resolution (no content).
 *
 * `options.pageNoteId` を文字列で渡すとノートスコープで同期する。ノート内の
 * ページ一覧 (`options.notePages`) を呼び出し側が用意する必要がある。
 * 個人ページ（既定）では従来どおり `repo.getPagesSummary(userId)` を使う。
 * Issue #713 Phase 4。
 */
export function useSyncWikiLinks(options: UseSyncWikiLinksOptions = {}) {
  const { getRepository, userId } = useRepository();
  const pageNoteId = options.pageNoteId ?? null;
  const notePages = options.notePages;

  const syncLinks = useCallback(
    async (
      sourcePageId: string,
      wikiLinks: Array<{ title: string; exists: boolean }>,
    ): Promise<void> => {
      const repo = await getRepository();
      await syncLinksWithRepo(repo, userId, sourcePageId, wikiLinks, {
        pageNoteId,
        notePages,
        linkType: "wiki",
      });
    },
    [getRepository, userId, pageNoteId, notePages],
  );

  /**
   * タグ (`#name`) を `link_type='tag'` バケットで同期する (issue #725 Phase 1)。
   * 解決ロジックは WikiLink と同一（タイトル正規化で一致 → `links`、不一致 →
   * `ghost_links`）。呼び出し側は `extractTagsFromContent` で `{ name }` 配列を
   * 作って `{ title: name, exists: false }` 形に詰め替える。
   *
   * Sync tags in the `link_type='tag'` bucket (issue #725 Phase 1). The
   * resolution strategy matches WikiLinks (normalized-title match → `links`,
   * miss → `ghost_links`). Callers feed `extractTagsFromContent` results in
   * as `{ title: name }` entries so we can reuse one resolver.
   */
  const syncTags = useCallback(
    async (sourcePageId: string, tags: Array<{ name: string }>): Promise<void> => {
      const repo = await getRepository();
      // tag の `name` は WikiLink の `title` に等価なので同じ resolver に流す。
      // The tag name is title-equivalent for resolution purposes.
      const asLinks = tags.map((t) => ({ title: t.name, exists: false }));
      await syncLinksWithRepo(repo, userId, sourcePageId, asLinks, {
        pageNoteId,
        notePages,
        linkType: "tag",
      });
    },
    [getRepository, userId, pageNoteId, notePages],
  );

  return { syncLinks, syncTags };
}

/**
 * `useWikiLinkExistsChecker` のオプション。WikiLink の解決スコープを
 * 個人ページとノートネイティブページで切り替える（Issue #713 Phase 4）。
 *
 * Options for {@link useWikiLinkExistsChecker}. Switches WikiLink resolution
 * scope between personal pages and note-native pages. See issue #713 Phase 4.
 */
export type UseWikiLinkExistsCheckerOptions = {
  /**
   * 編集中ページの noteId。`null`（既定）は個人ページ、文字列は
   * ノートネイティブページ。
   *
   * Owning note ID. `null` (default) → personal scope; string → note scope.
   */
  pageNoteId?: string | null;
  /**
   * `pageNoteId !== null` のときに使う候補ページ一覧。IndexedDB には
   * ノートネイティブページが載らないため、API 経由で取得したノート配下の
   * ページ一覧を呼び出し側が渡す。
   *
   * Candidate pages used when `pageNoteId` is a string. IndexedDB does not
   * hold note-native pages, so callers must supply the note's page list
   * (typically from `useNotePages`).
   */
  notePages?: Array<Pick<PageSummary, "id" | "title">>;
};

/**
 * Hook to get data needed to update WikiLink exists status
 * Returns a function that checks if pages exist by their titles
 *
 * スコープ（個人 / ノート）に応じて候補ソースを切り替える。Issue #713 Phase 4：
 * - `pageNoteId === null` / 省略: `repo.getPagesSummary()`（個人ページ）
 * - `pageNoteId !== null`: `notePages`（呼び出し側が `useNotePages` から渡す）
 *
 * OPTIMIZED: Uses getPagesSummary() instead of getPages() to reduce Rows Read
 */
export function useWikiLinkExistsChecker(options: UseWikiLinkExistsCheckerOptions = {}) {
  const { getRepository, userId, isLoaded } = useRepository();
  const pageNoteId = options.pageNoteId ?? null;
  const notePages = options.notePages;

  const checkExistence = useCallback(
    async (
      titles: string[],
      currentPageId?: string,
    ): Promise<{
      pageTitles: Set<string>;
      referencedTitles: Set<string>;
      /**
       * 正規化済みタイトル → ターゲットページ id のマップ。同一スコープ内に
       * 同名ページが複数あった場合は **最後に出現したページの id** が残る
       * （Map への上書き）。`useWikiLinkStatusSync` / `useTagStatusSync` が
       * `targetId` 属性を埋めるためだけに使う（issue #737 / 案 A）。
       *
       * Normalized title → target page id map. With duplicate titles inside
       * the same scope the **last write wins** (Map overwrite). Used by the
       * status-sync hooks to populate the `targetId` attribute on resolved
       * marks (issue #737, approach A).
       */
      pageTitleToId: Map<string, string>;
    }> => {
      if (!isLoaded || titles.length === 0) {
        return {
          pageTitles: new Set(),
          referencedTitles: new Set(),
          pageTitleToId: new Map(),
        };
      }

      const repo = await getRepository();

      // スコープに応じて候補ソースを切り替える（Issue #713 Phase 4）。
      // ノートスコープで `notePages` が未到着のときは空集合で返し、誤って
      // 「存在しない」と判定して WikiLink を壊さないようにする。
      //
      // Select the candidate source based on scope (issue #713 Phase 4).
      // If note-scope candidates have not loaded yet, return empty sets so
      // we do not mis-classify valid same-note links as missing on this pass.
      const sourcePages = pageNoteId !== null ? notePages : await repo.getPagesSummary(userId);
      if (pageNoteId !== null && sourcePages === undefined) {
        return {
          pageTitles: new Set(),
          referencedTitles: new Set(),
          pageTitleToId: new Map(),
        };
      }

      // 単一ループで `pageTitles` と `pageTitleToId` を構築する。`.map()` で
      // Set を作ってから別ループで Map を埋める旧実装は冗長で、データに対する
      // 走査が 2 回発生していた（Gemini レビュー指摘）。
      // Single pass populates both `pageTitles` and `pageTitleToId`. The
      // earlier shape used `.map()` to seed the Set and a separate loop for
      // the Map, walking the same data twice (Gemini review feedback).
      const pageTitles = new Set<string>();
      const pageTitleToId = new Map<string, string>();
      for (const p of sourcePages ?? []) {
        const normalized = p.title.toLowerCase().trim();
        pageTitles.add(normalized);
        pageTitleToId.set(normalized, p.id);
      }

      // Get ghost links to check referenced status. ノートスコープのゴースト
      // リンク追跡は未整備（backend 側の管轄）のため、v1 では個人ゴーストのみ
      // を参照する。Note-scope ghost links are handled by the server for now;
      // only personal ghost links contribute to `referencedTitles` in v1.
      // TODO(issue #713 Phase 5+): クライアント側でもノートスコープのゴースト
      // リンクを扱えるようにする（検索・MCP の整備と合わせて別 issue で対応）。
      // TODO(issue #713 Phase 5+): surface note-scope ghost links on the
      // client (tracked with the search / MCP scoping work in a follow-up).
      const ghostLinks = pageNoteId === null ? await repo.getGhostLinks(userId) : [];
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
        const otherSources = currentPageId ? sources.filter((id) => id !== currentPageId) : sources;
        if (otherSources.length > 0) {
          referencedTitles.add(normalized);
        }
      }

      return { pageTitles, referencedTitles, pageTitleToId };
    },
    [getRepository, userId, isLoaded, pageNoteId, notePages],
  );

  return { checkExistence, isLoaded };
}
