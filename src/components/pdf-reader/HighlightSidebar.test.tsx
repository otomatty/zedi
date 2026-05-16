/**
 * Tests for {@link HighlightSidebar}.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";

const hoisted = vi.hoisted(() => ({
  usePdfHighlightsMock: vi.fn(),
  updateMutate: vi.fn(),
  deleteMutate: vi.fn(),
}));

vi.mock("@/lib/pdfKnowledge/highlightsApi", async () => {
  const actual = await vi.importActual<typeof import("@/lib/pdfKnowledge/highlightsApi")>(
    "@/lib/pdfKnowledge/highlightsApi",
  );
  return {
    ...actual,
    usePdfHighlights: (sourceId: string) => hoisted.usePdfHighlightsMock(sourceId),
    useUpdatePdfHighlight: () => ({ mutate: hoisted.updateMutate }),
    useDeletePdfHighlight: () => ({ mutate: hoisted.deleteMutate, isPending: false }),
  };
});

import { HighlightSidebar, groupByPage } from "./HighlightSidebar";
import type { PdfHighlight } from "@/lib/pdfKnowledge/highlightsApi";

function makeHighlight(overrides: Partial<PdfHighlight>): PdfHighlight {
  return {
    id: "h1",
    sourceId: "s1",
    ownerId: "u1",
    derivedPageId: null,
    pdfPage: 1,
    rects: [{ x1: 0, y1: 0, x2: 1, y2: 1 }],
    text: "hello world",
    color: "yellow",
    note: null,
    createdAt: "2026-05-15T00:00:00.000Z",
    updatedAt: "2026-05-15T00:00:00.000Z",
    ...overrides,
  };
}

describe("groupByPage (pure)", () => {
  it("groups by pdfPage and sorts pages ascending", () => {
    const grouped = groupByPage([
      makeHighlight({ id: "a", pdfPage: 3 }),
      makeHighlight({ id: "b", pdfPage: 1 }),
      makeHighlight({ id: "c", pdfPage: 1, createdAt: "2026-05-16T00:00:00Z" }),
    ]);
    const keys = Array.from(grouped.keys());
    expect(keys).toEqual([1, 3]);
    const page1 = grouped.get(1);
    expect(page1?.map((h) => h.id)).toEqual(["b", "c"]);
  });
});

describe("HighlightSidebar", () => {
  it("renders empty state when no highlights", () => {
    hoisted.usePdfHighlightsMock.mockReturnValue({
      data: { highlights: [] },
      isLoading: false,
      error: null,
    });
    render(<HighlightSidebar sourceId="s1" />);
    expect(screen.getByText(/まだハイライトはありません/)).toBeInTheDocument();
  });

  it("groups highlights by page and shows the trash button", () => {
    hoisted.usePdfHighlightsMock.mockReturnValue({
      data: {
        highlights: [
          makeHighlight({ id: "a", pdfPage: 2, text: "second-page" }),
          makeHighlight({ id: "b", pdfPage: 1, text: "first-page" }),
        ],
      },
      isLoading: false,
      error: null,
    });
    render(<HighlightSidebar sourceId="s1" />);
    expect(screen.getByText("p.1")).toBeInTheDocument();
    expect(screen.getByText("p.2")).toBeInTheDocument();
    expect(screen.getByText(/first-page/)).toBeInTheDocument();
    expect(screen.getAllByLabelText(/^削除/).length).toBe(2);
  });

  it("only shows the Open-derived-page link when derivedPageId is set", () => {
    hoisted.usePdfHighlightsMock.mockReturnValue({
      data: {
        highlights: [
          makeHighlight({ id: "with-page", derivedPageId: "page-1" }),
          makeHighlight({ id: "without-page", derivedPageId: null }),
        ],
      },
      isLoading: false,
      error: null,
    });
    const onOpen = vi.fn();
    render(<HighlightSidebar sourceId="s1" onOpenDerivedPage={onOpen} />);
    const links = screen.getAllByRole("button", { name: /派生ページを開く/ });
    expect(links.length).toBe(1);
    fireEvent.click(links[0]);
    expect(onOpen).toHaveBeenCalledWith("page-1");
  });

  it("invokes delete mutation after confirm", () => {
    hoisted.usePdfHighlightsMock.mockReturnValue({
      data: { highlights: [makeHighlight({ id: "kill-me" })] },
      isLoading: false,
      error: null,
    });
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<HighlightSidebar sourceId="s1" />);
    fireEvent.click(screen.getByLabelText(/^削除/));
    expect(hoisted.deleteMutate).toHaveBeenCalledWith("kill-me");
    confirmSpy.mockRestore();
  });

  it("does not delete when confirm is cancelled", () => {
    hoisted.usePdfHighlightsMock.mockReturnValue({
      data: { highlights: [makeHighlight({ id: "spare-me" })] },
      isLoading: false,
      error: null,
    });
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    hoisted.deleteMutate.mockReset();
    render(<HighlightSidebar sourceId="s1" />);
    fireEvent.click(screen.getByLabelText(/^削除/));
    expect(hoisted.deleteMutate).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("opens an inline color picker and dispatches update mutation on color change", () => {
    hoisted.usePdfHighlightsMock.mockReturnValue({
      data: { highlights: [makeHighlight({ id: "x", color: "yellow" })] },
      isLoading: false,
      error: null,
    });
    hoisted.updateMutate.mockReset();
    render(<HighlightSidebar sourceId="s1" />);
    fireEvent.click(screen.getByLabelText(/色を変更/));
    const menu = screen.getByRole("menu");
    const blueSwatch = within(menu).getByLabelText("blue");
    fireEvent.click(blueSwatch);
    expect(hoisted.updateMutate).toHaveBeenCalledWith(
      { highlightId: "x", body: { color: "blue" } },
      expect.any(Object),
    );
  });
});
