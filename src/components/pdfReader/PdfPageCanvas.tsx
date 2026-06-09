/**
 * 1 ページ分の PDF をキャンバスに描画し、選択可能なテキストレイヤを重ねるコンポーネント。
 *
 * Renders a single PDF page to a `<canvas>` and a selectable
 * text layer on top of it. The text layer uses pdf.js' built-in `TextLayer`
 * class so the browser's native `Selection` API works as if the user were
 * selecting normal HTML.
 *
 * ライフサイクル / Lifecycle:
 *  1. `pdfDoc.getPage(pageNumber)` で `PDFPageProxy` を取得
 *  2. `page.getViewport({ scale })` でビューポートを計算
 *  3. `<canvas>` をビューポートサイズに合わせ、`page.render(...)` で描画
 *  4. `page.getTextContent()` を取得し `new TextLayer(...).render()` で配置
 *  5. アンマウント / 依存変更時は `RenderTask.cancel()` + `TextLayer.cancel()` + `innerHTML = ""`
 */
import { memo, useEffect, useRef } from "react";
import {
  pdfjsLib,
  type PdfDocumentProxy,
  type PdfPageViewport,
} from "@/lib/pdfKnowledge/pdfjsLoader";
import "./pdfTextLayer.css";

/** Props for {@link PdfPageCanvas}. */
export interface PdfPageCanvasProps {
  /** Loaded document from {@link usePdfDocument}. */
  pdfDoc: PdfDocumentProxy;
  /** 1-indexed page number. */
  pageNumber: number;
  /** Render scale. 1.0 = pdf-default 100%. */
  scale: number;
  /**
   * 描画完了後に viewport を親に通知する。`HighlightLayer` などが pdf-space ↔ CSS px
   * 変換に使う。
   * Called once the canvas + text layer for this scale are rendered so the
   * parent can hand the viewport to `HighlightLayer`.
   */
  onViewportReady?: (viewport: PdfPageViewport, pageNumber: number) => void;
}

/** Identity-stable memoization comparator. */
function arePropsEqual(prev: PdfPageCanvasProps, next: PdfPageCanvasProps): boolean {
  return (
    prev.pdfDoc === next.pdfDoc &&
    prev.pageNumber === next.pageNumber &&
    prev.scale === next.scale &&
    prev.onViewportReady === next.onViewportReady
  );
}

function PdfPageCanvasImpl({ pdfDoc, pageNumber, scale, onViewportReady }: PdfPageCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const textLayerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const textLayerEl = textLayerRef.current;
    if (!canvas || !textLayerEl) return;

    let cancelled = false;
    let renderTask: ReturnType<pdfjsLib.PDFPageProxy["render"]> | null = null;
    let textLayer: pdfjsLib.TextLayer | null = null;

    (async () => {
      try {
        const page = await pdfDoc.getPage(pageNumber);
        if (cancelled) return;

        const viewport = page.getViewport({ scale });
        // High-DPI 対応: 内部バッファを devicePixelRatio 倍にし、CSS サイズは
        // viewport のままに保つ。pdf.js には transform マトリクスで同じ倍率を
        // かけ、ベクター描画も鮮明にする。
        // High-DPI support: allocate a backing-store of `viewport × dpr` while
        // keeping the CSS box at viewport size, and feed pdf.js a matching
        // transform so vectors stay crisp on Retina-class displays.
        const outputScale = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;

        // Match the text layer container dimensions to the canvas, so the
        // pdf.js TextLayer positions spans correctly.
        textLayerEl.style.width = `${viewport.width}px`;
        textLayerEl.style.height = `${viewport.height}px`;
        // Reset any previously-rendered spans (StrictMode double-mount).
        textLayerEl.innerHTML = "";

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          throw new Error("PdfPageCanvas: 2d canvas context unavailable");
        }

        renderTask = page.render({
          canvasContext: ctx,
          viewport,
          // dpr=1 のときは undefined を渡してデフォルトパスを温存する。
          // Pass `transform` only when scaling is required.
          transform: outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined,
        });
        await renderTask.promise;
        if (cancelled) return;

        const textContent = await page.getTextContent();
        if (cancelled) return;

        textLayer = new pdfjsLib.TextLayer({
          container: textLayerEl,
          viewport,
          textContentSource: textContent,
        });
        await textLayer.render();
        if (cancelled) return;

        onViewportReady?.(viewport, pageNumber);
      } catch (err) {
        // pdf.js' canonical "render was cancelled" exception is fine to swallow
        // — it just means the parent re-rendered before we finished.
        // 描画中に依存値が変わった場合の正常終了。
        if (err instanceof pdfjsLib.RenderingCancelledException) return;
        if (cancelled) return;
        // Other errors are surfaced via the console so the parent's verify
        // flow can decide what to do; we don't bubble exceptions out of the
        // effect because there is no upstream consumer.

        console.error("PdfPageCanvas render error", err);
      }
    })();

    return () => {
      cancelled = true;
      renderTask?.cancel();
      textLayer?.cancel();
      if (textLayerEl) textLayerEl.innerHTML = "";
    };
  }, [pdfDoc, pageNumber, scale, onViewportReady]);

  return (
    <div className="relative" data-pdf-page={pageNumber}>
      <canvas ref={canvasRef} className="block" />
      <div
        ref={textLayerRef}
        className="textLayer pointer-events-auto absolute inset-0 overflow-hidden select-text"
        aria-hidden="false"
      />
    </div>
  );
}

/**
 * Memoized canvas component. Re-renders only when `(pdfDoc, pageNumber, scale)` or
 * the `onViewportReady` callback identity change.
 */
export const PdfPageCanvas = memo(PdfPageCanvasImpl, arePropsEqual);
