/**
 * NoteMeRedirect: `/notes/me` ランディング（issue #825 / PR 2a）。
 * `useMyNote` の状態（読み込み中・解決済み・エラー）に応じて
 * スケルトン / `Navigate` / インラインエラーを描画することを検証する。
 *
 * NoteMeRedirect: tests for the `/notes/me` landing page (issue #825 / PR 2a).
 * Verifies that the component renders a skeleton while `useMyNote` is loading,
 * issues a `<Navigate replace>` to `/notes/:noteId` once resolved, and shows
 * an inline error rather than redirecting on failure.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import NoteMeRedirect from "./NoteMeRedirect";

const useMyNoteMock = vi.fn();

vi.mock("@/hooks/useNoteQueries", () => ({
  useMyNote: () => useMyNoteMock(),
}));

function renderAt(path = "/notes/me") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/notes/me" element={<NoteMeRedirect />} />
        <Route path="/notes/:noteId" element={<div data-testid="note-view">note view</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("NoteMeRedirect", () => {
  beforeEach(() => {
    useMyNoteMock.mockReset();
  });

  it("renders a skeleton while `useMyNote` is loading", () => {
    useMyNoteMock.mockReturnValue({ data: undefined, isLoading: true, error: null });
    const { container } = renderAt();
    // Skeleton コンポーネントは role を持たないので、`animate-pulse` の有無で確認する。
    // The Skeleton primitive has no role; assert via its `animate-pulse` class.
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
    expect(screen.queryByTestId("note-view")).not.toBeInTheDocument();
  });

  it("redirects to /notes/:noteId when the default note resolves", () => {
    useMyNoteMock.mockReturnValue({
      data: { id: "note-default-123" },
      isLoading: false,
      error: null,
    });
    renderAt();
    expect(screen.getByTestId("note-view")).toBeInTheDocument();
  });

  it("does not redirect when resolution fails", () => {
    useMyNoteMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error("boom"),
    });
    renderAt();
    expect(screen.queryByTestId("note-view")).not.toBeInTheDocument();
    expect(screen.getByText(/boom/)).toBeInTheDocument();
  });
});
