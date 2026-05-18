/**
 * ブラウザの {@link Selection} を pdf-space の矩形配列に変換する純粋関数。
 *
 * Pure helper that converts a browser {@link Selection} (made inside a
 * `PdfPageCanvas`'s per-page wrapper) into an array of
 * {@link PdfHighlightRect}s expressed in pdf-point space (zoom-independent).
 * Stored rects can therefore be re-rendered at any subsequent viewport scale
 * by passing them back through `viewport.convertToViewportPoint`.
 *
 * 重要な不変条件 / Invariants:
 *  - 入力 Range が `pageEl` の外側を指していたら空を返す（ページ跨ぎ選択は本フェーズ
 *    の非対象）。Range outside `pageEl` is rejected (cross-page selection is
 *    out of scope in this phase).
 *  - pdf-space は左下原点・y 軸正方向上向き。viewport-space は左上原点・y 軸下向き。
 *    `convertToPdfPoint` の戻り値の y はビューポート上端から測ったときの pdf 上端側
 *    座標である点に注意（pdf.js の API 仕様）。
 *  - PDF point space has its origin at bottom-left with y-up; CSS viewport
 *    space has its origin at top-left with y-down. pdf.js'
 *    `convertToPdfPoint(x, y)` flips that axis for you.
 */
import type { PdfHighlightRect } from "@/lib/pdfKnowledge/highlightsApi";

/**
 * 本ユーティリティが必要とする viewport の最小インタフェース。
 * Minimal subset of {@link import("pdfjs-dist").PageViewport} we depend on,
 * which keeps unit tests free of pdf.js runtime concerns.
 */
export interface MinimalPdfViewport {
  /**
   * CSS px の viewport-space 座標を pdf-point space に変換する。
   *
   * Convert a CSS-pixel viewport-space coordinate to pdf-point space. pdf.js
   * types this as `any[]`; we trust it to return a 2-tuple `[number, number]`
   * and destructure accordingly.
   */
  convertToPdfPoint(x: number, y: number): number[];
}

/** Arguments accepted by {@link selectionToPdfRects}. */
export interface SelectionToPdfRectsInput {
  /** Browser {@link Selection}. Usually obtained from `document.getSelection()`. */
  selection: Selection;
  /**
   * 対象ページのラッパー要素。Range がこの要素の内側にあるかをチェックし、ページ跨ぎを弾く。
   * The per-page wrapper element used both for containment check and as the
   * coordinate origin for the viewport-space conversion.
   */
  pageEl: HTMLElement;
  /** {@link MinimalPdfViewport}. From `PdfPageCanvas.onViewportReady`. */
  viewport: MinimalPdfViewport;
}

/** Result returned by {@link selectionToPdfRects}. */
export interface SelectionToPdfRectsResult {
  /** Rect list in pdf-point space, deduped and rounded to 2 decimals. */
  rects: PdfHighlightRect[];
  /** The selection's plain text (passed straight through `range.toString()`). */
  text: string;
}

const MIN_DIMENSION_PX = 0.5;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * 与えられた選択を pdf-space の矩形配列に変換する。
 * Convert a browser selection into pdf-space rects.
 *
 * @returns 空または範囲外の場合 `{ rects: [], text: "" }`。
 *   Returns `{ rects: [], text: "" }` for collapsed/out-of-page selections.
 */
export function selectionToPdfRects(input: SelectionToPdfRectsInput): SelectionToPdfRectsResult {
  const { selection, pageEl, viewport } = input;

  if (selection.rangeCount === 0 || selection.isCollapsed) {
    return { rects: [], text: "" };
  }

  const range = selection.getRangeAt(0);

  // Containment check rejects cross-page selections.
  if (!pageEl.contains(range.commonAncestorContainer)) {
    return { rects: [], text: "" };
  }

  const pageRect = pageEl.getBoundingClientRect();
  const clientRects = Array.from(range.getClientRects()).filter(
    (r) => r.width >= MIN_DIMENSION_PX && r.height >= MIN_DIMENSION_PX,
  );

  const rects: PdfHighlightRect[] = [];
  for (const r of clientRects) {
    // viewport-space corners (CSS px, relative to the per-page wrapper).
    const xLeftVp = r.left - pageRect.left;
    const yTopVp = r.top - pageRect.top;
    const xRightVp = r.right - pageRect.left;
    const yBottomVp = r.bottom - pageRect.top;

    const [xa, ya] = viewport.convertToPdfPoint(xLeftVp, yTopVp);
    const [xb, yb] = viewport.convertToPdfPoint(xRightVp, yBottomVp);

    rects.push({
      x1: round2(Math.min(xa, xb)),
      y1: round2(Math.min(ya, yb)),
      x2: round2(Math.max(xa, xb)),
      y2: round2(Math.max(ya, yb)),
    });
  }

  return { rects, text: range.toString() };
}
