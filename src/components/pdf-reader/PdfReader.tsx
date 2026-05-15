/**
 * PDF 知識化ビューアのルートコンポーネント (Phase 2)。
 *
 * Root component for the PDF knowledge viewer. The data model / Tauri bridge /
 * REST API / derive-page flow were wired in PR #858; this component composes
 * the actual pdf.js canvas, text-selection layer, highlight overlay, floating
 * toolbar, and sidebar on top of that foundation.
 *
 * 構成 / Composition:
 *   - `usePdfDocument`       — `readPdfBytes` → `pdfjs.getDocument`
 *   - `usePdfSourceVerify`   — ファイル存在チェック (React Query 化)
 *   - `PdfPageCanvas`        — ページ単位の描画 + 選択可能テキスト
 *   - `HighlightLayer`       — 保存済みハイライトの矩形オーバーレイ
 *   - `HighlightToolbar`     — 選択時に浮かぶ保存/派生 UI
 *   - `HighlightSidebar`     — 右側のハイライト一覧
 *   - `MissingPdfBanner`     — ファイル欠損時のフォールバック
 *
 * 仮想化方針 / Virtualisation:
 *   全ページを単純に縦に並べるとメモリが厳しいので、IntersectionObserver で
 *   表示中ページ ±2 だけ実描画する。プレースホルダはビューポートサイズで予約。
 *   We keep all pages mounted as placeholder boxes (sized by their viewport)
 *   so scroll positions stay stable, but only render the canvas + text layer
 *   for pages within the visible window ± 2.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { ZoomIn, ZoomOut, RotateCcw } from "lucide-react";
import { isTauriDesktop } from "@/lib/platform";
import { useToast } from "@zedi/ui";
import {
  useCreatePdfHighlight,
  useDerivePageFromHighlight,
  patchPdfSourcePageCount,
  type PdfHighlight,
} from "@/lib/pdfKnowledge/highlightsApi";
import { usePdfSourceVerify } from "@/lib/pdfKnowledge/usePdfSourceVerify";
import type { PdfPageViewport } from "@/lib/pdfKnowledge/pdfjsLoader";
import { PdfReaderUnsupported } from "./PdfReaderUnsupported";
import { MissingPdfBanner } from "./MissingPdfBanner";
import { PdfPageCanvas } from "./PdfPageCanvas";
import { HighlightLayer } from "./HighlightLayer";
import { HighlightToolbar } from "./HighlightToolbar";
import { HighlightSidebar } from "./HighlightSidebar";
import { usePdfDocument } from "./usePdfDocument";
import { selectionToPdfRects } from "./selectionToPdfRects";
import { runSaveAndDeriveFlow } from "./saveAndDeriveFlow";

const MIN_SCALE = 0.5;
const MAX_SCALE = 3.0;
const DEFAULT_SCALE = 1.25;
const ZOOM_STEP = 0.25;
const VISIBILITY_BUFFER = 2;

interface SelectionSnapshot {
  pageNumber: number;
  viewport: PdfPageViewport;
  pageEl: HTMLElement;
  selection: Selection;
  rectInViewer: DOMRect;
}

/**
 * `#page=N` フラグメントを解釈する。Parses the PDF.js-style URL fragment.
 * @internal
 */
export function parsePageFragment(hash: string | undefined): number | null {
  if (!hash) return null;
  const m = /(?:^|[#&])page=(\d+)/u.exec(hash);
  if (!m) return null;
  const n = Number.parseInt(m[1], 10);
  return Number.isFinite(n) && n >= 1 ? n : null;
}

/**
 * Top-level PDF knowledge viewer.
 */
export function PdfReader() {
  const { sourceId } = useParams<{ sourceId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();

  // ----- Document + verify state --------------------------------------------
  const pdfState = usePdfDocument(sourceId);
  const verifyQuery = usePdfSourceVerify(sourceId);

  // ----- Viewer state --------------------------------------------------------
  const [scale, setScale] = useState<number>(DEFAULT_SCALE);
  const [visiblePage, setVisiblePage] = useState<number>(1);
  const [viewports, setViewports] = useState<Map<number, PdfPageViewport>>(new Map());
  const [activeHighlightId, setActiveHighlightId] = useState<string | null>(null);
  const [selection, setSelection] = useState<SelectionSnapshot | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const pageRefs = useRef<Map<number, HTMLElement>>(new Map());

  const createMutation = useCreatePdfHighlight(sourceId ?? "");
  const deriveMutation = useDerivePageFromHighlight(sourceId ?? "");
  const isSaving = createMutation.isPending || deriveMutation.isPending;

  // ----- Receive viewports from PdfPageCanvas -------------------------------
  const handleViewportReady = useCallback((viewport: PdfPageViewport, pageNumber: number) => {
    setViewports((prev) => {
      if (prev.get(pageNumber) === viewport) return prev;
      const next = new Map(prev);
      next.set(pageNumber, viewport);
      return next;
    });
  }, []);

  // ----- Backfill page_count once per loaded doc ----------------------------
  const reportedPageCount = useRef<number | null>(null);
  useEffect(() => {
    const doc = pdfState.pdfDoc;
    if (!doc || !sourceId) return;
    if (reportedPageCount.current === doc.numPages) return;
    reportedPageCount.current = doc.numPages;
    patchPdfSourcePageCount(sourceId, doc.numPages).catch(() => {
      // Server is idempotent; ignore failures so the viewer stays usable.
      // サーバ側はべき等。失敗してもビューア利用は継続する。
    });
  }, [pdfState.pdfDoc, sourceId]);

  // ----- Reset scale + selection when source changes ------------------------
  // sourceId 変更時に状態を初期化する。React 公式の "storing information from
  // previous renders" パターン (useState + 条件付き setState) を使う。
  // Reset state during render when `sourceId` changes. This is the pattern
  // React explicitly endorses for "store information from previous renders":
  // https://react.dev/reference/react/useState#storing-information-from-previous-renders
  const [prevSourceId, setPrevSourceId] = useState<string | undefined>(sourceId);
  if (prevSourceId !== sourceId) {
    setPrevSourceId(sourceId);
    setScale(DEFAULT_SCALE);
    setVisiblePage(1);
    setViewports(new Map());
    setSelection(null);
    setActiveHighlightId(null);
  }

  // ----- `#page=N` URL fragment handling ------------------------------------
  // location.hash の変更に応じて該当ページへスクロール。スクロール処理は副作用
  // なので effect に置くが、状態同期 (visiblePage) は IntersectionObserver の
  // コールバックに任せる。
  // The scroll itself is a side-effect (effect), but updating `visiblePage`
  // is delegated to the IntersectionObserver callback so the lint rule
  // against synchronous setState in effects stays happy.
  useEffect(() => {
    if (!pdfState.pdfDoc) return;
    const requested = parsePageFragment(location.hash);
    if (!requested) return;
    const el = pageRefs.current.get(requested);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [pdfState.pdfDoc, location.hash]);

  // ----- IntersectionObserver for visible-page tracking ---------------------
  useEffect(() => {
    if (!pdfState.pdfDoc) return;
    const root = scrollRef.current;
    if (!root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        let mostVisible: { page: number; ratio: number } | null = null;
        for (const entry of entries) {
          const page = Number((entry.target as HTMLElement).dataset.pageNumber ?? "0");
          if (!page) continue;
          if (!mostVisible || entry.intersectionRatio > mostVisible.ratio) {
            mostVisible = { page, ratio: entry.intersectionRatio };
          }
        }
        if (mostVisible && mostVisible.ratio > 0) setVisiblePage(mostVisible.page);
      },
      { root, threshold: [0, 0.25, 0.5, 0.75, 1] },
    );
    for (const el of pageRefs.current.values()) observer.observe(el);
    return () => observer.disconnect();
  }, [pdfState.pdfDoc]);

  // ----- Selection tracking --------------------------------------------------
  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    function onMouseUp() {
      // Re-read the scroll container at event time; TS narrowing across the
      // closure boundary keeps `root` non-null for the rest of the handler.
      // クロージャ越しでも non-null を保てるよう、ここで再取得して narrow する。
      const scroller = root;
      if (!scroller) return;
      const sel = document.getSelection();
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
        setSelection(null);
        return;
      }
      const range = sel.getRangeAt(0);
      // Walk up from the range's node to a `data-pdf-page` wrapper.
      // Range → 親要素のなかから data-pdf-page を持つラッパーを探す。
      let node: Node | null = range.commonAncestorContainer;
      while (node && node.nodeType !== 1) node = node.parentNode;
      let pageEl: HTMLElement | null = null;
      let cursor = node as HTMLElement | null;
      while (cursor) {
        if (cursor.dataset?.pdfPage) {
          pageEl = cursor;
          break;
        }
        cursor = cursor.parentElement;
      }
      if (!pageEl) {
        setSelection(null);
        return;
      }
      const pageNumber = Number(pageEl.dataset.pdfPage);
      const viewport = viewports.get(pageNumber);
      if (!viewport) {
        setSelection(null);
        return;
      }
      const rangeRect = range.getBoundingClientRect();
      const rootRect = scroller.getBoundingClientRect();
      const rectInViewer = DOMRect.fromRect({
        x: rangeRect.left - rootRect.left + scroller.scrollLeft,
        y: rangeRect.top - rootRect.top + scroller.scrollTop,
        width: rangeRect.width,
        height: rangeRect.height,
      });
      setSelection({ pageNumber, viewport, pageEl, selection: sel, rectInViewer });
    }
    function onMouseDown(e: MouseEvent) {
      // Clicking the toolbar itself should keep the selection state intact.
      // ツールバー自身をクリックしたときは selection を壊さない。
      const target = e.target as HTMLElement | null;
      if (target?.closest('[data-testid="pdf-highlight-toolbar"]')) return;
      // Otherwise dismiss the toolbar; a fresh mouseup will re-establish it.
      setSelection(null);
    }
    root.addEventListener("mouseup", onMouseUp);
    root.addEventListener("mousedown", onMouseDown);
    return () => {
      root.removeEventListener("mouseup", onMouseUp);
      root.removeEventListener("mousedown", onMouseDown);
    };
  }, [viewports]);

  // ----- Save / derive handlers ---------------------------------------------
  const handleSave = useCallback(async () => {
    if (!selection || !sourceId) return;
    const { rects, text } = selectionToPdfRects({
      selection: selection.selection,
      pageEl: selection.pageEl,
      viewport: selection.viewport,
    });
    if (rects.length === 0 || !text.trim()) {
      toast({
        title: "選択範囲が空です / Selection is empty",
        variant: "destructive",
      });
      return;
    }
    try {
      await createMutation.mutateAsync({
        pdfPage: selection.pageNumber,
        rects,
        text,
        color: "yellow",
      });
      setSelection(null);
      document.getSelection()?.removeAllRanges();
    } catch (err) {
      toast({
        title: "ハイライト保存に失敗しました / Failed to save highlight",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    }
  }, [selection, sourceId, createMutation, toast]);

  const handleSaveAndDerive = useCallback(async () => {
    if (!selection || !sourceId) return;
    const { rects, text } = selectionToPdfRects({
      selection: selection.selection,
      pageEl: selection.pageEl,
      viewport: selection.viewport,
    });
    if (rects.length === 0 || !text.trim()) {
      toast({
        title: "選択範囲が空です / Selection is empty",
        variant: "destructive",
      });
      return;
    }
    const result = await runSaveAndDeriveFlow({
      sourceId,
      createBody: { pdfPage: selection.pageNumber, rects, text, color: "yellow" },
      createHighlight: (body) => createMutation.mutateAsync(body),
      derivePage: (p) => deriveMutation.mutateAsync(p),
      navigate,
    });
    setSelection(null);
    document.getSelection()?.removeAllRanges();
    if (result.status === "error") {
      toast({
        title: "派生ページ作成に失敗しました / Failed to derive page",
        description: result.error.message,
        variant: "destructive",
      });
    }
  }, [selection, sourceId, createMutation, deriveMutation, navigate, toast]);

  // ----- Sidebar callbacks ---------------------------------------------------
  const handleSelectHighlight = useCallback((h: PdfHighlight) => {
    setActiveHighlightId(h.id);
    const el = pageRefs.current.get(h.pdfPage);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);
  const handleOpenDerivedPage = useCallback(
    (pageId: string) => navigate(`/pages/${pageId}`),
    [navigate],
  );

  // ----- Zoom controls -------------------------------------------------------
  const zoomIn = () => setScale((s) => Math.min(MAX_SCALE, s + ZOOM_STEP));
  const zoomOut = () => setScale((s) => Math.max(MIN_SCALE, s - ZOOM_STEP));
  const resetZoom = () => setScale(DEFAULT_SCALE);

  // ----- Page list memoisation ----------------------------------------------
  const pageList = useMemo(() => {
    if (!pdfState.pdfDoc) return [];
    return Array.from({ length: pdfState.pdfDoc.numPages }, (_, i) => i + 1);
  }, [pdfState.pdfDoc]);

  // ----- Platform / route guards --------------------------------------------
  if (!isTauriDesktop()) return <PdfReaderUnsupported />;

  if (!sourceId) {
    return (
      <div className="text-muted-foreground p-6 text-sm">
        sourceId が指定されていません / Missing sourceId in route.
      </div>
    );
  }

  const verifyData = verifyQuery.data;
  const fileMissing = verifyData !== null && verifyData !== undefined && !verifyData.exists;

  return (
    <div className="flex h-full flex-col">
      {fileMissing && (
        <MissingPdfBanner
          sourceId={sourceId}
          onReattachComplete={() => {
            void verifyQuery.refetch();
          }}
        />
      )}
      <div className="grid h-full grid-cols-[1fr_320px] gap-0">
        <main className="relative flex flex-col overflow-hidden">
          {/* Top toolbar (zoom). */}
          <div className="flex items-center gap-1 border-b px-3 py-2 text-xs">
            <button
              type="button"
              onClick={zoomOut}
              disabled={scale <= MIN_SCALE}
              aria-label="縮小 / Zoom out"
              className="hover:bg-accent rounded p-1 disabled:opacity-50"
            >
              <ZoomOut className="size-4" />
            </button>
            <span className="text-muted-foreground tabular-nums">{Math.round(scale * 100)}%</span>
            <button
              type="button"
              onClick={zoomIn}
              disabled={scale >= MAX_SCALE}
              aria-label="拡大 / Zoom in"
              className="hover:bg-accent rounded p-1 disabled:opacity-50"
            >
              <ZoomIn className="size-4" />
            </button>
            <button
              type="button"
              onClick={resetZoom}
              aria-label="リセット / Reset zoom"
              className="hover:bg-accent ml-1 rounded p-1"
            >
              <RotateCcw className="size-4" />
            </button>
            <span className="text-muted-foreground ml-3">
              {pdfState.pdfDoc ? `p.${visiblePage} / ${pdfState.pdfDoc.numPages}` : ""}
            </span>
          </div>

          {/* Scrollable page list. */}
          <div ref={scrollRef} className="relative flex-1 overflow-auto bg-neutral-100 p-4">
            {pdfState.isLoading && (
              <p className="text-muted-foreground text-sm">読み込み中… / Loading…</p>
            )}
            {pdfState.error && <p className="text-destructive text-sm">{pdfState.error.message}</p>}
            {pdfState.pdfDoc &&
              pageList.map((pageNumber) => {
                const isVisible = Math.abs(pageNumber - visiblePage) <= VISIBILITY_BUFFER;
                const viewport = viewports.get(pageNumber);
                return (
                  <section
                    key={pageNumber}
                    data-page-number={pageNumber}
                    ref={(el) => {
                      if (el) pageRefs.current.set(pageNumber, el);
                      else pageRefs.current.delete(pageNumber);
                    }}
                    className="mx-auto mb-4 bg-white shadow-sm"
                    style={{
                      width: viewport ? `${viewport.width}px` : undefined,
                      // Reserve vertical space for non-rendered pages.
                      // 未描画ページにも縦方向のスペースを確保する。
                      minHeight: viewport ? `${viewport.height}px` : "800px",
                    }}
                  >
                    {isVisible && pdfState.pdfDoc && (
                      <div className="relative">
                        <PdfPageCanvas
                          pdfDoc={pdfState.pdfDoc}
                          pageNumber={pageNumber}
                          scale={scale}
                          onViewportReady={handleViewportReady}
                        />
                        {viewport && (
                          <HighlightLayer
                            sourceId={sourceId}
                            pageNumber={pageNumber}
                            viewport={viewport}
                            activeHighlightId={activeHighlightId}
                            onHighlightClick={(h) => setActiveHighlightId(h.id)}
                          />
                        )}
                      </div>
                    )}
                  </section>
                );
              })}

            {selection && (
              <HighlightToolbar
                selectionRect={selection.rectInViewer}
                onSave={handleSave}
                onSaveAndDerive={handleSaveAndDerive}
                onCancel={() => {
                  setSelection(null);
                  document.getSelection()?.removeAllRanges();
                }}
                isSaving={isSaving}
              />
            )}
          </div>
        </main>
        <HighlightSidebar
          sourceId={sourceId}
          activeHighlightId={activeHighlightId}
          onSelectHighlight={handleSelectHighlight}
          onOpenDerivedPage={handleOpenDerivedPage}
        />
      </div>
    </div>
  );
}
