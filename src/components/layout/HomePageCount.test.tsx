/**
 * HomePageCount: home page total count badge. Desktop-only — hidden on mobile
 * because the bottom nav already surfaces page-related affordances and the
 * floating count would otherwise crowd the FAB thumb-reach area.
 *
 * ホームページ用の総ページ数バッジ。モバイルではボトムナビが関連アクションを
 * 提供しており、FAB の親指リーチ領域と重なってしまうため非表示にする。
 */
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { HomePageCount } from "./HomePageCount";
import { usePagesSummary } from "@/hooks/usePageQueries";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { count?: number }) =>
      options?.count !== undefined ? `${key}:${options.count}` : key,
    i18n: { language: "ja" },
  }),
}));

vi.mock("@/hooks/usePageQueries", () => ({
  usePagesSummary: vi.fn(),
}));

describe("HomePageCount", () => {
  it("returns null while pages summary is loading", () => {
    vi.mocked(usePagesSummary).mockReturnValue({
      data: undefined,
      isLoading: true,
    } as unknown as ReturnType<typeof usePagesSummary>);

    const { container } = render(<HomePageCount />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the total count excluding deleted pages on desktop", () => {
    vi.mocked(usePagesSummary).mockReturnValue({
      data: [
        { id: "a", isDeleted: false },
        { id: "b", isDeleted: false },
        { id: "c", isDeleted: true },
      ],
      isLoading: false,
    } as unknown as ReturnType<typeof usePagesSummary>);

    render(<HomePageCount />);
    expect(screen.getByText(/home\.totalPages:2/)).toBeInTheDocument();
  });

  it("is hidden on mobile viewports via Tailwind utilities", () => {
    vi.mocked(usePagesSummary).mockReturnValue({
      data: [{ id: "a", isDeleted: false }],
      isLoading: false,
    } as unknown as ReturnType<typeof usePagesSummary>);

    const { container } = render(<HomePageCount />);
    const badge = container.firstElementChild as HTMLElement | null;
    expect(badge).not.toBeNull();
    // `hidden` with an `md:*` override ensures the badge only appears at
    // desktop widths (Tailwind md breakpoint = 768px).
    // `hidden` + `md:*` で md (768px) 以上のみ表示されることを担保する。
    expect(badge?.className).toMatch(/\bhidden\b/);
    expect(badge?.className).toMatch(/\bmd:(flex|inline-flex|block)\b/);
  });
});
