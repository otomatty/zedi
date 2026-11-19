/**
 * NoteMeRedirect: `/notes/me` ランディング（issue #825）。
 * `useMyNote` の状態（読み込み中・解決済み・エラー）に応じて
 * スケルトン / `Navigate` / インラインエラーを描画すること、クエリの引き継ぎ、
 * オンボーディング未完了時の `/onboarding` リダイレクトを検証する。
 *
 * NoteMeRedirect: tests for the `/notes/me` landing page (issue #825).
 * Verifies that the component renders a skeleton while `useMyNote` is
 * loading, issues a `<Navigate replace>` to `/notes/:noteId` once resolved
 * (keeping the query string), shows an inline error rather than redirecting
 * on failure, and redirects to `/onboarding` when the setup wizard is still
 * pending.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import NoteMeRedirect from "./NoteMeRedirect";

const useMyNoteMock = vi.fn();
const useOnboardingMock = vi.fn();

vi.mock("@/hooks/notes/useNoteQueries", () => ({
  useMyNote: (...args: unknown[]) => useMyNoteMock(...args),
}));

vi.mock("@/hooks/auth/useOnboarding", () => ({
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

function OnboardingProbe() {
  const location = useLocation();
  return (
    <div data-testid="onboarding">
      onboarding
      <span data-testid="onboarding-search">{location.search}</span>
      <span data-testid="onboarding-hash">{location.hash}</span>
    </div>
  );
}

function renderAt(path = "/notes/me") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/notes/me" element={<NoteMeRedirect />} />
        <Route path="/notes/:noteId" element={<NoteViewProbe />} />
        <Route path="/onboarding" element={<OnboardingProbe />} />
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

  it("forwards the query string to /notes/:noteId unchanged", () => {
    useMyNoteMock.mockReturnValue({
      data: { id: "note-default-123" },
      isLoading: false,
      error: null,
    });
    // `clipUrl` はブラウザ拡張の廃止で特別扱いしなくなった。
    // `clipUrl` is no longer special now that the browser extension is gone.
    const search = `?keep=1&clipUrl=${encodeURIComponent("chrome://extensions")}`;
    renderAt(`/notes/me${search}`);
    expect(screen.getByTestId("note-view-search")).toHaveTextContent(search);
  });

  it("redirects to /onboarding when the setup wizard is still pending", () => {
    useOnboardingMock.mockReturnValue({ needsSetupWizard: true });
    useMyNoteMock.mockReturnValue({
      data: { id: "note-default-123" },
      isLoading: false,
      error: null,
    });
    renderAt("/notes/me?keep=1#section");
    expect(screen.getByTestId("onboarding")).toBeInTheDocument();
    expect(screen.getByTestId("onboarding-search")).toHaveTextContent("?keep=1");
    expect(screen.getByTestId("onboarding-hash")).toHaveTextContent("#section");
    expect(screen.queryByTestId("note-view")).not.toBeInTheDocument();
    expect(useMyNoteMock).toHaveBeenCalledWith({ enabled: false });
  });
});
