/** A page created on this device that the server has not confirmed yet. */
export interface PendingPage {
  /** Client-generated UUID; the server creates the page under this id exactly once. */
  id: string;
  noteId: string;
  title: string;
  createdAt: number;
}

/** Result of one flush: pages the server accepted and pages it refused for good. */
export interface FlushResult {
  sent: PendingPage[];
  refused: PendingPage[];
}

type KeyValueStorage = Pick<Storage, "getItem" | "setItem">;

/**
 * Queue of page creations that survives reloads, so pages can be created offline and sent
 * when the connection is back. Creating a page always goes through it, online or not.
 * A failure that may succeed later (network, 5xx) stops the flush and keeps the queue;
 * a refusal (`isPermanent`) drops that page and is reported.
 * リロードをまたいで残るページ作成キュー。オンラインでも必ずここを通し、接続が戻ったら送る。
 * 再試行で成功しうる失敗では止めて保持し、恒久的な拒否はそのページを外して報告する。
 */
export function createPageOutbox(
  storage: KeyValueStorage,
  options: { key?: string; isPermanent: (error: unknown) => boolean },
) {
  const key = options.key ?? "zedi:outbox:pages";
  const listeners = new Set<() => void>();
  let inFlight: Promise<FlushResult> | null = null;
  // Parsed once and replaced on every change, so `all()` is a stable snapshot for subscribers.
  let cache: PendingPage[] | null = null;
  const notify = () => listeners.forEach((listener) => listener());

  const read = (): PendingPage[] => {
    if (cache) return cache;
    try {
      const parsed: unknown = JSON.parse(storage.getItem(key) ?? "[]");
      cache = Array.isArray(parsed) ? (parsed as PendingPage[]) : [];
    } catch {
      cache = [];
    }
    return cache;
  };
  const write = (pages: PendingPage[]) => {
    storage.setItem(key, JSON.stringify(pages));
    cache = pages;
    notify();
  };
  const remove = (id: string) => write(read().filter((p) => p.id !== id));

  const run = async (send: (page: PendingPage) => Promise<void>): Promise<FlushResult> => {
    const result: FlushResult = { sent: [], refused: [] };
    const attempted = new Set<string>();
    // Re-read the queue after each send, so pages added during this run are sent too.
    for (;;) {
      const page = read().find((p) => !attempted.has(p.id));
      if (!page) break;
      attempted.add(page.id);
      try {
        await send(page);
        result.sent.push(page);
      } catch (error) {
        if (!options.isPermanent(error)) break;
        result.refused.push(page);
      }
      remove(page.id);
    }
    return result;
  };

  return {
    /** Every pending page; the same array until the queue changes. */
    all: read,
    list: (noteId?: string) => read().filter((p) => noteId === undefined || p.noteId === noteId),
    get: (id: string) => read().find((p) => p.id === id),
    add: (page: PendingPage) => write([...read().filter((p) => p.id !== page.id), page]),
    /** Forgets every pending page (sign-out). */
    clear: () => write([]),
    /** Re-reads storage after another tab changed it. */
    reload() {
      cache = null;
      notify();
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    /** Sends queued pages in order; overlapping calls share one run. */
    flush(send: (page: PendingPage) => Promise<void>): Promise<FlushResult> {
      inFlight ??= run(send).finally(() => {
        inFlight = null;
      });
      return inFlight;
    },
  };
}
