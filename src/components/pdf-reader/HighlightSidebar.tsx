/**
 * PDF ビューアの右側に表示するハイライト一覧。
 *
 * Sidebar that lists every saved highlight for the current source, grouped by
 * PDF page. Clicking an item scrolls the viewer to that page; the color swatch
 * opens an inline picker (`useUpdatePdfHighlight`); the trash button removes a
 * highlight after confirmation (`useDeletePdfHighlight`). When a highlight has
 * a derived page (`derivedPageId`), an extra "派生ページを開く / Open derived
 * page" link is shown.
 */
import { Fragment, useMemo, useState } from "react";
import { Trash2, FileText } from "lucide-react";
import {
  usePdfHighlights,
  useUpdatePdfHighlight,
  useDeletePdfHighlight,
  type PdfHighlight,
  type PdfHighlightColor,
} from "@/lib/pdfKnowledge/highlightsApi";

/** Props for {@link HighlightSidebar}. */
export interface HighlightSidebarProps {
  sourceId: string;
  /** Currently active highlight (e.g. the one scrolled into view). */
  activeHighlightId?: string | null;
  /** Called when the user clicks a sidebar row. */
  onSelectHighlight?: (highlight: PdfHighlight) => void;
  /**
   * Called when the user clicks "Open derived page".
   * 派生ページの URL は `/notes/:noteId/:pageId` のため、`pageId` に加えて
   * `noteId` も渡す（Issue #889 Phase 3 で `/pages/:id` を廃止）。
   * Receives both ids since the route is `/notes/:noteId/:pageId`.
   */
  onOpenDerivedPage?: (pageId: string, noteId: string) => void;
}

const COLOR_SWATCHES: Record<PdfHighlightColor, string> = {
  yellow: "bg-yellow-300",
  green: "bg-emerald-300",
  blue: "bg-sky-300",
  red: "bg-rose-300",
  purple: "bg-violet-300",
};
const COLOR_ORDER: PdfHighlightColor[] = ["yellow", "green", "blue", "red", "purple"];

/**
 * Group highlights by their `pdfPage` field. Pure helper for testing.
 * @internal
 */
export function groupByPage(highlights: PdfHighlight[]): Map<number, PdfHighlight[]> {
  const map = new Map<number, PdfHighlight[]>();
  for (const h of [...highlights].sort(
    (a, b) => a.pdfPage - b.pdfPage || a.createdAt.localeCompare(b.createdAt),
  )) {
    const list = map.get(h.pdfPage) ?? [];
    list.push(h);
    map.set(h.pdfPage, list);
  }
  return map;
}

export function HighlightSidebar({
  sourceId,
  activeHighlightId = null,
  onSelectHighlight,
  onOpenDerivedPage,
}: HighlightSidebarProps) {
  const highlightsQuery = usePdfHighlights(sourceId);
  const updateMutation = useUpdatePdfHighlight(sourceId);
  const deleteMutation = useDeletePdfHighlight(sourceId);
  const [pickerOpenFor, setPickerOpenFor] = useState<string | null>(null);

  const highlights = highlightsQuery.data?.highlights ?? [];
  // Hooks must run on every render (rules-of-hooks), so memoise before the
  // loading / error / empty early-returns below.
  // フック呼び出し順を一定に保つため、早期 return より前で memo を取る。
  const grouped = useMemo(() => groupByPage(highlights), [highlights]);

  if (highlightsQuery.isLoading) {
    return <aside className="text-muted-foreground p-4 text-sm">読み込み中… / Loading…</aside>;
  }
  if (highlightsQuery.error) {
    return (
      <aside className="text-destructive p-4 text-xs">
        {highlightsQuery.error instanceof Error
          ? highlightsQuery.error.message
          : String(highlightsQuery.error)}
      </aside>
    );
  }

  if (highlights.length === 0) {
    return (
      <aside className="text-muted-foreground p-4 text-sm">
        まだハイライトはありません。
        <br />
        No highlights yet.
      </aside>
    );
  }

  function handleDelete(id: string) {
    if (
      typeof window !== "undefined" &&
      !window.confirm("削除しますか? / Delete this highlight?")
    ) {
      return;
    }
    deleteMutation.mutate(id);
  }

  return (
    <aside className="space-y-4 overflow-auto p-4 text-sm">
      <h2 className="font-medium">ハイライト / Highlights</h2>
      {Array.from(grouped.entries()).map(([page, items]) => (
        <Fragment key={page}>
          <p className="text-muted-foreground text-xs font-medium">p.{page}</p>
          <ul className="space-y-2">
            {items.map((h) => {
              const active = activeHighlightId === h.id;
              return (
                <li
                  key={h.id}
                  className={`rounded border p-2 transition-colors ${active ? "bg-accent" : ""}`}
                  data-highlight-id={h.id}
                >
                  <button
                    type="button"
                    onClick={() => onSelectHighlight?.(h)}
                    className="block w-full text-left"
                  >
                    <span className="line-clamp-3 text-sm">{h.text.slice(0, 200)}</span>
                  </button>
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      type="button"
                      aria-label="色を変更 / Change color"
                      className={`size-4 rounded-full ring-1 ring-black/10 ${COLOR_SWATCHES[h.color]}`}
                      onClick={() => setPickerOpenFor((cur) => (cur === h.id ? null : h.id))}
                    />
                    {pickerOpenFor === h.id && (
                      <div
                        role="menu"
                        aria-label="色の選択 / Color choices"
                        className="bg-popover flex items-center gap-1 rounded border p-1"
                      >
                        {COLOR_ORDER.map((c) => (
                          <button
                            key={c}
                            type="button"
                            aria-label={c}
                            className={`size-4 rounded-full ring-1 ring-black/10 ${COLOR_SWATCHES[c]} ${
                              c === h.color ? "ring-2 ring-amber-500" : ""
                            }`}
                            onClick={() => {
                              updateMutation.mutate(
                                { highlightId: h.id, body: { color: c } },
                                { onSettled: () => setPickerOpenFor(null) },
                              );
                            }}
                          />
                        ))}
                      </div>
                    )}
                    {h.derivedPageId && h.derivedPageNoteId && (
                      <button
                        type="button"
                        onClick={() =>
                          onOpenDerivedPage?.(
                            h.derivedPageId as string,
                            h.derivedPageNoteId as string,
                          )
                        }
                        className="text-primary inline-flex items-center gap-1 text-xs underline-offset-2 hover:underline"
                      >
                        <FileText className="size-3" />
                        派生ページを開く / Open derived page
                      </button>
                    )}
                    <button
                      type="button"
                      aria-label="削除 / Delete"
                      className="text-muted-foreground hover:text-destructive ml-auto"
                      onClick={() => handleDelete(h.id)}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </Fragment>
      ))}
    </aside>
  );
}
