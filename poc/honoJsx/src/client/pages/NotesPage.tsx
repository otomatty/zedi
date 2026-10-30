import { useEffect, useRef } from "hono/jsx/dom";
import { allNotesQuery } from "../api";
import { useQuery } from "../lib/query";
import { useVirtualizer } from "../lib/virtual";

const ROW_HEIGHT = 72;
const dateFormat = new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeStyle: "short" });

/**
 * Virtualized list of all notes (10,000 rows; only the visible ones are in the DOM).
 * 全ノートの仮想化リスト。表示範囲の行だけを DOM に置く。
 */
export function NotesPage() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const notes = useQuery(allNotesQuery);
  const items = notes.data?.items ?? [];
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
  });

  useEffect(() => {
    if (items.length > 0 && performance.getEntriesByName("notes:first-render").length === 0) {
      requestAnimationFrame(() => performance.mark("notes:first-render"));
    }
  }, [items.length]);

  if (notes.status === "pending") return <p class="muted">読み込み中…</p>;
  if (notes.status === "error") return <p role="alert">読み込みに失敗しました。</p>;

  return (
    <section class="notes">
      <h1>
        ノート一覧 <span class="muted">{notes.data.total.toLocaleString()} 件</span>
      </h1>
      <div ref={scrollRef} class="note-scroll" data-testid="note-scroll">
        <div style={{ height: `${virtualizer.getTotalSize()}px`, position: "relative" }}>
          {virtualizer.getVirtualItems().map((row) => {
            const note = items[row.index];
            if (!note) return null;
            return (
              <a
                key={note.id}
                href={`/notes/${note.id}`}
                class="note-row"
                style={{ transform: `translateY(${row.start}px)`, height: `${ROW_HEIGHT}px` }}
              >
                <span class="note-title">{note.title}</span>
                <span class="note-meta">
                  {note.tags.map((t) => `#${t}`).join(" ")} ・{" "}
                  {dateFormat.format(new Date(note.updatedAt))}
                </span>
              </a>
            );
          })}
        </div>
      </div>
    </section>
  );
}
