import { QueryClient, type InfiniteData } from "@tanstack/query-core";
import { useEffect, useState } from "hono/jsx/dom";
import type { PageListItem, PageListResponse } from "../shared/types";
import { ApiError, searchPages } from "./api";
import { lazyPage } from "./lib/lazy";
import { searchLoadedPages } from "./lib/localSearch";
import { QueryClientContext, useQuery } from "./lib/query";
import { shouldInterceptClick } from "./lib/router";
import type { Me } from "./lib/session";
import {
  clearOfflineData,
  pageOutbox,
  pendingPageDetail,
  syncPendingPages,
  useOnline,
} from "./offline";
import { NotesPage } from "./pages/NotesPage";
import { SignInPage } from "./pages/SignInPage";
import { router, useRoute } from "./routing";
import { session, useSession } from "./session";
import { CommandPalette } from "./ui/CommandPalette";

const EditorPage = lazyPage<{ id: string; defaultNoteId: string }>(
  () => import("./pages/EditorPage"),
);
const AiChatPage = lazyPage<Record<string, never>>(() => import("./pages/AiChatPage"));

// `offlineFirst`: run query functions even when the browser reports offline, so the
// service worker can answer from its cache instead of the query staying paused.
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, networkMode: "offlineFirst" } },
});

/** Pages this device already has: loaded list rows and pages created offline. */
function loadedPages(noteId: string): PageListItem[] {
  const list = queryClient.getQueryData<InfiniteData<PageListResponse>>(["pages", noteId]);
  return [
    ...pageOutbox.list(noteId).map(pendingPageDetail),
    ...(list?.pages.flatMap((page) => page.items) ?? []),
  ];
}

/**
 * Server full-text search, or a title/preview match over loaded pages when the network is
 * unreachable (an HTTP error from the server is still an error).
 * サーバーの全文検索。ネットワークに届かないときは読み込み済みページを照合する。
 */
async function searchWithFallback(noteId: string, query: string) {
  if (!query) return { items: [], offline: false };
  try {
    return { items: (await searchPages(query)).items, offline: false };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    return { items: searchLoadedPages(loadedPages(noteId), query), offline: true };
  }
}

/** Sends pages created offline at start-up and whenever the connection comes back. */
function usePendingPageSync(onRefused: (titles: string[]) => void) {
  useEffect(() => {
    const sync = () =>
      void syncPendingPages(queryClient).then((result) => {
        if (result.refused.length > 0) onRefused(result.refused.map((page) => page.title));
      });
    sync();
    window.addEventListener("online", sync);
    return () => window.removeEventListener("online", sync);
  }, [onRefused]);
}

/** Lets the router handle same-origin `<a href>` clicks (API links such as magic links are left alone). */
function useLinkInterception() {
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const anchor = (event.target as Element | null)?.closest?.("a[href]");
      if (!(anchor instanceof HTMLAnchorElement) || anchor.pathname.startsWith("/api/")) return;
      const target = {
        origin: anchor.origin,
        target: anchor.target,
        hasDownload: anchor.hasAttribute("download"),
      };
      if (!shouldInterceptClick(event, target, location.origin)) return;
      event.preventDefault();
      router.navigate(anchor.pathname + anchor.search);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);
}

/** Debounces a fast-changing value (palette input) before it hits the search API. */
function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

/** The persistent shell: sidebar, ⌘K palette and the routed page stay mounted across navigation. */
function Shell({ me }: { me: Me }) {
  const route = useRoute();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [refused, setRefused] = useState<string[]>([]);
  const online = useOnline();
  const debouncedQuery = useDebounced(query.trim(), 150);
  const results = useQuery({
    queryKey: ["search", debouncedQuery],
    queryFn: () => searchWithFallback(me.defaultNoteId, debouncedQuery),
    staleTime: 10_000,
  });
  useLinkInterception();
  usePendingPageSync(setRefused);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const signOut = async () => {
    const { authClient } = await import("./authClient");
    await authClient.signOut();
    await clearOfflineData();
    queryClient.clear();
    session.signOut();
    router.navigate("/notes", { replace: true });
  };

  const paletteItems = (results.data?.items ?? []).map((p) => ({ id: p.id, label: p.title }));

  return (
    <div class="shell">
      <nav class="sidebar" aria-label="メイン">
        <a class="brand" href="/notes">
          Zedi
        </a>
        <a href="/notes" aria-current={route?.value === "notes" ? "page" : undefined}>
          ノート一覧
        </a>
        <a href="/ai" aria-current={route?.value === "ai" ? "page" : undefined}>
          AI チャット
        </a>
        <button type="button" class="search-button" onClick={() => setPaletteOpen(true)}>
          検索 <kbd>⌘K</kbd>
        </button>
        <div class="account">
          <span class="muted" data-testid="account-email">
            {me.user.email}
          </span>
          <button
            type="button"
            class="link-button"
            disabled={!online}
            title={
              online ? undefined : "オフライン中は未同期の変更を守るためサインアウトできません"
            }
            onClick={() => void signOut()}
          >
            サインアウト
          </button>
        </div>
      </nav>
      <main class="content">
        {!online && (
          <p role="status" class="offline-banner" data-testid="offline-banner">
            オフラインです。編集とページ作成はこの端末に保存され、接続が戻ると同期されます。
          </p>
        )}
        {refused.length > 0 && (
          <p role="alert" class="offline-banner">
            次のページはサーバーに作成できませんでした: {refused.join("、")}
          </p>
        )}
        {route?.value === "notes" && <NotesPage noteId={me.defaultNoteId} />}
        {route?.value === "editor" && (
          <EditorPage id={route.params.id ?? ""} defaultNoteId={me.defaultNoteId} />
        )}
        {route?.value === "ai" && <AiChatPage />}
        {!route && <p class="muted">ページが見つかりません。</p>}
      </main>
      {paletteOpen && (
        <CommandPalette
          open
          items={paletteItems}
          filterLocally={false}
          placeholder={
            online
              ? "全文検索（3 文字以上は索引、2 文字以下は部分一致）"
              : "オフライン検索（読み込み済みページのタイトルと冒頭のみ）"
          }
          onQueryChange={setQuery}
          onClose={() => setPaletteOpen(false)}
          onSelect={(item) => {
            setPaletteOpen(false);
            router.navigate(`/notes/${item.id}`);
          }}
        />
      )}
    </div>
  );
}

function Gate() {
  const state = useSession();
  useEffect(() => {
    void session.refresh();
  }, []);
  if (state.status === "loading") return <p class="muted splash">読み込み中…</p>;
  if (state.status === "unavailable") {
    return (
      <div class="splash">
        <p role="alert">
          サーバーに接続できません。オフラインで使うには一度オンラインで開いてください。
        </p>
        <button type="button" class="primary-button" onClick={() => void session.refresh()}>
          再試行
        </button>
      </div>
    );
  }
  if (state.status === "signedOut") return <SignInPage />;
  return <Shell me={state.me} />;
}

/**
 * Root component of the hono/jsx/dom SPA: session gate + persistent shell.
 * hono/jsx/dom SPA のルート。セッションで出し分け、シェルを常駐させる。
 */
export function App() {
  return (
    <QueryClientContext.Provider value={queryClient}>
      <Gate />
    </QueryClientContext.Provider>
  );
}
