import { useEffect, useRef, useState } from "hono/jsx/dom";
import { IndexeddbPersistence } from "y-indexeddb";
import YProvider from "y-partyserver/provider";
import * as Y from "yjs";
import { ApiError, fetchPage, fetchPageList, searchPages } from "../api";
import { createEditor, type LinkTarget } from "../editor/createEditor";
import { isLongPage, watchPageSize } from "../editor/pageSize";
import { useQuery } from "../lib/query";
import { pageDocName, pageOutbox, pendingPageDetail, useOnline, usePendingPages } from "../offline";
import { LONG_PAGE_BLOCKS } from "../../shared/import/splitDocument";

const COLORS = ["#2563eb", "#db2777", "#16a34a", "#ea580c", "#7c3aed"];
const STATUS_LABEL = {
  connecting: "接続中",
  synced: "同期済み",
  offline: "オフライン（この端末に保存）",
  local: "未同期（ページ作成待ち）",
} as const;

const caretMode = (value: string | null) =>
  value === "0" ? "off" : value === "tiptap" ? "tiptap" : "shared";

/**
 * WikiLink suggestions: full-text search for a query, the note's recent pages otherwise.
 * WikiLink 候補。入力があれば全文検索、なければノートの最近のページ。
 */
async function searchTargets(noteId: string, query: string): Promise<LinkTarget[]> {
  const items = query.trim()
    ? (await searchPages(query)).items
    : (await fetchPageList(noteId, null)).items;
  return items.slice(0, 8).map((p) => ({ id: p.id, title: p.title }));
}

/**
 * Collaborative editor page (lazy-loaded chunk): Tiptap + Y.js synced through the
 * `PageRoom` Durable Object via y-partyserver. The WebSocket carries the session cookie,
 * and viewers get a read-only editor.
 * 共同編集ページ（遅延読み込み）。WebSocket はセッション Cookie で認可され、閲覧者は読み取り専用。
 */
export default function EditorPage({ id, defaultNoteId }: { id: string; defaultNoteId: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  // A page created offline is shown from the outbox until the server has it.
  const page = useQuery({
    queryKey: ["page", id],
    queryFn: () => {
      const pending = pageOutbox.get(id);
      return pending ? Promise.resolve(pendingPageDetail(pending)) : fetchPage(id);
    },
  });
  const pending = usePendingPages().some((p) => p.id === id);
  const providerRef = useRef<YProvider | null>(null);
  const [status, setStatus] = useState<keyof typeof STATUS_LABEL>("connecting");
  const online = useOnline();
  // The provider only reports a disconnect once it had a connection; offline is known earlier.
  const shownStatus = !online && status !== "local" ? "offline" : status;
  const [peers, setPeers] = useState(1);
  const [textblocks, setTextblocks] = useState(0);
  const noteId = page.data?.noteId ?? defaultNoteId;
  const readOnly = page.data?.role === "viewer";

  useEffect(() => {
    const element = hostRef.current;
    if (!element || page.status !== "success") return;

    // Investigation switches: `?collab=0` (no Y.js), `?caret=0|tiptap` (no carets / Tiptap's),
    // `?cv=1` (content-visibility on blocks) — used by scripts/measure.mjs.
    const params = new URLSearchParams(location.search);
    element.classList.toggle("cv", params.get("cv") === "1");
    if (params.get("collab") === "0") {
      const editor = createEditor({ element, searchTargets: (q) => searchTargets(noteId, q) });
      const stopWatchingSize = watchPageSize(editor, setTextblocks);
      window.__zediPoc = { ...window.__zediPoc, editor };
      setStatus("synced");
      performance.mark("editor:synced");
      return () => {
        stopWatchingSize();
        editor.destroy();
      };
    }

    const doc = new Y.Doc();
    // Local copy in IndexedDB: the page opens and accepts edits offline; Y.js merges them
    // with the server when the provider connects.
    const persistence = new IndexeddbPersistence(pageDocName(id), doc);
    const waitingForServer = pageOutbox.get(id) !== undefined;
    const provider = new YProvider(location.host, id, doc, {
      party: "page-room",
      protocol: location.protocol === "https:" ? "wss" : "ws",
      // The room rejects pages the server does not know yet; connect once the page is created.
      connect: !waitingForServer,
    });
    providerRef.current = provider;
    if (waitingForServer) setStatus("local");
    const user = {
      name: `user-${Math.floor(Math.random() * 1000)}`,
      color: COLORS[Math.floor(Math.random() * COLORS.length)] ?? "#2563eb",
    };
    const editor = createEditor({
      element,
      collaboration: { doc, provider, user, carets: caretMode(params.get("caret")) },
      searchTargets: (q) => searchTargets(noteId, q),
    });
    editor.setEditable(!readOnly);
    const stopWatchingSize = watchPageSize(editor, setTextblocks);

    const onSync = (synced: boolean) => {
      setStatus(synced ? "synced" : "connecting");
      if (synced) performance.mark("editor:synced");
    };
    const onStatus = ({ status: s }: { status: string }) =>
      s === "disconnected" && setStatus("offline");
    const onAwareness = () => setPeers(provider.awareness.getStates().size);
    provider.on("sync", onSync);
    provider.on("status", onStatus);
    provider.awareness.on("change", onAwareness);
    window.__zediPoc = { ...window.__zediPoc, editor, doc };
    performance.mark("editor:mounted");

    return () => {
      provider.off("sync", onSync);
      provider.off("status", onStatus);
      provider.awareness.off("change", onAwareness);
      stopWatchingSize();
      editor.destroy();
      providerRef.current = null;
      provider.destroy();
      void persistence.destroy();
      doc.destroy();
    };
  }, [id, page.status, noteId, readOnly]);

  useEffect(() => {
    if (!pending && providerRef.current && !providerRef.current.shouldConnect) {
      setStatus("connecting");
      void providerRef.current.connect();
    }
  }, [pending]);

  if (page.status === "error") {
    const missing = page.error instanceof ApiError && page.error.status === 404;
    return <p role="alert">{missing ? "ページが見つかりません。" : "読み込みに失敗しました。"}</p>;
  }

  return (
    <section class="editor-page">
      <header class="editor-header">
        <h1>{page.data?.title ?? "…"}</h1>
        <span class="status" data-status={shownStatus} data-testid="sync-status">
          {STATUS_LABEL[shownStatus]} ・ {peers} 人{readOnly ? " ・ 閲覧のみ" : ""}
        </span>
      </header>
      <p class="muted hint">
        <kbd>[[</kbd> でページリンク、<kbd>/</kbd> でコマンド、<kbd>#タグ</kbd> + スペースでタグ
      </p>
      {isLongPage(textblocks) && (
        <p role="status" class="long-page" data-testid="long-page-warning">
          このページは {textblocks.toLocaleString()} ブロックあります。
          {LONG_PAGE_BLOCKS.toLocaleString()}{" "}
          ブロックを超えると共同編集の入力が遅くなるため、見出しごとに別ページへ分けてください。
        </p>
      )}
      <div ref={hostRef} class="editor-host" data-testid="editor" />
    </section>
  );
}
