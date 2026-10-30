// @vitest-environment happy-dom
import { QueryClient } from "@tanstack/query-core";
import { findByText, fireEvent } from "@testing-library/dom";
import type { Child } from "hono/jsx";
import { render, useState } from "hono/jsx/dom";
import { describe, expect, it } from "vitest";
import { QueryClientContext, useQuery } from "./query";

function mount(node: Child) {
  const container = document.createElement("div");
  document.body.append(container);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientContext.Provider value={client}>{node}</QueryClientContext.Provider>,
    container,
  );
  return container;
}

describe("useQuery (hono/jsx/dom adapter over @tanstack/query-core)", () => {
  it("renders pending first and then the resolved data", async () => {
    const Probe = () => {
      const q = useQuery({ queryKey: ["greeting"], queryFn: async () => "hello" });
      return <p>{`${q.status}:${q.data ?? ""}`}</p>;
    };
    const container = mount(<Probe />);
    expect(container.textContent).toBe("pending:");
    expect(await findByText(container, "success:hello")).toBeTruthy();
  });

  it("surfaces a rejected query as an error state", async () => {
    const Probe = () => {
      const q = useQuery({
        queryKey: ["broken"],
        queryFn: async (): Promise<string> => {
          throw new Error("boom");
        },
      });
      return <p>{q.status === "error" ? `error:${(q.error as Error).message}` : q.status}</p>;
    };
    const container = mount(<Probe />);
    expect(await findByText(container, "error:boom")).toBeTruthy();
  });

  it("refetches when the query key changes", async () => {
    const Probe = () => {
      const [id, setId] = useState(1);
      const q = useQuery({ queryKey: ["item", id], queryFn: async () => `item-${id}` });
      return (
        <div>
          <p>{q.data ?? "…"}</p>
          <button onClick={() => setId(2)}>next</button>
        </div>
      );
    };
    const container = mount(<Probe />);
    await findByText(container, "item-1");
    fireEvent.click(await findByText(container, "next"));
    expect(await findByText(container, "item-2")).toBeTruthy();
  });
});
