// @vitest-environment happy-dom
import { QueryClient } from "@tanstack/query-core";
import { findByRole, findByText, fireEvent, waitFor } from "@testing-library/dom";
import { render } from "hono/jsx/dom";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { PageListResponse } from "../../shared/types";
import { fetchPageList } from "../api";
import { QueryClientContext } from "../lib/query";
import { NotesPage } from "./NotesPage";

vi.mock("../api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api")>()),
  fetchPageList: vi.fn(),
}));

const listPage = (titles: string[], nextCursor: string | null): PageListResponse => ({
  items: titles.map((title) => ({ id: title, title, preview: "", updatedAt: 0 })),
  nextCursor,
  total: 4,
  role: "owner",
});

function mount() {
  const container = document.createElement("div");
  document.body.append(container);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientContext.Provider value={client}>
      <NotesPage noteId="n1" />
    </QueryClientContext.Provider>,
    container,
  );
  return container;
}

// happy-dom has no layout: give elements a viewport-sized box so the virtual list renders rows.
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, value: 600 });
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, value: 800 });
});
afterAll(() => {
  Reflect.deleteProperty(HTMLElement.prototype, "clientHeight");
  Reflect.deleteProperty(HTMLElement.prototype, "clientWidth");
});

describe("NotesPage", () => {
  it("keeps the loaded rows when a later page fails, and retries that page", async () => {
    vi.mocked(fetchPageList)
      .mockResolvedValueOnce(listPage(["first", "second"], "c1"))
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(listPage(["third", "fourth"], null));
    const container = mount();

    const retry = await findByRole(container, "button", { name: "続きを再読み込み" });
    expect(container.textContent).toContain("first");
    expect(container.textContent).toContain("second");
    expect(container.querySelector("[role=alert]")).not.toBeNull();

    fireEvent.click(retry);

    expect(await findByText(container, "third")).toBeTruthy();
    await waitFor(() => expect(fetchPageList).toHaveBeenLastCalledWith("n1", "c1"));
  });

  it("offers a retry when the first page fails", async () => {
    vi.mocked(fetchPageList)
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(listPage(["first"], null));
    const container = mount();

    fireEvent.click(await findByRole(container, "button", { name: "再読み込み" }));

    expect(await findByText(container, "first")).toBeTruthy();
  });
});
