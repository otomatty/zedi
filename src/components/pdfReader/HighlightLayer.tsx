/**
 * 1 ページ分のハイライト矩形をキャンバス上に重ねるレイヤ。
 *
 * Overlays stored highlight rectangles for a single PDF page. Pulls
 * highlights via {@link usePdfHighlights} and converts each pdf-space rect to
 * viewport-space (CSS px) using the supplied {@link PdfPageViewport}. Each
 * rect is an absolutely positioned `<div>` with a colour-coded background.
 *
 * Pointer 戦略 / Pointer strategy:
 *  - コンテナ自体は `pointer-events: none` で、下のテキスト選択を邪魔しない。
 *  - 個々の矩形 div だけ `pointer-events: auto` で、`mousedown` でクリック検出する。
 *  - The container is `pointer-events: none` to keep text selection beneath
 *    intact; only the rect divs are `pointer-events: auto` so the user can
 *    click them.
 */
import { useMemo } from "react";
import {
  usePdfHighlights,
  type PdfHighlight,
  type PdfHighlightColor,
} from "@/lib/pdfKnowledge/highlightsApi";
import type { PdfPageViewport } from "@/lib/pdfKnowledge/pdfjsLoader";

/** Props for {@link HighlightLayer}. */
export interface HighlightLayerProps {
  /** Source id used to fetch highlights. */
  sourceId: string;
  /** 1-indexed PDF page number. */
  pageNumber: number;
  /** Viewport from `PdfPageCanvas.onViewportReady`. */
  viewport: PdfPageViewport;
  /** Highlight currently selected from the sidebar — gets an extra ring. */
  activeHighlightId?: string | null;
  /** Called when the user clicks a highlight rect. */
  onHighlightClick?: (highlight: PdfHighlight) => void;
}

/**
 * Tailwind classes per highlight color. Listed verbatim so JIT keeps them.
 * 色ごとの Tailwind クラス（JIT のパージ対策で文字列を直接列挙）。
 */
const HIGHLIGHT_BG_CLASSES: Record<PdfHighlightColor, string> = {
  yellow: "bg-yellow-300/40 hover:bg-yellow-300/60",
  green: "bg-emerald-300/40 hover:bg-emerald-300/60",
  blue: "bg-sky-300/40 hover:bg-sky-300/60",
  red: "bg-rose-300/40 hover:bg-rose-300/60",
  purple: "bg-violet-300/40 hover:bg-violet-300/60",
};

interface RectStyle {
  highlightId: string;
  color: PdfHighlightColor;
  style: React.CSSProperties;
  text: string;
}

/**
 * Highlight 配列をビューポート空間の CSS スタイルへ変換する。Memoise なロジック。
 * Pure projection used to convert highlight rects to CSS box styles.
 */
function projectHighlights(
  highlights: PdfHighlight[],
  pageNumber: number,
  viewport: PdfPageViewport,
): RectStyle[] {
  const out: RectStyle[] = [];
  for (const h of highlights) {
    if (h.pdfPage !== pageNumber) continue;
    for (const r of h.rects) {
      // PDF-space y is inverted vs viewport-space. The top-left corner of the
      // rect on screen corresponds to (x1, y2) in pdf-space (because y2 is the
      // larger / "top" coordinate in PDF's y-up system).
      const [xa, ya] = viewport.convertToViewportPoint(r.x1, r.y2);
      const [xb, yb] = viewport.convertToViewportPoint(r.x2, r.y1);
      const left = Math.min(xa, xb);
      const top = Math.min(ya, yb);
      const width = Math.abs(xb - xa);
      const height = Math.abs(yb - ya);
      out.push({
        highlightId: h.id,
        color: h.color,
        text: h.text,
        style: {
          position: "absolute",
          left: `${left}px`,
          top: `${top}px`,
          width: `${width}px`,
          height: `${height}px`,
        },
      });
    }
  }
  return out;
}

/**
 * Pure projection exported for unit tests.
 * @internal
 */
export const __test = { projectHighlights };

/**
 * Renders the per-page highlight overlay.
 */
export function HighlightLayer({
  sourceId,
  pageNumber,
  viewport,
  activeHighlightId = null,
  onHighlightClick,
}: HighlightLayerProps) {
  const highlightsQuery = usePdfHighlights(sourceId);
  const rects = useMemo(
    () => projectHighlights(highlightsQuery.data?.highlights ?? [], pageNumber, viewport),
    [highlightsQuery.data, pageNumber, viewport],
  );

  return (
    <div
      className="pointer-events-none absolute inset-0"
      style={{ zIndex: 3 }}
      data-pdf-highlights-page={pageNumber}
      aria-hidden="true"
    >
      {rects.map((r, idx) => {
        const colorClass = HIGHLIGHT_BG_CLASSES[r.color] ?? HIGHLIGHT_BG_CLASSES.yellow;
        const active = activeHighlightId === r.highlightId;
        return (
          <div
            key={`${r.highlightId}-${idx}`}
            className={`pointer-events-auto cursor-pointer rounded-sm ${colorClass} ${active ? "ring-2 ring-amber-500 ring-offset-1" : ""}`}
            style={r.style}
            data-highlight-id={r.highlightId}
            title={r.text.slice(0, 200)}
            onMouseDown={(event) => {
              // Only treat as click — do not start text selection.
              event.preventDefault();
              if (!onHighlightClick) return;
              const highlight = highlightsQuery.data?.highlights.find(
                (h) => h.id === r.highlightId,
              );
              if (highlight) onHighlightClick(highlight);
            }}
          />
        );
      })}
    </div>
  );
}
