// @vitest-environment happy-dom
import { QueryClient } from "@tanstack/query-core";
import { findAllByRole, findByRole, fireEvent, waitFor } from "@testing-library/dom";
import { render, useState } from "hono/jsx/dom";
import { describe, expect, it, vi } from "vitest";
import { QueryClientContext } from "../lib/query";
import { SearchPalette, type SearchResult } from "./SearchPalette";

const result = (titles: string[]): SearchResult => ({
  items: titles.map((title, i) => ({ id: `p${i}`, title, preview: "", updatedAt: 0 })),
  offline: false,
});

/** The shell's usage: a button opens the palette and closing unmounts it. */
function Harness({ search }: { search: (query: string) => Promise<SearchResult> }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        open
      </button>
      {open && (
        <SearchPalette
          search={search}
          online
          onSelect={() => setOpen(false)}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

function mount(search: (query: string) => Promise<SearchResult>) {
  const container = document.createElement("div");
  document.body.append(container);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientContext.Provider value={client}>
      <Harness search={search} />
    </QueryClientContext.Provider>,
    container,
  );
  return container;
}

describe("SearchPalette", () => {
  it("searches what is typed and lists the results", async () => {
    const search = vi.fn(async (query: string) => result(query ? [`${query} page`] : []));
    const container = mount(search);
    fireEvent.click(await findByRole(container, "button", { name: "open" }));

    const input = await findByRole(container, "combobox");
    fireEvent.input(input, { target: { value: "知識" } });

    const options = await findAllByRole(container, "option");
    expect(options.map((o) => o.textContent)).toEqual(["知識 page"]);
  });

  it("starts empty when reopened, so Enter cannot open a result of the previous search", async () => {
    // 入力欄だけ空で前回の結果が残ると、Enter で前回の結果に移動してしまう。
    // An empty input over the previous results would let Enter open one of them.
    const search = vi.fn(async (query: string) => result(query ? [`${query} page`] : []));
    const container = mount(search);
    fireEvent.click(await findByRole(container, "button", { name: "open" }));
    fireEvent.input(await findByRole(container, "combobox"), { target: { value: "知識" } });
    await findAllByRole(container, "option");
    fireEvent.keyDown(await findByRole(container, "combobox"), { key: "Escape" });
    await waitFor(() => expect(container.querySelector("dialog")).toBeNull());

    fireEvent.click(await findByRole(container, "button", { name: "open" }));

    const input = (await findByRole(container, "combobox")) as HTMLInputElement;
    expect(input.value).toBe("");
    expect(container.querySelectorAll("[role=option]")).toHaveLength(0);
  });
});
