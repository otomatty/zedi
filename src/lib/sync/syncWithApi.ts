/**
 * C3-6: API-based sync (GET/POST /api/sync/pages).
 * Uses StorageAdapter for local state and lastSyncTime; apiClient for remote.
 * Does not sync Y.Doc content (that is on-demand when opening a page).
 */

import type { StorageAdapter } from "@/lib/storageAdapter/StorageAdapter";
import type { PageMetadata, GhostLink, Link, LinkType } from "@/lib/storageAdapter/types";
import type { ApiClient } from "@/lib/api/apiClient";
import type { SyncPageItem, SyncLinkItem, SyncGhostLinkItem } from "@/lib/api/types";

/**
 * `SyncLinkItem.link_type` / `SyncGhostLinkItem.link_type` のラベルを
 * `LinkType` に正規化する。未指定および未知の値は `'wiki'` にフォールバック
 * し、サーバ migration 前の旧データと互換を保つ (issue #725 Phase 1)。
 *
 * Normalize wire-format `link_type` into the adapter's `LinkType`. Unknown /
 * missing values fall back to `'wiki'` so legacy rows remain readable while
 * the v3 migration rolls out.
 */
function normalizeWireLinkType(value: "wiki" | "tag" | undefined | null): LinkType {
  return value === "tag" ? "tag" : "wiki";
}

function syncPageToMetadata(row: SyncPageItem): PageMetadata {
  return {
    id: row.id,
    ownerId: row.owner_id,
    // GET /api/sync/pages は個人ページ (`note_id IS NULL`) のみを返すため
    // 実運用では常に `null`。将来 `note_id` がワイヤに乗る場合に備えて値が
    // 来たらそのまま採用する。Issue #713。
    // GET /api/sync/pages only returns personal pages (`note_id IS NULL`),
    // so this is effectively always `null`. We still honor an explicit value
    // if the wire format ever carries one. Issue #713.
    noteId: row.note_id ?? null,
    sourcePageId: row.source_page_id ?? null,
    title: row.title ?? null,
    contentPreview: row.content_preview ?? null,
    thumbnailUrl: row.thumbnail_url ?? null,
    sourceUrl: row.source_url ?? null,
    createdAt:
      typeof row.created_at === "string" ? new Date(row.created_at).getTime() : row.created_at,
    updatedAt:
      typeof row.updated_at === "string" ? new Date(row.updated_at).getTime() : row.updated_at,
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
/**
 * 同期エンジンの現在ステータス。UI の SyncIndicator などで表示に使う。
 * Current status of the sync engine; surfaced by the SyncIndicator UI.
 */
export type SyncStatus = "idle" | "syncing" | "synced" | "error" | "db-resuming";
let syncStatus: SyncStatus = "idle";
const syncStatusListeners = new Set<(status: SyncStatus) => void>();

function setSyncStatus(status: SyncStatus) {
  syncStatus = status;
  syncStatusListeners.forEach((fn) => fn(status));
}

/**
 * 現在の同期ステータスを返す。
 * Return the current sync status.
 */
export function getSyncStatus(): SyncStatus {
  return syncStatus;
}

/** True until the first sync attempt (runApiSync/syncWithApi) has completed (success or error). */
export function hasNeverSynced(): boolean {
  return !hasCompletedFirstSync;
}

/**
 * 同期ステータスの変化を購読する。返り値は購読解除関数。
 * Subscribe to sync status changes; returns an unsubscribe function.
 */
export function subscribeSyncStatus(listener: (status: SyncStatus) => void): () => void {
  syncStatusListeners.add(listener);
  listener(syncStatus);
  return () => syncStatusListeners.delete(listener);
}

// Listen for db-resuming events from apiClient (503 auto-retry)
if (typeof window !== "undefined") {
  window.addEventListener("zedi:db-resuming", () => {
    setSyncStatus("db-resuming");
  });
}

/**
 * 同期処理が進行中かどうかを返す。
 * Return whether a sync run is currently in progress.
 */
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

/**
 * `syncWithApi` / `runApiSync` のオプション。
 * Options for {@link syncWithApi} and {@link runApiSync}.
 */
export type SyncWithApiOptions = {
  /** When true and local has 0 pages, do a full pull (since=omit). */
  forceFullSyncWhenLocalEmpty?: boolean;
};

/** Unwrap { ok, data } envelope at most 3 levels. */
function unwrapEnvelope(raw: unknown): unknown {
  let candidate: unknown = raw;
  for (let i = 0; i < 3; i++) {
    if (candidate && typeof candidate === "object" && "ok" in candidate && "data" in candidate) {
      candidate = (candidate as { data: unknown }).data;
    } else {
      break;
    }
  }
  return candidate;
}

/** Ensure pages, links, ghost_links are arrays; throw with descriptive message. */
function validateSyncArrays(
  obj: Record<string, unknown> | null,
  pages: unknown,
  links: unknown,
  ghostLinks: unknown,
): void {
  if (Array.isArray(pages) && Array.isArray(links) && Array.isArray(ghostLinks)) {
    return;
  }
  const keys = obj ? Object.keys(obj).join(", ") : "non-object";
  throw new TypeError(
    `[Sync/API] Invalid sync payload shape. Expected arrays: pages/links/ghost_links, got keys: ${keys}`,
  );
}

function normalizeSyncResponse(raw: unknown): {
  pages: SyncPageItem[];
  links: SyncLinkItem[];
  ghost_links: SyncGhostLinkItem[];
  server_time?: string;
} {
  const candidate = unwrapEnvelope(raw);
  const obj =
    candidate && typeof candidate === "object" ? (candidate as Record<string, unknown>) : null;

  const pages = obj?.pages ?? [];
  const links = obj?.links ?? [];
  const ghostLinks = obj?.ghost_links ?? [];
  const serverTime = obj?.server_time ?? obj?.synced_at;

  validateSyncArrays(obj, pages, links, ghostLinks);

  return {
    pages: pages as SyncPageItem[],
    links: links as SyncLinkItem[],
    ghost_links: ghostLinks as SyncGhostLinkItem[],
    server_time: typeof serverTime === "string" ? serverTime : undefined,
  };
}

function shouldSkipSync(options?: SyncWithApiOptions & { force?: boolean }): boolean {
  if (syncInProgress) return true;
  if (!options?.force && consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
    console.warn(
      `[Sync/API] Skipped: ${consecutiveFailures} consecutive failures. Use manual sync to retry.`,
    );
    return true;
  }
  return false;
}

function computeSince(
  options: SyncWithApiOptions | undefined,
  lastSync: number | null,
  localPageCount: number,
): string | undefined {
  if (options?.forceFullSyncWhenLocalEmpty && localPageCount === 0) {
    return undefined;
  }
  return lastSync ? new Date(lastSync).toISOString() : undefined;
}

/**
 * links / ghost_links を `(source, linkType)` ごとにグループ化し、
 * pulledPageIds × 全 linkType を含む組に対して保存する（stale クリア含む）。
 * issue #725 Phase 1 で linkType 次元を追加。
 *
 * Group links / ghost_links by `(source, linkType)` and persist every
 * `pulledPageIds × linkType` pair so stale edges of any type get cleared
 * even when the server returns nothing for that slot (issue #725 Phase 1).
 */
async function applyRelatedItems<T, U>(
  items: T[],
  pulledPageIds: Set<string>,
  linkTypes: readonly LinkType[],
  getSourceId: (item: T) => string,
  getLinkType: (item: T) => LinkType,
  mapToLocal: (items: T[]) => U[],
  saveFn: (sourceId: string, localItems: U[], linkType: LinkType) => Promise<void>,
): Promise<void> {
  const bySourceType = new Map<string, T[]>();
  const key = (sid: string, t: LinkType) => `${sid} ${t}`;
  const presentSourceIds = new Set<string>();
  for (const item of items) {
    const sid = getSourceId(item);
    const t = getLinkType(item);
    presentSourceIds.add(sid);
    const k = key(sid, t);
    const list = bySourceType.get(k) ?? [];
    list.push(item);
    bySourceType.set(k, list);
  }
  const allSourceIds = new Set([...pulledPageIds, ...presentSourceIds]);
  for (const sourceId of allSourceIds) {
    for (const t of linkTypes) {
      const bucket = bySourceType.get(key(sourceId, t)) ?? [];
      await saveFn(sourceId, mapToLocal(bucket), t);
    }
  }
}

async function applyPull(
  adapter: StorageAdapter,
  res: {
    pages: SyncPageItem[];
    links: SyncLinkItem[];
    ghost_links: SyncGhostLinkItem[];
  },
): Promise<void> {
  const pulledPageIds = new Set(res.pages.map((p) => p.id));

  for (const row of res.pages) {
    const meta = syncPageToMetadata(row);
    const local = await adapter.getPage(meta.id);
    if (local && local.updatedAt > meta.updatedAt) continue;
    // thumbnailUrl はクライアント側で extractFirstImage から生成されるため、
    // サーバーが null を返してもローカルの値を保持する。
    // Preserve local thumbnailUrl when server returns null, since it is
    // derived client-side via extractFirstImage.
    if (local && meta.thumbnailUrl == null && local.thumbnailUrl != null) {
      meta.thumbnailUrl = local.thumbnailUrl;
    }
    await adapter.upsertPage(meta);
  }

  // issue #725 Phase 1: `link_type` を明示的に含むクライアント/サーバの組み合わせ
  // でのみ tag バケットの stale クリアを走らせる。pre-#725 のサーバやキャッシュ
  // された旧レスポンスは `link_type` を含まないため、そうした payload で tag
  // バケットを強制的に空保存するとローカルの tag エッジを誤って消してしまう。
  // そこで「ペイロード全体に 1 行でも explicit な `link_type` があれば wire が
  // link_type を理解している」とみなし、その場合のみ全種別を対象にする。
  //
  // Only clear the `'tag'` bucket when the payload proves the server speaks
  // `link_type` (issue #725 Phase 1). A pre-#725 server or any cached legacy
  // response omits `link_type`, and enumerating all link types would otherwise
  // silently erase local tag edges during a mixed-version rollout. If at least
  // one row carries an explicit `link_type`, we trust the wire to cover every
  // bucket; otherwise we only touch `'wiki'`.
  const hasExplicitLinkType = (items: Array<{ link_type?: "wiki" | "tag" }>): boolean =>
    items.some((row) => row.link_type !== undefined);
  const linkTypesForLinks: readonly LinkType[] = hasExplicitLinkType(res.links)
    ? (["wiki", "tag"] as const)
    : (["wiki"] as const);
  const linkTypesForGhosts: readonly LinkType[] = hasExplicitLinkType(res.ghost_links)
    ? (["wiki", "tag"] as const)
    : (["wiki"] as const);

  await applyRelatedItems<SyncLinkItem, Link>(
    res.links,
    pulledPageIds,
    linkTypesForLinks,
    (l) => l.source_id,
    (l) => normalizeWireLinkType(l.link_type),
    (items) =>
      items.map((l) => ({
        sourceId: l.source_id,
        targetId: l.target_id,
        linkType: normalizeWireLinkType(l.link_type),
        createdAt:
          typeof l.created_at === "string" ? new Date(l.created_at).getTime() : l.created_at,
      })),
    (sourceId, links, linkType) => adapter.saveLinks(sourceId, links, linkType),
  );

  await applyRelatedItems<SyncGhostLinkItem, GhostLink>(
    res.ghost_links,
    pulledPageIds,
    linkTypesForGhosts,
    (g) => g.source_page_id,
    (g) => normalizeWireLinkType(g.link_type),
    (items) =>
      items.map((g) => ({
        linkText: g.link_text,
        sourcePageId: g.source_page_id,
        linkType: normalizeWireLinkType(g.link_type),
        createdAt:
          typeof g.created_at === "string" ? new Date(g.created_at).getTime() : g.created_at,
        originalTargetPageId: g.original_target_page_id ?? null,
        originalNoteId: g.original_note_id ?? null,
      })),
    (sourcePageId, ghostLinks, linkType) =>
      adapter.saveGhostLinks(sourcePageId, ghostLinks, linkType),
  );
}

function getPagesForPush(
  lastSync: number | null,
  allLocalPages: PageMetadata[],
  pulledPageIds: Set<string>,
): PageMetadata[] {
  // ノートネイティブページ（issue #713）は POST /api/sync/pages では LWW
  // 対象外。サーバー側でも skip されるが、誤って IndexedDB に入った場合に
  // 余計なリクエストを発生させないよう、push 前にも除外する。
  // Drop note-native rows (issue #713) before push — the server skips them
  // anyway, but filtering here avoids needless wire traffic if any sneak in.
  const personalOnly = allLocalPages.filter((p) => (p.noteId ?? null) === null);
  return lastSync
    ? personalOnly.filter((p) => p.updatedAt > lastSync && !pulledPageIds.has(p.id))
    : personalOnly;
}

async function finishSyncNoPush(
  adapter: StorageAdapter,
  res: { server_time?: string },
): Promise<void> {
  const newSyncTime = res.server_time ? new Date(res.server_time).getTime() : Date.now();
  await adapter.setLastSyncTime(newSyncTime);
  consecutiveFailures = 0;
  setSyncStatus("synced");
}

function finishSyncIfNoPushNeeded(
  adapter: StorageAdapter,
  res: { server_time?: string },
  isInitialSync: boolean,
  localPageCount: number,
  pagesForPush: PageMetadata[],
): Promise<boolean> {
  const noPush = (isInitialSync && localPageCount === 0) || pagesForPush.length === 0;
  if (!noPush) return Promise.resolve(false);
  return finishSyncNoPush(adapter, res).then(() => true);
}

async function pushPagesToApi(
  api: ApiClient,
  pushPages: PostSyncPageItem[],
  pushLinks: Array<{
    source_id: string;
    target_id: string;
    link_type: LinkType;
    created_at: string;
  }>,
  pushGhostLinks: Array<{
    link_text: string;
    source_page_id: string;
    link_type: LinkType;
    created_at: string;
    original_target_page_id: string | null;
    original_note_id: string | null;
  }>,
): Promise<void> {
  if (pushPages.length > PAGE_PUSH_CHUNK_SIZE) {
    for (let i = 0; i < pushPages.length; i += PAGE_PUSH_CHUNK_SIZE) {
      const chunk = pushPages.slice(i, i + PAGE_PUSH_CHUNK_SIZE);
      const isLastChunk = i + PAGE_PUSH_CHUNK_SIZE >= pushPages.length;
      await api.postSyncPages({
        pages: chunk,
        links: isLastChunk ? pushLinks : undefined,
        ghost_links: isLastChunk ? pushGhostLinks : undefined,
      });
    }
  } else {
    await api.postSyncPages({
      pages: pushPages,
      links: pushLinks,
      ghost_links: pushGhostLinks,
    });
  }
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
  options?: SyncWithApiOptions & {
    /** Skip the consecutive-failure guard (for manual sync). */ force?: boolean;
  },
): Promise<void> {
  if (shouldSkipSync(options)) return;

  try {
    syncInProgress = true;
    setSyncStatus("syncing");
    await adapter.initialize(userId);

    const lastSync = await adapter.getLastSyncTime();
    const allPages = await adapter.getAllPages();
    const localPageCount = allPages.length;
    const since = computeSince(options, lastSync, localPageCount);
    const isInitialSync = since === undefined;

    const res = normalizeSyncResponse(await api.getSyncPages(since));
    await applyPull(adapter, res);

    const pulledPageIds = new Set(res.pages.map((r) => r.id));
    const allLocalPages = await adapter.getAllPages();
    const pagesForPush = getPagesForPush(lastSync, allLocalPages, pulledPageIds);

    if (await finishSyncIfNoPushNeeded(adapter, res, isInitialSync, localPageCount, pagesForPush)) {
      return;
    }

    const pushPages: PostSyncPageItem[] = pagesForPush.map(metadataToSyncPage);
    const allLinks: Link[] = [];
    const allGhostLinks: GhostLink[] = [];
    for (const p of pagesForPush) {
      // 全種別をまとめて引く（linkType 指定なし = すべて）。サーバ側で
      // `(source_id, link_type)` ペア単位に DELETE/INSERT される。
      // Read every linkType; the server applies DELETE/INSERT scoped per
      // `(source_id, link_type)` pair (issue #725 Phase 1).
      const links = await adapter.getLinks(p.id);
      allLinks.push(...links);
      const ghosts = await adapter.getGhostLinks(p.id);
      allGhostLinks.push(...ghosts);
    }
    const pushLinks = allLinks.map((l) => ({
      source_id: l.sourceId,
      target_id: l.targetId,
      link_type: l.linkType,
      created_at: new Date(l.createdAt).toISOString(),
    }));
    const pushGhostLinks = allGhostLinks.map((g) => ({
      link_text: g.linkText,
      source_page_id: g.sourcePageId,
      link_type: g.linkType,
      created_at: new Date(g.createdAt).toISOString(),
      original_target_page_id: g.originalTargetPageId ?? null,
      original_note_id: g.originalNoteId ?? null,
    }));

    await pushPagesToApi(api, pushPages, pushLinks, pushGhostLinks);

    const newSyncTime = res.server_time ? new Date(res.server_time).getTime() : Date.now();
    await adapter.setLastSyncTime(newSyncTime);
    consecutiveFailures = 0;
    setSyncStatus("synced");
  } catch (error) {
    consecutiveFailures++;
    console.error(
      `[Sync/API] Failed (attempt ${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES}):`,
      error,
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
 * StorageAdapter と ApiClient を組み立てて `syncWithApi` を実行する高レベル API。
 * アプリ起動時の初回同期や手動再同期から呼ばれる。
 *
 * High-level wrapper that builds a StorageAdapter + ApiClient and delegates to
 * {@link syncWithApi}. Used by initial load and manual re-sync paths.
 */
export async function runApiSync(
  userId: string,
  getToken: () => Promise<string | null>,
  options?: SyncWithApiOptions & { force?: boolean },
): Promise<void> {
  const { createStorageAdapter } = await import("@/lib/storageAdapter");
  const { createApiClient } = await import("@/lib/api");
  const adapter = createStorageAdapter();
  const api = createApiClient({ getToken });
  await syncWithApi(adapter, api, userId, options);
}

/**
 * @deprecated Use runApiSync instead.
 */
export const runAuroraSync = runApiSync;
