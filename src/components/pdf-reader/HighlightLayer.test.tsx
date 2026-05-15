/**
 * Tests for {@link HighlightLayer}. Verifies pdf-space → viewport-space
 * projection and click delegation.
 */
import { describe, expect, it, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";

const hoisted = vi.hoisted(() => ({
  usePdfHighlightsMock: vi.fn(),
}));

vi.mock("@/lib/pdfKnowledge/highlightsApi", async () => {
  const actual = await vi.importActual<typeof import("@/lib/pdfKnowledge/highlightsApi")>(
    "@/lib/pdfKnowledge/highlightsApi",
  );
  return {
    ...actual,
    usePdfHighlights: (sourceId: string) => hoisted.usePdfHighlightsMock(sourceId),
  };
});

import { HighlightLayer, __test } from "./HighlightLayer";
import type { PdfHighlight } from "@/lib/pdfKnowledge/highlightsApi";

function makeViewport(scale: number, pageHeight: number) {
  return {
    convertToViewportPoint: (x: number, y: number) => [x * scale, (pageHeight - y) * scale],
  } as unknown as import("@/lib/pdfKnowledge/pdfjsLoader").PdfPageViewport;
}

function makeHighlight(overrides: Partial<PdfHighlight>): PdfHighlight {
  return {
    id: "h1",
    sourceId: "s1",
    ownerId: "u1",
    derivedPageId: null,
    pdfPage: 1,
    rects: [{ x1: 10, y1: 50, x2: 60, y2: 70 }],
    text: "hello",
    color: "yellow",
    note: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("projectHighlights (pure)", () => {
  it("converts pdf-space rects to viewport-space with y-axis flip", () => {
    const h = makeHighlight({});
    const styles = __test.projectHighlights([h], 1, makeViewport(2, 100));
    // x1=10, y2=70 → viewport (20, (100-70)*2=60) → top-left
    // x2=60, y1=50 → viewport (120, (100-50)*2=100) → bottom-right
    // → left=20, top=60, width=100, height=40
    expect(styles).toHaveLength(1);
    expect(styles[0].style.left).toBe("20px");
    expect(styles[0].style.top).toBe("60px");
    expect(styles[0].style.width).toBe("100px");
    expect(styles[0].style.height).toBe("40px");
    expect(styles[0].color).toBe("yellow");
  });

  it("skips highlights from other pages", () => {
    const a = makeHighlight({ id: "a", pdfPage: 1 });
    const b = makeHighlight({ id: "b", pdfPage: 2 });
    const styles = __test.projectHighlights([a, b], 1, makeViewport(1, 100));
    expect(styles.map((s) => s.highlightId)).toEqual(["a"]);
  });
});

describe("HighlightLayer", () => {
  it("renders one div per rect with color class", () => {
    hoisted.usePdfHighlightsMock.mockReturnValue({
      data: { highlights: [makeHighlight({ color: "blue" })] },
    });
    const { container } = render(
      <HighlightLayer sourceId="s1" pageNumber={1} viewport={makeViewport(1, 100)} />,
    );
    const rects = container.querySelectorAll("[data-highlight-id]");
    expect(rects.length).toBe(1);
    expect(rects[0].className).toContain("bg-sky-300/40");
  });

  it("renders nothing when no highlights match the page", () => {
    hoisted.usePdfHighlightsMock.mockReturnValue({
      data: { highlights: [makeHighlight({ pdfPage: 99 })] },
    });
    const { container } = render(
      <HighlightLayer sourceId="s1" pageNumber={1} viewport={makeViewport(1, 100)} />,
    );
    expect(container.querySelectorAll("[data-highlight-id]").length).toBe(0);
  });

  it("invokes onHighlightClick with the matched highlight", () => {
    const h = makeHighlight({ id: "click-me", color: "green" });
    hoisted.usePdfHighlightsMock.mockReturnValue({ data: { highlights: [h] } });
    const onClick = vi.fn();
    const { container } = render(
      <HighlightLayer
        sourceId="s1"
        pageNumber={1}
        viewport={makeViewport(1, 100)}
        onHighlightClick={onClick}
      />,
    );
    const rect = container.querySelector("[data-highlight-id]") as HTMLElement;
    fireEvent.mouseDown(rect);
    expect(onClick).toHaveBeenCalledWith(expect.objectContaining({ id: "click-me" }));
  });

  it("applies an active ring on the matching highlight", () => {
    const h = makeHighlight({ id: "active-one" });
    hoisted.usePdfHighlightsMock.mockReturnValue({ data: { highlights: [h] } });
    const { container } = render(
      <HighlightLayer
        sourceId="s1"
        pageNumber={1}
        viewport={makeViewport(1, 100)}
        activeHighlightId="active-one"
      />,
    );
    const rect = container.querySelector("[data-highlight-id='active-one']") as HTMLElement;
    expect(rect.className).toContain("ring-amber-500");
  });
});
