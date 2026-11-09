/** インデックス読み込みと再構築 / Index loading and rebuilding. */
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import IndexPage from "./IndexPage";

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), toast: vi.fn() }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => (key === "common.date.format.fullDateTime" ? "yyyy-MM-dd HH:mm" : key),
  }),
  initReactI18next: { type: "3rdParty", init: () => undefined },
}));
vi.mock("@zedi/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@zedi/ui")>()),
  useToast: () => ({ toast: mocks.toast }),
}));

const initial = {
  pageId: "index-1",
  noteId: "note-1",
  lastBuiltAt: null,
  totalPages: 2,
  categories: [{ label: "Initial category", count: 2 }],
};

function view() {
  return render(
    <MemoryRouter>
      <IndexPage />
    </MemoryRouter>,
  );
}

/** 完了を制御する HTTP 応答 / A controllable HTTP response. */
function deferredResponse() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("IndexPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", mocks.fetch);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("disables rebuilding until the initial summary arrives and links to the index", async () => {
    const request = deferredResponse();
    mocks.fetch.mockReturnValueOnce(request.promise);
    view();
    expect(screen.getByRole("button", { name: "common.wikiIndex.rebuild" })).toBeDisabled();
    expect(mocks.fetch).toHaveBeenCalledExactlyOnceWith("/api/activity/index", {
      credentials: "include",
    });

    await act(async () => request.resolve(Response.json(initial)));

    expect(screen.getByText("Initial category")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "common.wikiIndex.openIndexPage" })).toHaveAttribute(
      "href",
      "/notes/note-1/index-1",
    );
    expect(screen.getByRole("button", { name: "common.wikiIndex.rebuild" })).toBeEnabled();
  });

  it("rebuilds once, prevents another request while pending, and replaces the summary", async () => {
    const request = deferredResponse();
    mocks.fetch.mockResolvedValueOnce(Response.json(initial)).mockReturnValueOnce(request.promise);
    view();
    await screen.findByText("Initial category");

    fireEvent.click(screen.getByRole("button", { name: "common.wikiIndex.rebuild" }));

    expect(screen.getByRole("button", { name: "common.wikiIndex.rebuild" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "common.wikiIndex.rebuild" }));
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(mocks.fetch).toHaveBeenNthCalledWith(2, "/api/activity/index/rebuild", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    });
    await act(async () =>
      request.resolve(
        Response.json({
          pageId: "index-2",
          noteId: "note-2",
          created: true,
          generatedAt: "2026-05-17T00:00:00Z",
          totalPages: 5,
          categories: [{ label: "Rebuilt category", count: 5 }],
        }),
      ),
    );

    expect(screen.getByText("Rebuilt category")).toBeInTheDocument();
    expect(screen.queryByText("Initial category")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "common.wikiIndex.openIndexPage" })).toHaveAttribute(
      "href",
      "/notes/note-2/index-2",
    );
    expect(screen.getByRole("button", { name: "common.wikiIndex.rebuild" })).toBeEnabled();
  });

  it("shows an initial load error and allows rebuilding", async () => {
    mocks.fetch.mockResolvedValueOnce(new Response(null, { status: 500 }));
    view();

    expect(await screen.findByText("Fetch failed: HTTP 500")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "common.wikiIndex.rebuild" })).toBeEnabled();
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });

  it("shows a failed rebuild and retains the loaded summary for retry", async () => {
    mocks.fetch
      .mockResolvedValueOnce(Response.json(initial))
      .mockResolvedValueOnce(new Response(null, { status: 500 }));
    view();
    await screen.findByText("Initial category");

    fireEvent.click(screen.getByRole("button", { name: "common.wikiIndex.rebuild" }));

    expect(await screen.findByText("Rebuild failed: HTTP 500")).toBeInTheDocument();
    expect(screen.getByText("Initial category")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "common.wikiIndex.rebuild" })).toBeEnabled();
    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith({
        title: "errors.indexRebuildFailed",
        variant: "destructive",
      }),
    );
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });

  it("shows the empty state and no index link when nothing has been built", async () => {
    mocks.fetch.mockResolvedValueOnce(
      Response.json({
        pageId: null,
        noteId: null,
        lastBuiltAt: null,
        totalPages: 0,
        categories: [],
      }),
    );
    view();

    expect(await screen.findByText("common.wikiIndex.noPagesYet")).toBeInTheDocument();
    expect(screen.getByText("common.wikiIndex.notBuiltYet")).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "common.wikiIndex.openIndexPage" }),
    ).not.toBeInTheDocument();
  });

  it("ignores an obsolete Strict Mode success after the current summary loads", async () => {
    const obsolete = deferredResponse();
    mocks.fetch.mockReturnValueOnce(obsolete.promise).mockResolvedValueOnce(Response.json(initial));
    render(
      <StrictMode>
        <MemoryRouter>
          <IndexPage />
        </MemoryRouter>
      </StrictMode>,
    );
    await screen.findByText("Initial category");

    await act(async () =>
      obsolete.resolve(
        Response.json({
          ...initial,
          pageId: "obsolete-index",
          categories: [{ label: "Obsolete category", count: 1 }],
        }),
      ),
    );

    expect(screen.getByText("Initial category")).toBeInTheDocument();
    expect(screen.queryByText("Obsolete category")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "common.wikiIndex.openIndexPage" })).toHaveAttribute(
      "href",
      "/notes/note-1/index-1",
    );
  });

  it("ignores an obsolete Strict Mode failure after the current summary loads", async () => {
    const obsolete = deferredResponse();
    mocks.fetch.mockReturnValueOnce(obsolete.promise).mockResolvedValueOnce(Response.json(initial));
    render(
      <StrictMode>
        <MemoryRouter>
          <IndexPage />
        </MemoryRouter>
      </StrictMode>,
    );
    await screen.findByText("Initial category");

    await act(async () => obsolete.resolve(new Response(null, { status: 500 })));

    expect(screen.getByText("Initial category")).toBeInTheDocument();
    expect(screen.queryByText("Fetch failed: HTTP 500")).not.toBeInTheDocument();
    expect(mocks.toast).not.toHaveBeenCalled();
  });

  it("keeps rebuilding disabled when only an obsolete Strict Mode request finishes", async () => {
    const obsolete = deferredResponse();
    const current = deferredResponse();
    mocks.fetch.mockReturnValueOnce(obsolete.promise).mockReturnValueOnce(current.promise);
    render(
      <StrictMode>
        <MemoryRouter>
          <IndexPage />
        </MemoryRouter>
      </StrictMode>,
    );
    expect(mocks.fetch).toHaveBeenCalledTimes(2);

    await act(async () => obsolete.resolve(Response.json(initial)));

    expect(screen.getByRole("button", { name: "common.wikiIndex.rebuild" })).toBeDisabled();
    expect(screen.queryByText("Initial category")).not.toBeInTheDocument();
    await act(async () => current.resolve(Response.json(initial)));
    expect(screen.getByText("Initial category")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "common.wikiIndex.rebuild" })).toBeEnabled();
  });
});
