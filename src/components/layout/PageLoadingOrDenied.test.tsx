import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PageLoadingOrDenied } from "./PageLoadingOrDenied";

describe("PageLoadingOrDenied", () => {
  it("renders its children inside a Container", () => {
    render(
      <PageLoadingOrDenied>
        <p data-testid="msg">loading...</p>
      </PageLoadingOrDenied>,
    );
    expect(screen.getByTestId("msg")).toBeInTheDocument();
  });

  it("applies the expected layout classes on the wrapper", () => {
    // Wrapper carries the flex / padding utilities while the surrounding
    // layout owns the scroll container.
    // Wrapper は flex / padding を担い、スクロール責務は外側レイアウトに委譲する。
    const { container } = render(
      <PageLoadingOrDenied>
        <p>loading...</p>
      </PageLoadingOrDenied>,
    );
    const root = container.firstElementChild as HTMLElement | null;
    expect(root).not.toBeNull();
    expect(root?.className).toContain("min-h-0");
    expect(root?.className).toContain("flex-1");
    expect(root?.className).toContain("py-10");
  });

  it("does not emit a <main> landmark (AppLayout owns the only <main>)", () => {
    // AppLayout provides the single `<main>` landmark for the app shell;
    // this shell must remain a plain <div> so there is no duplicate landmark.
    // AppLayout が唯一の `<main>` ランドマークを提供するため、ここでは
    // <div> のまま保ち、ランドマーク重複を起こさないことを確認する。
    const { container } = render(
      <PageLoadingOrDenied>
        <p>loading...</p>
      </PageLoadingOrDenied>,
    );
    expect(container.querySelector("main")).toBeNull();
  });
});
