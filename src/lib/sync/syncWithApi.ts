/**
 * C3-6: API-based sync (GET/POST /api/sync/pages).
 * Uses StorageAdapter for local state and lastSyncTime; apiClient for remote.
 * Does not sync Y.Doc content (that is on-demand when opening a page).
 */

import type { StorageAdapter } from "@/lib/storageAdapter/StorageAdapter";
import type { PageMetadata, Link, GhostLink } from "@/lib/storageAdapter/types";
import type { ApiClient } from "@/lib/api/apiClient";
import type { SyncPageItem, SyncLinkItem, SyncGhostLinkItem } from "@/lib/api/types";

function syncPageToMetadata(row: SyncPageItem): PageMetadata {
  return {
    id: row.id,
    ownerId: row.owner_id,
    sourcePageId: row.source_page_id ?? null,
    title: row.title ?? null,
    contentPreview: row.content_preview ?? null,
    thumbnailUrl: row.thumbnail_url ?? null,
    sourceUrl: row.source_url ?? null,
    createdAt: typeof row.created_at === "string" ? new Date(row.created_at).getTime() : row.created_at,
    updatedAt: typeof row.updated_at === "string" ? new Date(row.updated_at).getTime() : row.updated_at,
    isDeleted: row.is_deleted === true,
  };
}

function metadataToSyncPage(p: PageMetadata): PostSyncPageItem {
  return {
    id: p.id,
    owner_id: p.ownerId,
    source_page_id: p.sourcePageId,
    title: p.title,
    content_preview: p.contentPreview,
    thumbnail_url: p.thumbnailUrl,
    source_url: p.sourceUrl,
    updated_at: new Date(p.updatedAt).toISOString(),
    is_deleted: p.isDeleted,
  };
}

interface PostSyncPageItem {
  id: string;
  owner_id: string;
  source_page_id?: string | null;
  title?: string | null;
  content_preview?: string | null;
  thumbnail_url?: string | null;
  source_url?: string | null;
  updated_at: string;
  is_deleted?: boolean;
}

let syncInProgress = false;
let hasCompletedFirstSync = false;
/** Number of consecutive sync failures (reset on success). */
let consecutiveFailures = 0;
/** Maximum consecutive failures before giving up automatic retries. */
const MAX_CONSECUTIVE_FAILURES = 3;
const PAGE_PUSH_CHUNK_SIZE = 100;
export type SyncStatus = "idle" | "syncing" | "synced" | "error";
let syncStatus: SyncStatus = "idle";
const syncStatusListeners = new Set<(status: SyncStatus) => void>();

function setSyncStatus(status: SyncStatus) {
  syncStatus = status;
  syncStatusListeners.forEach((fn) => fn(status));
}

export function getSyncStatus(): SyncStatus {
  return syncStatus;
}

/** True until the first sync attempt (runAuroraSync/syncWithApi) has completed (success or error). C3-11. */
export function hasNeverSynced(): boolean {
  return !hasCompletedFirstSync;
}

export function subscribeSyncStatus(listener: (status: SyncStatus) => void): () => void {
  syncStatusListeners.add(listener);
  listener(syncStatus);
  return () => syncStatusListeners.delete(listener);
}

export function isSyncInProgress(): boolean {
  return syncInProgress;
}

/** True when consecutive failures have exceeded the automatic retry limit. */
export function isSyncDisabledByErrors(): boolean {
  return consecutiveFailures >= MAX_CONSECUTIVE_FAILURES;
}

/** Reset failure counter (e.g. when user manually triggers sync). */
export function resetSyncFailures(): void {
  consecutiveFailures = 0;
}

export type SyncWithApiOptions = {
  /** When true and local has 0 pages, do a full pull (since=omit). */
  forceFullSyncWhenLocalEmpty?: boolean;
};

function normalizeSyncResponse(raw: unknown): {
  pages: SyncPageItem[];
  links: SyncLinkItem[];
  ghost_links: SyncGhostLinkItem[];
  server_time?: string;
} {
  let candidate: unknown = raw;

  // Be robust to accidentally wrapped envelopes: { ok, data }.
  for (let i = 0; i < 3; i++) {
    if (
      candidate &&
      typeof candidate === "object" &&
      "ok" in candidate &&
      "data" in candidate
    ) {
      candidate = (candidate as { data: unknown }).data;
      continue;
    }
    break;
  }

  const obj =
    candidate && typeof candidate === "object"
      ? (candidate as Record<string, unknown>)
      : null;

  const pages = obj?.pages;
  const links = obj?.links;
  const ghostLinks = obj?.ghost_links;
  const serverTime = obj?.server_time;

  if (!Array.isArray(pages) || !Array.isArray(links) || !Array.isArray(ghostLinks)) {
    const keys = obj ? Object.keys(obj).join(", ") : "non-object";
    throw new TypeError(
      `[Sync/API] Invalid sync payload shape. Expected arrays: pages/links/ghost_links, got keys: ${keys}`
    );
  }

  return {
    pages: pages as SyncPageItem[],
    links: links as SyncLinkItem[],
    ghost_links: ghostLinks as SyncGhostLinkItem[],
    server_time: typeof serverTime === "string" ? serverTime : undefined,
  };
}

/**
 * Sync with backend using GET/POST /api/sync/pages.
 * Pull: apply server pages/links/ghost_links to adapter.
 * Push: send adapter pages/links/ghost_links to server (LWW).
 * lastSyncTime is read/written via adapter.
 */
export async function syncWithApi(
  adapter: StorageAdapter,
  api: ApiClient,
  userId: string,
  options?: SyncWithApiOptions & { /** Skip the consecutive-failure guard (for manual sync). */ force?: boolean }
): Promise<void> {
  if (syncInProgress) {
    console.log("[Sync/API] Skipped: sync already in progress");
    return;
  }

  if (!options?.force && consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
    console.warn(
      `[Sync/API] Skipped: ${consecutiveFailures} consecutive failures. Use manual sync to retry.`
    );
    return;
  }

  try {
    syncInProgress = true;
    setSyncStatus("syncing");
    await adapter.initialize(userId);

    const lastSync = await adapter.getLastSyncTime();
    const allPages = await adapter.getAllPages();
    const localPageCount = allPages.length;
    const since =
      options?.forceFullSyncWhenLocalEmpty && localPageCount === 0
        ? undefined
        : lastSync
          ? new Date(lastSync).toISOString()
          : undefined;
    const isInitialSync = since === undefined;

    console.log(
      `[Sync/API] Starting ${isInitialSync ? "initial" : "delta"} sync (since: ${since ?? "full"})`
    );

    // --- PULL ---
    const res = normalizeSyncResponse(await api.getSyncPages(since));
    for (const row of res.pages) {
      const meta = syncPageToMetadata(row);
      await adapter.upsertPage(meta);
    }

    const linkBySource = new Map<string, SyncLinkItem[]>();
    for (const l of res.links) {
      const list = linkBySource.get(l.source_id) ?? [];
      list.push(l);
      linkBySource.set(l.source_id, list);
    }
    for (const [sourceId, items] of linkBySource) {
      const links: Link[] = items.map((l) => ({
        sourceId: l.source_id,
        targetId: l.target_id,
        createdAt: typeof l.created_at === "string" ? new Date(l.created_at).getTime() : l.created_at,
      }));
      await adapter.saveLinks(sourceId, links);
    }

    const ghostBySource = new Map<string, SyncGhostLinkItem[]>();
    for (const g of res.ghost_links) {
      const list = ghostBySource.get(g.source_page_id) ?? [];
      list.push(g);
      ghostBySource.set(g.source_page_id, list);
    }
    for (const [sourcePageId, items] of ghostBySource) {
      const ghostLinks: GhostLink[] = items.map((g) => ({
        linkText: g.link_text,
        sourcePageId: g.source_page_id,
        createdAt: typeof g.created_at === "string" ? new Date(g.created_at).getTime() : g.created_at,
        originalTargetPageId: g.original_target_page_id ?? null,
        originalNoteId: g.original_note_id ?? null,
      }));
      await adapter.saveGhostLinks(sourcePageId, ghostLinks);
    }

    // --- PUSH ---
    // If local was empty before initial full pull, pushing pulled server data
    // back immediately is redundant and can take a very long time.
    if (isInitialSync && localPageCount === 0) {
      console.log("[Sync/API] Skip push: local was empty before initial full pull");
      const newSyncTime = res.server_time ? new Date(res.server_time).getTime() : Date.now();
      await adapter.setLastSyncTime(newSyncTime);
      consecutiveFailures = 0; // Reset on success
      setSyncStatus("synced");
      console.log(
        `[Sync/API] Completed (pull-only): pulled ${res.pages.length} pages, pushed 0 pages`
      );
      return;
    }

    const pagesForPush = await adapter.getAllPages();
    const pushPages: PostSyncPageItem[] = pagesForPush.map(metadataToSyncPage);

    const allLinks: Array<{ sourceId: string; targetId: string; createdAt: number }> = [];
    const allGhostLinks: Array<GhostLink> = [];
    for (const p of pagesForPush) {
      const links = await adapter.getLinks(p.id);
      allLinks.push(...links);
      const ghosts = await adapter.getGhostLinks(p.id);
      allGhostLinks.push(...ghosts);
    }

    const pushLinks = allLinks.map((l) => ({
      source_id: l.sourceId,
      target_id: l.targetId,
      created_at: new Date(l.createdAt).toISOString(),
    }));
    const pushGhostLinks = allGhostLinks.map((g) => ({
      link_text: g.linkText,
      source_page_id: g.sourcePageId,
      created_at: new Date(g.createdAt).toISOString(),
      original_target_page_id: g.originalTargetPageId ?? null,
      original_note_id: g.originalNoteId ?? null,
    }));

    // POST /api/sync/pages can time out with large page counts (Lambda 30s).
    // Send pages in chunks, then send links/ghost_links once.
    if (pushPages.length > PAGE_PUSH_CHUNK_SIZE) {
      console.log(
        `[Sync/API] Pushing ${pushPages.length} pages in chunks of ${PAGE_PUSH_CHUNK_SIZE}`
      );
      for (let i = 0; i < pushPages.length; i += PAGE_PUSH_CHUNK_SIZE) {
        const chunk = pushPages.slice(i, i + PAGE_PUSH_CHUNK_SIZE);
        await api.postSyncPages({ pages: chunk });
      }
      await api.postSyncPages({
        pages: [],
        links: pushLinks,
        ghost_links: pushGhostLinks,
      });
    } else {
      await api.postSyncPages({
        pages: pushPages,
        links: pushLinks,
        ghost_links: pushGhostLinks,
      });
    }

    const newSyncTime = res.server_time ? new Date(res.server_time).getTime() : Date.now();
    await adapter.setLastSyncTime(newSyncTime);

    consecutiveFailures = 0; // Reset on success
    setSyncStatus("synced");
    console.log(
      `[Sync/API] Completed: pulled ${res.pages.length} pages, pushed ${pushPages.length} pages`
    );
  } catch (error) {
    consecutiveFailures++;
    console.error(
      `[Sync/API] Failed (attempt ${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES}):`,
      error
    );
    setSyncStatus("error");
    throw error;
  } finally {
    syncInProgress = false;
    hasCompletedFirstSync = true;
    if (syncStatus === "syncing") setSyncStatus("idle");
  }
}

/**
 * Run sync using createStorageAdapter() and createApiClient(getToken).
 * Call this when the app uses StorageAdapter as the data source (after C3-7).
 */
export async function runAuroraSync(
  userId: string,
  getToken: () => Promise<string | null>,
  options?: SyncWithApiOptions & { force?: boolean }
): Promise<void> {
  const { createStorageAdapter } = await import("@/lib/storageAdapter");
  const { createApiClient } = await import("@/lib/api");
  const adapter = createStorageAdapter();
  const api = createApiClient({ getToken });
  await syncWithApi(adapter, api, userId, options);
}
