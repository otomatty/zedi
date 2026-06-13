/**
 * Tests for {@link PdfPageCanvas}.
 *
 * pdf.js is stubbed at the module level so the component's lifecycle is
 * exercised without touching the real worker.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";

const hoisted = vi.hoisted(() => ({
  textLayerRender: vi.fn().mockResolvedValue(undefined),
  textLayerCancel: vi.fn(),
}));

vi.mock("@/lib/pdfKnowledge/pdfjsLoader", () => {
  class RenderingCancelledExceptionStub extends Error {}
  class TextLayerStub {
    render = hoisted.textLayerRender;
    cancel = hoisted.textLayerCancel;
  }
  return {
    pdfjsLib: {
      RenderingCancelledException: RenderingCancelledExceptionStub,
      TextLayer: TextLayerStub,
    },
    getPdfDocument: vi.fn(),
    CMAP_URL: "/pdfjs/cmaps/",
    STANDARD_FONT_DATA_URL: "/pdfjs/standard_fonts/",
  };
});

import { PdfPageCanvas } from "./PdfPageCanvas";

/** Build a fake pdfDoc whose `page.render` returns a controllable RenderTask. */
function makeFakePdfDoc(opts: { renderResolves?: boolean; cancelSpy?: ReturnType<typeof vi.fn> }) {
  const { renderResolves = true, cancelSpy } = opts;
  const renderFn = vi.fn().mockImplementation(() => {
    const task = {
      promise: renderResolves
        ? Promise.resolve()
        : new Promise<void>(() => {
            /* never resolves */
          }),
      cancel: cancelSpy ?? vi.fn(),
    };
    return task;
  });
  return {
    getPage: vi.fn().mockResolvedValue({
      getViewport: vi.fn().mockReturnValue({ width: 600, height: 800 }),
      getTextContent: vi.fn().mockResolvedValue({ items: [], styles: {} }),
      render: renderFn,
    }),
  } as unknown as import("@/lib/pdfKnowledge/pdfjsLoader").PdfDocumentProxy;
}

// jsdom returns null for canvas.getContext("2d"); stub it so the effect runs.
// jsdom はデフォルトで 2d context を返さないため、ここで簡易スタブを差し込む。
HTMLCanvasElement.prototype.getContext = function getContext(this: HTMLCanvasElement): unknown {
  return {} as CanvasRenderingContext2D;
} as HTMLCanvasElement["getContext"];

describe("PdfPageCanvas", () => {
  beforeEach(() => {
    hoisted.textLayerRender.mockClear();
    hoisted.textLayerCancel.mockReset();
  });

  it("sizes the canvas to the viewport and notifies onViewportReady", async () => {
    const pdfDoc = makeFakePdfDoc({ renderResolves: true });
    const onViewportReady = vi.fn();
    const { container } = render(
      <PdfPageCanvas
        pdfDoc={pdfDoc}
        pageNumber={1}
        scale={1.5}
        onViewportReady={onViewportReady}
      />,
    );

    await waitFor(() => expect(onViewportReady).toHaveBeenCalled());

    const canvas = container.querySelector("canvas");
    expect(canvas?.width).toBe(600);
    expect(canvas?.height).toBe(800);
    expect(onViewportReady).toHaveBeenCalledWith({ width: 600, height: 800 }, 1);
  });

  it("cancels the in-flight render task on unmount", async () => {
    const cancelSpy = vi.fn();
    const pdfDoc = makeFakePdfDoc({ renderResolves: false, cancelSpy });
    const { unmount } = render(<PdfPageCanvas pdfDoc={pdfDoc} pageNumber={2} scale={1} />);
    // Wait until the component has actually called `page.render` (which
    // happens after `getPage` resolves).
    await waitFor(() =>
      expect((pdfDoc.getPage as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(0),
    );
    // Give one more microtask flush so `page.render(...)` is invoked.
    await Promise.resolve();
    await Promise.resolve();
    unmount();
    expect(cancelSpy).toHaveBeenCalled();
  });

  it("renders a text layer container", () => {
    const pdfDoc = makeFakePdfDoc({ renderResolves: true });
    const { container } = render(<PdfPageCanvas pdfDoc={pdfDoc} pageNumber={1} scale={1} />);
    const textLayerEl = container.querySelector(".textLayer");
    expect(textLayerEl).not.toBeNull();
  });
});
