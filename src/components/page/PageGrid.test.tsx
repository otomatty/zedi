import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { PageSummary } from "@/types/page";

// ─── External dependency mocks ─────────────────────────────────────
// 仮想化の検証だけにフォーカスし、PageCard とその依存ツリーをモックする。
// Focus the test on virtualization by mocking PageCard and its dep tree.

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ isSignedIn: true, user: null }),
}));

vi.mock("@/hooks/useContainerColumns", () => ({
  useContainerColumns: () => ({ ref: { current: null }, columns: 4 }),
  widthToColumns: vi.fn(),
}));

vi.mock("@/lib/sync", () => ({
  hasNeverSynced: () => false,
}));

const personalQueryData: { current: PageSummary[] | undefined; isLoading: boolean } = {
  current: undefined,
  isLoading: false,
};
const noteQueryData: { current: PageSummary[] | undefined; isLoading: boolean } = {
  current: undefined,
  isLoading: false,
};

vi.mock("@/hooks/usePageQueries", () => ({
  usePagesSummary: () => ({
    data: personalQueryData.current,
    isLoading: personalQueryData.isLoading,
  }),
  useSyncStatus: () => "idle",
}));

vi.mock("@/hooks/useNoteQueries", () => ({
  useNotePages: () => ({ data: noteQueryData.current, isLoading: noteQueryData.isLoading }),
}));

vi.mock("./PageCard", () => ({
  default: vi.fn(({ page }: { page: PageSummary }) => (
    <div data-testid="page-card" data-page-id={page.id}>
      {page.id}
    </div>
  )),
}));

vi.mock("./EmptyState", () => ({
  default: () => <div data-testid="empty-state" />,
}));

// useVirtualizer のモック：count 分のうち overscan+10 件だけ返す。
// Mock the virtualizer to return only a bounded number of virtual rows.
const VIRTUAL_VISIBLE = 10;
vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count, overscan = 0 }: { count: number; overscan?: number }) => {
    const visible = Math.min(count, VIRTUAL_VISIBLE + overscan);
    return {
      getVirtualItems: () =>
        Array.from({ length: visible }, (_, i) => ({
          index: i,
          key: `row-${i}`,
          start: i * 220,
          size: 220,
          end: (i + 1) * 220,
          lane: 0,
        })),
      getTotalSize: () => count * 220,
      measure: vi.fn(),
      measureElement: vi.fn(),
    };
  },
}));

// 依存モック後に import する。Import after mocks so the mocks are applied.
import PageGrid from "./PageGrid";

function makePages(n: number): PageSummary[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `page-${i}`,
    title: `Page ${i}`,
    contentPreview: null,
    updatedAt: Date.now() - i * 1000,
    thumbnailUrl: undefined,
    sourceUrl: undefined,
    isDeleted: false,
  })) as unknown as PageSummary[];
}

beforeEach(() => {
  personalQueryData.current = undefined;
  personalQueryData.isLoading = false;
  noteQueryData.current = undefined;
  noteQueryData.isLoading = false;
});

describe("PageGrid", () => {
  it("renders the empty state when no pages exist", () => {
    personalQueryData.current = [];
    render(<PageGrid />);
    expect(screen.getByTestId("empty-state")).toBeInTheDocument();
  });

  it("renders skeleton while pages are loading and not yet present", () => {
    personalQueryData.current = [];
    personalQueryData.isLoading = true;
    render(<PageGrid />);
    expect(screen.queryByTestId("empty-state")).not.toBeInTheDocument();
    expect(screen.queryAllByTestId("page-card")).toHaveLength(0);
  });

  it("renders a small bounded number of PageCards for a 1000-page note", () => {
    noteQueryData.current = makePages(1000);
    render(<PageGrid noteId="note-1" />);

    const cards = screen.queryAllByTestId("page-card");
    // 1000 ページあっても、仮想化により大幅に少ない枚数しか DOM に出ない。
    // 1000 pages must virtualize down to a small constant DOM count.
    expect(cards.length).toBeLessThan(100);
    expect(cards.length).toBeGreaterThan(0);
  });

  it("renders only the visible window of pages, not all of them", () => {
    const allPages = makePages(500);
    noteQueryData.current = allPages;
    render(<PageGrid noteId="note-2" />);

    const cards = screen.queryAllByTestId("page-card");
    // 仮想化されているので、後ろの方の id (page-499 等) は出てこない。
    // Virtualization should NOT render trailing pages.
    const renderedIds = cards.map((c) => c.dataset.pageId);
    expect(renderedIds).not.toContain("page-499");
    expect(renderedIds).not.toContain("page-300");
  });

  it("renders the first page first (sorted by updatedAt desc)", () => {
    noteQueryData.current = makePages(20);
    render(<PageGrid noteId="note-3" />);

    const cards = screen.queryAllByTestId("page-card");
    // 先頭のカードは最新の updatedAt = page-0。
    // First rendered card is the most-recently-updated (page-0 in our mock).
    expect(cards[0]?.dataset.pageId).toBe("page-0");
  });
});
