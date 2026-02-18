import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StickyTitleBar } from "./StickyTitleBar";

describe("StickyTitleBar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("visible が false のときバーは非表示状態である", () => {
    const { container } = render(
      <StickyTitleBar
        visible={false}
        title="ページタイトル"
        onClick={vi.fn()}
      />
    );
    const bar = container.firstChild as HTMLElement;
    expect(bar).toHaveClass("invisible", "opacity-0");
  });

  it("visible が true のときタイトルが表示される", () => {
    render(
      <StickyTitleBar
        visible
        title="表示するタイトル"
        onClick={vi.fn()}
      />
    );
    expect(screen.getByText("表示するタイトル")).toBeInTheDocument();
  });

  it("クリック時に onClick が 1 回呼ばれる", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <StickyTitleBar visible title="タイトル" onClick={onClick} />
    );
    await user.click(screen.getByRole("button", { name: "タイトルまでスクロール" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("タイトルが空のとき「無題のページ」を表示する", () => {
    render(
      <StickyTitleBar visible title="" onClick={vi.fn()} />
    );
    expect(screen.getByText("無題のページ")).toBeInTheDocument();
  });
});
