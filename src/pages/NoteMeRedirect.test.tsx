/**
 * NoteMeRedirect: `/notes/me` ランディング（issue #825 / PR 2a, issue #826 / PR 2b）。
 * `useMyNote` の状態（読み込み中・解決済み・エラー）に応じて
 * スケルトン / `Navigate` / インラインエラーを描画することに加え、
 * `clipUrl` クエリの引き継ぎとオンボーディング未完了時の `/onboarding`
 * リダイレクトを検証する。
 *
 * NoteMeRedirect: tests for the `/notes/me` landing page (issue #825 / PR 2a,
 * issue #826 / PR 2b). Verifies that the component renders a skeleton while
 * `useMyNote` is loading, issues a `<Navigate replace>` to `/notes/:noteId`
 * once resolved, shows an inline error rather than redirecting on failure,
 * forwards a validated `clipUrl` query into the note view, drops invalid
 * clip URLs, and redirects to `/onboarding` when the setup wizard is still
 * pending.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import NoteMeRedirect from "./NoteMeRedirect";

const useMyNoteMock = vi.fn();
const useOnboardingMock = vi.fn();

vi.mock("@/hooks/useNoteQueries", () => ({
  useMyNote: () => useMyNoteMock(),
}));

vi.mock("@/hooks/useOnboarding", () => ({
  useOnboarding: () => useOnboardingMock(),
}));

function NoteViewProbe() {
  const location = useLocation();
  return (
    <div data-testid="note-view">
      <span data-testid="note-view-search">{location.search}</span>
    </div>
  );
}

function renderAt(path = "/notes/me") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/notes/me" element={<NoteMeRedirect />} />
        <Route path="/notes/:noteId" element={<NoteViewProbe />} />
        <Route path="/onboarding" element={<div data-testid="onboarding">onboarding</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("NoteMeRedirect", () => {
  beforeEach(() => {
    useMyNoteMock.mockReset();
    useOnboardingMock.mockReset();
    useOnboardingMock.mockReturnValue({ needsSetupWizard: false });
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
    expect(screen.getByTestId("note-view-search")).toHaveTextContent("");
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

  it("forwards a validated `clipUrl` query into /notes/:noteId", () => {
    useMyNoteMock.mockReturnValue({
      data: { id: "note-default-123" },
      isLoading: false,
      error: null,
    });
    const clipUrl = "https://example.com/article";
    renderAt(`/notes/me?clipUrl=${encodeURIComponent(clipUrl)}&from=chrome-extension`);
    // 検証 OK の clipUrl は引き継ぐ。`from` のような他クエリは保持しなくてよい
    // （NoteView 側では使わない）。
    // Validated `clipUrl` is forwarded. Auxiliary params like `from` are
    // dropped because NoteView only consumes `clipUrl`.
    expect(screen.getByTestId("note-view-search")).toHaveTextContent(
      `?clipUrl=${encodeURIComponent(clipUrl)}`,
    );
  });

  it("drops a `clipUrl` that fails the URL policy check", () => {
    useMyNoteMock.mockReturnValue({
      data: { id: "note-default-123" },
      isLoading: false,
      error: null,
    });
    renderAt(`/notes/me?clipUrl=${encodeURIComponent("chrome://extensions")}`);
    // Invalid URLs are stripped — the note view sees no `clipUrl` query.
    // 検証 NG の URL は剥がし、ノートビューは clipUrl を受け取らない。
    expect(screen.getByTestId("note-view-search")).toHaveTextContent("");
  });

  it("redirects to /onboarding when the setup wizard is still pending", () => {
    useOnboardingMock.mockReturnValue({ needsSetupWizard: true });
    useMyNoteMock.mockReturnValue({
      data: { id: "note-default-123" },
      isLoading: false,
      error: null,
    });
    renderAt(`/notes/me?clipUrl=${encodeURIComponent("https://example.com/x")}`);
    expect(screen.getByTestId("onboarding")).toBeInTheDocument();
    expect(screen.queryByTestId("note-view")).not.toBeInTheDocument();
  });
});
