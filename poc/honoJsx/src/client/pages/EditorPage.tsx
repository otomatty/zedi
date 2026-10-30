import { useContext, useEffect, useRef, useState } from "hono/jsx/dom";
import YProvider from "y-partyserver/provider";
import * as Y from "yjs";
import { allNotesQuery, fetchNote } from "../api";
import { createEditor, type LinkTarget } from "../editor/createEditor";
import { filterItems } from "../lib/listbox";
import { QueryClientContext, useQuery } from "../lib/query";

const COLORS = ["#2563eb", "#db2777", "#16a34a", "#ea580c", "#7c3aed"];
const STATUS_LABEL = { connecting: "接続中", synced: "同期済み", offline: "オフライン" } as const;

/**
 * Collaborative editor page (lazy-loaded chunk): Tiptap + Y.js synced through the
 * `PageRoom` Durable Object via y-partyserver.
 * 共同編集ページ（遅延読み込み）。y-partyserver 経由で PageRoom DO と同期する。
 */
export default function EditorPage({ id }: { id: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const client = useContext(QueryClientContext);
  const note = useQuery({ queryKey: ["note", id], queryFn: () => fetchNote(id) });
  const [status, setStatus] = useState<keyof typeof STATUS_LABEL>("connecting");
  const [peers, setPeers] = useState(1);

  useEffect(() => {
    const element = hostRef.current;
    if (!element || !client) return;
    const searchTargets = async (query: string): Promise<LinkTarget[]> => {
      const data = await client.fetchQuery(allNotesQuery);
      const options = data.items.map((n) => ({ id: n.id, label: n.title }));
      return filterItems(options, query, 8).map((o) => ({ id: o.id, title: o.label }));
    };

    // `?collab=0` runs the same editor without Y.js, to separate binding cost from UI cost.
    if (new URLSearchParams(location.search).get("collab") === "0") {
      const editor = createEditor({ element, searchTargets });
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
    const editor = createEditor({ element, collaboration: { doc, provider, user }, searchTargets });

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
  }, [id, client]);

  return (
    <section class="editor-page">
      <header class="editor-header">
        <h1>{note.data?.title ?? id}</h1>
        <span class="status" data-status={status} data-testid="sync-status">
          {STATUS_LABEL[status]} ・ {peers} 人
        </span>
      </header>
      <p class="muted hint">
        <kbd>[[</kbd> でページリンク、<kbd>/</kbd> でコマンド、<kbd>#タグ</kbd> + スペースでタグ
      </p>
      <div ref={hostRef} class="editor-host" data-testid="editor" />
    </section>
  );
}
