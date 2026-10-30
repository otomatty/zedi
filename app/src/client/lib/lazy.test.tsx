// @vitest-environment happy-dom
import { findByRole, findByText, fireEvent } from "@testing-library/dom";
import { render, type Child } from "hono/jsx/dom";
import { describe, expect, it, vi } from "vitest";
import { lazyPage } from "./lazy";

const Page = ({ name }: { name: string }) => <p>page {name}</p>;

function mount(element: Child) {
  const container = document.createElement("div");
  document.body.append(container);
  render(element, container);
  return container;
}

describe("lazyPage", () => {
  it("renders the page once its module has loaded", async () => {
    const LazyPage = lazyPage(async () => ({ default: Page }));

    const container = mount(<LazyPage name="a" />);

    expect(await findByText(container, "page a")).toBeTruthy();
  });

  it("shows an error with a retry when the module fails to load, and loads it on retry", async () => {
    // デプロイ後の古いチャンクやネットワーク断で import が失敗しても、読み込み中のまま止めない。
    // A stale chunk after a deploy or a network error must not leave the page stuck loading.
    const loader = vi
      .fn<() => Promise<{ default: typeof Page }>>()
      .mockRejectedValueOnce(new TypeError("Failed to fetch dynamically imported module"))
      .mockResolvedValueOnce({ default: Page });
    const LazyPage = lazyPage(loader);

    const container = mount(<LazyPage name="b" />);
    const retry = await findByRole(container, "button", { name: "再読み込み" });
    expect(container.querySelector("[role=alert]")).not.toBeNull();

    fireEvent.click(retry);

    expect(await findByText(container, "page b")).toBeTruthy();
    expect(loader).toHaveBeenCalledTimes(2);
  });
});
