import type { QueryClient } from "@tanstack/query-core";
import { useCallback, useSyncExternalStore } from "hono/jsx/dom";
import type { PageDetail } from "../shared/types";
import { ApiError, createPage } from "./api";
import { createPageOutbox, type FlushResult, type PendingPage } from "./lib/outbox";

/**
 * Prefix of the service worker's API cache (`API_CACHE` in sw/strategy.ts). Not imported from
 * there: a module shared with the app would become a chunk the classic service worker cannot load.
 */
export const API_CACHE_PREFIX = "zedi-api-";

/** IndexedDB name of a page's local Y.js copy (y-indexeddb). */
export const pageDocName = (pageId: string) => `zedi:page:${pageId}`;

const OUTBOX_KEY = "zedi:outbox:pages";

function deviceStorage(): Pick<Storage, "getItem" | "setItem"> {
  try {
    localStorage.getItem(OUTBOX_KEY);
    return localStorage;
  } catch {
    // Storage blocked (private mode, policies): keep the queue for this tab only.
    const data = new Map<string, string>();
    return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
  }
}

/** Statuses a retry cannot fix; anything else (401 after the session expired offline, 408, 425, 429, 5xx, network) keeps the page queued. */
const PERMANENT_STATUSES = new Set([400, 403, 404, 409, 410, 413, 422]);

/**
 * Whether the server refused a page creation for good, so it should leave the queue.
 * ページ作成をサーバーが恒久的に拒否したか（キューから外すべきか）。
 */
export const isPermanentRefusal = (error: unknown) =>
  error instanceof ApiError && PERMANENT_STATUSES.has(error.status);

/** Pages created on this device and not yet confirmed by the server. */
export const pageOutbox = createPageOutbox(deviceStorage(), {
  key: OUTBOX_KEY,
  isPermanent: isPermanentRefusal,
});

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key === OUTBOX_KEY) pageOutbox.reload();
  });
}

/**
 * Sends queued page creations and refreshes the lists and pages they affect.
 * 未送信のページ作成を送り、影響する一覧とページを再取得させる。
 */
export async function syncPendingPages(client: QueryClient): Promise<FlushResult> {
  const result = await pageOutbox.flush(async (page) => {
    await createPage(page.noteId, page.title, page.id);
  });
  for (const page of [...result.sent, ...result.refused]) {
    void client.invalidateQueries({ queryKey: ["pages", page.noteId] });
    void client.invalidateQueries({ queryKey: ["page", page.id] });
  }
  return result;
}

/** How a page created offline is shown before the server knows it. */
export const pendingPageDetail = (page: PendingPage): PageDetail => ({
  id: page.id,
  noteId: page.noteId,
  title: page.title,
  preview: "",
  updatedAt: page.createdAt,
  role: "editor",
});

/** Subscribes a component to the pending page creations. */
export function usePendingPages(): readonly PendingPage[] {
  const subscribe = useCallback((notify: () => void) => pageOutbox.subscribe(notify), []);
  return useSyncExternalStore(subscribe, pageOutbox.all);
}

/** Subscribes a component to the browser's online state. */
export function useOnline(): boolean {
  const subscribe = useCallback((notify: () => void) => {
    window.addEventListener("online", notify);
    window.addEventListener("offline", notify);
    return () => {
      window.removeEventListener("online", notify);
      window.removeEventListener("offline", notify);
    };
  }, []);
  return useSyncExternalStore(subscribe, () => navigator.onLine);
}

/**
 * Removes what this device keeps for offline use: cached API responses, local page copies and
 * the queue of unsent pages. Called on sign-out so the next user of the browser cannot read them
 * (sign-out is blocked while offline, so the queue is normally empty by then).
 * オフライン用に端末へ保存したもの（API 応答のキャッシュ、ページのローカル複製、未送信の
 * ページ）を消す。
 */
export async function clearOfflineData(): Promise<void> {
  pageOutbox.clear();
  if ("caches" in window) {
    const names = await caches.keys();
    await Promise.all(
      names.filter((n) => n.startsWith(API_CACHE_PREFIX)).map((n) => caches.delete(n)),
    );
  }
  const databases = (await indexedDB.databases?.()) ?? [];
  await Promise.all(
    databases
      .map((db) => db.name)
      .filter((name): name is string => !!name && name.startsWith("zedi:page:"))
      .map(
        (name) =>
          new Promise<void>((resolve) => {
            const request = indexedDB.deleteDatabase(name);
            request.onsuccess = request.onerror = request.onblocked = () => resolve();
          }),
      ),
  );
}
