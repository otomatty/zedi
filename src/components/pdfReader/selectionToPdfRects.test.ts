/**
 * Tests for {@link selectionToPdfRects}. The function is pure (no React, no
 * pdf.js global state) so it can be exercised with a fake `Selection` built
 * from JSDOM `Range`s and a fake `PageViewport`.
 *
 * 純粋関数のため、JSDOM の Range と fake viewport だけでカバーする。
 */
import { describe, expect, it, beforeEach } from "vitest";
import { selectionToPdfRects } from "./selectionToPdfRects";

/**
 * Build a fake PageViewport whose `convertToPdfPoint` divides viewport-space
 * coords by `scale` and flips the y axis at `pageHeight`. This mirrors how
 * pdf.js maps between viewport (CSS px) and pdf-point space.
 *
 * scale=2, pageHeight=100 のとき: (10, 20) → (5, 100 - 10) = (5, 90)
 */
function makeFakeViewport(scale: number, pageHeight: number) {
  return {
    convertToPdfPoint: (x: number, y: number): [number, number] => [
      x / scale,
      pageHeight - y / scale,
    ],
  } as unknown as import("./selectionToPdfRects").MinimalPdfViewport;
}

/**
 * Stub a Selection with a single Range whose `getClientRects()` returns the
 * supplied rectangles, and whose `commonAncestorContainer` is `pageEl`.
 */
function makeStubSelection(opts: {
  pageEl: HTMLElement;
  rects: DOMRectInit[];
  text: string;
  isCollapsed?: boolean;
  isInsidePage?: boolean;
}): Selection {
  const rectList = opts.rects.map((r) => DOMRect.fromRect(r));
  const range = {
    getClientRects: () => rectList as unknown as DOMRectList,
    getBoundingClientRect: () => rectList[0] ?? new DOMRect(),
    commonAncestorContainer: opts.isInsidePage === false ? document.body : opts.pageEl,
    toString: () => opts.text,
  } as unknown as Range;
  return {
    rangeCount: opts.isCollapsed ? 0 : 1,
    isCollapsed: Boolean(opts.isCollapsed),
    getRangeAt: () => range,
  } as unknown as Selection;
}

describe("selectionToPdfRects", () => {
  let pageEl: HTMLDivElement;

  beforeEach(() => {
    pageEl = document.createElement("div");
    Object.defineProperty(pageEl, "getBoundingClientRect", {
      value: () => DOMRect.fromRect({ x: 100, y: 200, width: 600, height: 800 }),
      configurable: true,
    });
    document.body.appendChild(pageEl);
  });

  it("returns empty when selection is collapsed", () => {
    const selection = makeStubSelection({
      pageEl,
      rects: [],
      text: "",
      isCollapsed: true,
    });
    const result = selectionToPdfRects({
      selection,
      pageEl,
      viewport: makeFakeViewport(1, 1000),
    });
    expect(result.rects).toEqual([]);
    expect(result.text).toBe("");
  });

  it("returns empty when range is outside the page element", () => {
    const selection = makeStubSelection({
      pageEl,
      rects: [{ x: 150, y: 250, width: 100, height: 20 }],
      text: "ignored",
      isInsidePage: false,
    });
    const result = selectionToPdfRects({
      selection,
      pageEl,
      viewport: makeFakeViewport(1, 1000),
    });
    expect(result.rects).toEqual([]);
  });

  it("returns a single rect for a single-line selection with y-axis flipped to pdf-space", () => {
    // page top-left in CSS px: (100, 200). Selection rect spans (150,250)..(250,270)
    // After subtracting pageEl origin: viewport-space (50,50)..(150,70)
    // convertToPdfPoint at scale=1, pageHeight=1000:
    //  (50, 50) → (50, 1000-50) = (50, 950)  ← top-left in viewport ↔ top in pdf
    //  (150, 70) → (150, 1000-70) = (150, 930) ← bottom-right ↔ bottom in pdf
    // So pdf rect = { x1: 50, x2: 150, y1: 930, y2: 950 }
    const selection = makeStubSelection({
      pageEl,
      rects: [{ x: 150, y: 250, width: 100, height: 20 }],
      text: "hello world",
    });
    const result = selectionToPdfRects({
      selection,
      pageEl,
      viewport: makeFakeViewport(1, 1000),
    });
    expect(result.rects).toEqual([{ x1: 50, y1: 930, x2: 150, y2: 950 }]);
    expect(result.text).toBe("hello world");
  });

  it("returns multiple rects for a multi-line selection", () => {
    const selection = makeStubSelection({
      pageEl,
      rects: [
        { x: 150, y: 250, width: 100, height: 20 },
        { x: 110, y: 280, width: 80, height: 20 },
      ],
      text: "multi\nline",
    });
    const result = selectionToPdfRects({
      selection,
      pageEl,
      viewport: makeFakeViewport(1, 1000),
    });
    expect(result.rects).toHaveLength(2);
    expect(result.rects[0]).toEqual({ x1: 50, y1: 930, x2: 150, y2: 950 });
    expect(result.rects[1]).toEqual({ x1: 10, y1: 900, x2: 90, y2: 920 });
  });

  it("rounds pdf-space coords to two decimals", () => {
    const selection = makeStubSelection({
      pageEl,
      rects: [{ x: 100.333, y: 200.777, width: 33.333, height: 7.777 }],
      text: "x",
    });
    const result = selectionToPdfRects({
      selection,
      pageEl,
      // scale=3, pageHeight=500 → 0.333/3 etc. produces 3rd decimals to round
      viewport: makeFakeViewport(3, 500),
    });
    for (const r of result.rects) {
      for (const v of [r.x1, r.y1, r.x2, r.y2]) {
        // 2 decimal precision means v*100 should be close to an integer.
        expect(Math.abs(v * 100 - Math.round(v * 100))).toBeLessThan(1e-9);
      }
    }
  });

  it("ignores degenerate rects (zero or sub-pixel size)", () => {
    const selection = makeStubSelection({
      pageEl,
      rects: [
        { x: 150, y: 250, width: 0, height: 20 },
        { x: 150, y: 250, width: 0.3, height: 0.3 },
        { x: 150, y: 250, width: 100, height: 20 },
      ],
      text: "kept",
    });
    const result = selectionToPdfRects({
      selection,
      pageEl,
      viewport: makeFakeViewport(1, 1000),
    });
    expect(result.rects).toHaveLength(1);
  });
});
