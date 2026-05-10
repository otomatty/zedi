/**
 * NotePageCount: per-note total page count badge. Desktop-only — hidden on
 * mobile because the bottom nav already surfaces page-related affordances and
 * the floating count would otherwise crowd the FAB thumb-reach area.
 *
 * ノート単位の総ページ数バッジ。モバイルではボトムナビが関連アクションを
 * 提供しており、FAB の親指リーチ領域と重なってしまうため非表示にする。
 */
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NotePageCount } from "./NotePageCount";
import { useNotePages } from "@/hooks/useNoteQueries";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { count?: number }) =>
      options?.count !== undefined ? `${key}:${options.count}` : key,
    i18n: { language: "ja" },
  }),
}));

vi.mock("@/hooks/useNoteQueries", () => ({
  useNotePages: vi.fn(),
}));

describe("NotePageCount", () => {
  it("returns null while note pages are loading", () => {
    vi.mocked(useNotePages).mockReturnValue({
      data: undefined,
      isLoading: true,
    } as unknown as ReturnType<typeof useNotePages>);

    const { container } = render(<NotePageCount noteId="note-1" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the total count excluding deleted pages on desktop", () => {
    vi.mocked(useNotePages).mockReturnValue({
      data: [
        { id: "a", isDeleted: false },
        { id: "b", isDeleted: false },
        { id: "c", isDeleted: true },
      ],
      isLoading: false,
    } as unknown as ReturnType<typeof useNotePages>);

    render(<NotePageCount noteId="note-1" />);
    expect(screen.getByText(/notes\.totalPages:2/)).toBeInTheDocument();
  });

  it("passes the given noteId to useNotePages", () => {
    vi.mocked(useNotePages).mockReturnValue({
      data: [],
      isLoading: false,
    } as unknown as ReturnType<typeof useNotePages>);

    render(<NotePageCount noteId="note-xyz" />);
    expect(vi.mocked(useNotePages)).toHaveBeenCalledWith("note-xyz");
  });

  it("is hidden on mobile viewports via Tailwind utilities", () => {
    vi.mocked(useNotePages).mockReturnValue({
      data: [{ id: "a", isDeleted: false }],
      isLoading: false,
    } as unknown as ReturnType<typeof useNotePages>);

    const { container } = render(<NotePageCount noteId="note-1" />);
    const badge = container.firstElementChild as HTMLElement | null;
    expect(badge).not.toBeNull();
    // `hidden` with an `md:*` override ensures the badge only appears at
    // desktop widths (Tailwind md breakpoint = 768px).
    // `hidden` + `md:*` で md (768px) 以上のみ表示されることを担保する。
    expect(badge?.className).toMatch(/\bhidden\b/);
    expect(badge?.className).toMatch(/\bmd:(flex|inline-flex|block)\b/);
  });
});
