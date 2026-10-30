import { QueryClient } from "@tanstack/query-core";
import { useEffect, useState } from "hono/jsx/dom";
import { allNotesQuery } from "./api";
import { lazyPage } from "./lib/lazy";
import { QueryClientContext, useQuery } from "./lib/query";
import { shouldInterceptClick } from "./lib/router";
import { NotesPage } from "./pages/NotesPage";
import { router, useRoute } from "./routing";
import { CommandPalette } from "./ui/CommandPalette";

const EditorPage = lazyPage<{ id: string }>(() => import("./pages/EditorPage"));
const AiChatPage = lazyPage<Record<string, never>>(() => import("./pages/AiChatPage"));

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1 } } });

/** Lets the router handle same-origin `<a href>` clicks anywhere in the app. */
function useLinkInterception() {
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const anchor = (event.target as Element | null)?.closest?.("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
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

/** The persistent shell: sidebar, ⌘K palette and the routed page stay mounted across navigation. */
function Shell() {
  const route = useRoute();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const notes = useQuery(allNotesQuery);
  useLinkInterception();

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

  const paletteItems = (notes.data?.items ?? []).map((n) => ({ id: n.id, label: n.title }));

  return (
    <div class="shell">
      <nav class="sidebar" aria-label="メイン">
        <a class="brand" href="/notes">
          Zedi PoC
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
      </nav>
      <main class="content">
        {route?.value === "notes" && <NotesPage />}
        {route?.value === "editor" && <EditorPage id={route.params.id ?? ""} />}
        {route?.value === "ai" && <AiChatPage />}
        {!route && <p class="muted">ページが見つかりません。</p>}
      </main>
      {paletteOpen && (
        <CommandPalette
          open
          items={paletteItems}
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

/**
 * Root component of the hono/jsx/dom SPA.
 * hono/jsx/dom SPA のルートコンポーネント。
 */
export function App() {
  return (
    <QueryClientContext.Provider value={queryClient}>
      <Shell />
    </QueryClientContext.Provider>
  );
}
