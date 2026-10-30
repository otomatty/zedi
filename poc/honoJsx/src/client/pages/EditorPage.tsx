import { useEffect, useRef, useState } from "hono/jsx/dom";
import YProvider from "y-partyserver/provider";
import * as Y from "yjs";
import { ApiError, fetchPage, fetchPageList, searchPages } from "../api";
import { createEditor, type LinkTarget } from "../editor/createEditor";
import { useQuery } from "../lib/query";

const COLORS = ["#2563eb", "#db2777", "#16a34a", "#ea580c", "#7c3aed"];
const STATUS_LABEL = { connecting: "接続中", synced: "同期済み", offline: "オフライン" } as const;

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
  const page = useQuery({ queryKey: ["page", id], queryFn: () => fetchPage(id) });
  const [status, setStatus] = useState<keyof typeof STATUS_LABEL>("connecting");
  const [peers, setPeers] = useState(1);
  const noteId = page.data?.noteId ?? defaultNoteId;
  const readOnly = page.data?.role === "viewer";

  useEffect(() => {
    const element = hostRef.current;
    if (!element || page.status !== "success") return;

    // `?collab=0` runs the same editor without Y.js, to separate binding cost from UI cost.
    if (new URLSearchParams(location.search).get("collab") === "0") {
      const editor = createEditor({ element, searchTargets: (q) => searchTargets(noteId, q) });
      window.__zediPoc = { ...window.__zediPoc, editor };
      setStatus("synced");
      performance.mark("editor:synced");
      return () => editor.destroy();
    }

    const doc = new Y.Doc();
    const provider = new YProvider(location.host, id, doc, {
      party: "page-room",
      protocol: location.protocol === "https:" ? "wss" : "ws",
    });
    const user = {
      name: `user-${Math.floor(Math.random() * 1000)}`,
      color: COLORS[Math.floor(Math.random() * COLORS.length)] ?? "#2563eb",
    };
    const editor = createEditor({
      element,
      collaboration: { doc, provider, user },
      searchTargets: (q) => searchTargets(noteId, q),
    });
    editor.setEditable(!readOnly);

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
      editor.destroy();
      provider.destroy();
      doc.destroy();
    };
  }, [id, page.status, noteId, readOnly]);

  if (page.status === "error") {
    const missing = page.error instanceof ApiError && page.error.status === 404;
    return <p role="alert">{missing ? "ページが見つかりません。" : "読み込みに失敗しました。"}</p>;
  }

  return (
    <section class="editor-page">
      <header class="editor-header">
        <h1>{page.data?.title ?? "…"}</h1>
        <span class="status" data-status={status} data-testid="sync-status">
          {STATUS_LABEL[status]} ・ {peers} 人{readOnly ? " ・ 閲覧のみ" : ""}
        </span>
      </header>
      <p class="muted hint">
        <kbd>[[</kbd> でページリンク、<kbd>/</kbd> でコマンド、<kbd>#タグ</kbd> + スペースでタグ
      </p>
      <div ref={hostRef} class="editor-host" data-testid="editor" />
    </section>
  );
}
