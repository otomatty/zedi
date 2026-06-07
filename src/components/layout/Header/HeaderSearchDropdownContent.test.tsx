import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Popover, PopoverAnchor } from "@zedi/ui";
import type { GlobalSearchResultItem } from "@/hooks/useGlobalSearch";

// ─── 仮想化のモック ────────────────────────────────────────────────
// jsdom はレイアウトを行わずスクロール要素の高さが 0 になるため、PageGrid.test.tsx
// と同じく `useVirtualizer` を決定的な window にモックして仮想化レンダリングだけ
// を検証する。`scrollToIndex` も呼ばれるのでスタブに含める。
// jsdom does no layout, so mock `useVirtualizer` with a deterministic window
// (mirroring PageGrid.test.tsx) and stub `scrollToIndex`.
const VIRTUAL_ROW_HEIGHT = 40;

// scrollToIndex はレンダーをまたいで参照を保つよう module スコープに置き、
// マウスホバー時に呼ばれない／キーボード追従時に呼ばれることを検証する。
// Hoisted so the same spy persists across renders, to assert hover does not
// scroll while keyboard navigation does.
const scrollToIndexMock = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getVirtualItems: () =>
      Array.from({ length: count }, (_, i) => ({
        index: i,
        key: `row-${i}`,
        start: i * VIRTUAL_ROW_HEIGHT,
        size: VIRTUAL_ROW_HEIGHT,
        end: (i + 1) * VIRTUAL_ROW_HEIGHT,
        lane: 0,
      })),
    getTotalSize: () => count * VIRTUAL_ROW_HEIGHT,
    scrollToIndex: scrollToIndexMock,
    measure: vi.fn(),
    measureElement: vi.fn(),
  }),
}));

import { HeaderSearchDropdownContent } from "./HeaderSearchDropdownContent";

function makeResults(n: number): GlobalSearchResultItem[] {
  return Array.from({ length: n }, (_, i) => ({
    kind: "page",
    pageId: `page-${i}`,
    noteId: `note-${i}`,
    title: `Result ${i}`,
    highlightedText: "",
    matchType: "title",
  })) as unknown as GlobalSearchResultItem[];
}

function renderDropdown(
  overrides: Partial<Parameters<typeof HeaderSearchDropdownContent>[0]> = {},
) {
  const searchResults = overrides.searchResults ?? makeResults(3);
  const onSelectItem = vi.fn();
  const setActiveIndex = vi.fn();
  const props: Parameters<typeof HeaderSearchDropdownContent>[0] = {
    hasContent: true,
    showEmpty: false,
    showResults: searchResults.length > 0,
    searchResults,
    itemCount: searchResults.length,
    activeIndex: -1,
    query: "result",
    hasQuery: true,
    footerRef: { current: null },
    getOptionId: (index: number) =>
      index === searchResults.length ? "header-search-footer" : `header-search-option-${index}`,
    onSelectItem,
    setActiveIndex,
    closeDropdown: vi.fn(),
    handleSearchSubmit: vi.fn(),
    ...overrides,
  };
  // PopoverContent は Radix の Popover コンテキストを要求するため、open な
  // Popover でラップする。
  const ui = (p: Parameters<typeof HeaderSearchDropdownContent>[0]) => (
    <Popover open>
      <PopoverAnchor />
      <HeaderSearchDropdownContent {...p} />
    </Popover>
  );
  const { rerender } = render(ui(props));
  return {
    onSelectItem,
    setActiveIndex,
    props,
    rerenderWith: (next: Partial<typeof props>) => rerender(ui({ ...props, ...next })),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("HeaderSearchDropdownContent", () => {
  it("renders result options with stable ids and aria-selected for the active row", () => {
    renderDropdown({ activeIndex: 1 });

    const options = screen.getAllByRole("option");
    // 3 件の結果 + footer の「すべて表示」行
    expect(options).toHaveLength(4);

    expect(screen.getByText("Result 0").closest("button")).toHaveAttribute(
      "id",
      "header-search-option-0",
    );
    expect(screen.getByText("Result 1").closest("button")).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Result 0").closest("button")).toHaveAttribute(
      "aria-selected",
      "false",
    );
  });

  it("calls onSelectItem when an option is clicked", () => {
    const { onSelectItem, props } = renderDropdown();
    fireEvent.click(screen.getByText("Result 2"));
    expect(onSelectItem).toHaveBeenCalledWith(props.searchResults[2]);
  });

  it("updates the active index on mouse enter", () => {
    const { setActiveIndex } = renderDropdown();
    fireEvent.mouseEnter(screen.getByText("Result 1"));
    expect(setActiveIndex).toHaveBeenCalledWith(1);
  });

  it("renders the show-all footer when there is a query", () => {
    renderDropdown();
    expect(screen.getByText(/の検索結果をすべて表示/)).toBeInTheDocument();
  });

  it("follows the active row with scrollToIndex on keyboard navigation", () => {
    const { rerenderWith } = renderDropdown({ activeIndex: -1 });
    scrollToIndexMock.mockClear();
    // キーボード操作相当: activeIndex prop が外部から変わる。
    rerenderWith({ activeIndex: 2 });
    expect(scrollToIndexMock).toHaveBeenCalledWith(2, { align: "auto" });
  });

  it("does not scroll-snap when the active row changes via mouse hover", () => {
    const { rerenderWith } = renderDropdown({ activeIndex: -1 });
    scrollToIndexMock.mockClear();
    // ホバーで activeIndex が変わったことを記録してから prop 変更を反映する。
    fireEvent.mouseEnter(screen.getByText("Result 1"));
    rerenderWith({ activeIndex: 1 });
    expect(scrollToIndexMock).not.toHaveBeenCalled();
  });
});
