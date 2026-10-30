// @vitest-environment happy-dom
import { QueryClient } from "@tanstack/query-core";
import { findByText, fireEvent } from "@testing-library/dom";
import { render } from "hono/jsx/dom";
import { describe, expect, it } from "vitest";
import { QueryClientContext } from "./query";
import { useInfiniteQuery } from "./infiniteQuery";

type Page = { items: string[]; next: number | null };
const pages: Record<number, Page> = {
  0: { items: ["a", "b"], next: 1 },
  1: { items: ["c"], next: null },
};

describe("useInfiniteQuery (hono/jsx/dom adapter)", () => {
  it("loads the first page and appends the next page on demand", async () => {
    const Probe = () => {
      const q = useInfiniteQuery<Page, number>({
        queryKey: ["letters"],
        initialPageParam: 0,
        queryFn: async ({ pageParam }) => pages[pageParam] as Page,
        getNextPageParam: (last) => last.next ?? undefined,
      });
      const items = q.data?.pages.flatMap((p) => p.items) ?? [];
      return (
        <div>
          <p>{`items:${items.join(",")} more:${String(q.hasNextPage)}`}</p>
          <button onClick={() => void q.fetchNextPage()}>more</button>
        </div>
      );
    };
    const container = document.createElement("div");
    document.body.append(container);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientContext.Provider value={client}>
        <Probe />
      </QueryClientContext.Provider>,
      container,
    );
    await findByText(container, "items:a,b more:true");
    fireEvent.click(await findByText(container, "more"));
    expect(await findByText(container, "items:a,b,c more:false")).toBeTruthy();
  });
});
