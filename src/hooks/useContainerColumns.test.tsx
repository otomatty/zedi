/**
 * Page list grid columns from container width: 2–6 columns; breakpoints 360 / 520 / 680 / 880 px.
 * ページ一覧グリッドの列数はコンテナ幅に応じて 2〜6。閾値: 360 / 520 / 680 / 880 px。
 */
import { describe, it, expect, vi } from "vitest";
import { render, renderHook } from "@testing-library/react";
import { useContainerColumns, widthToColumns } from "./useContainerColumns";

describe("widthToColumns", () => {
  it("returns 2 for width < 360", () => {
    expect(widthToColumns(0)).toBe(2);
    expect(widthToColumns(359)).toBe(2);
  });

  it("returns 3 for 360 <= width < 520", () => {
    expect(widthToColumns(360)).toBe(3);
    expect(widthToColumns(519)).toBe(3);
  });

  it("returns 4 for 520 <= width < 680", () => {
    expect(widthToColumns(520)).toBe(4);
    expect(widthToColumns(679)).toBe(4);
  });

  it("returns 5 for 680 <= width < 880", () => {
    expect(widthToColumns(680)).toBe(5);
    expect(widthToColumns(879)).toBe(5);
  });

  it("returns 6 for width >= 880", () => {
    expect(widthToColumns(880)).toBe(6);
    expect(widthToColumns(1200)).toBe(6);
  });
});

describe("useContainerColumns", () => {
  it("returns ref and columns (initial columns is 2 when ref not attached)", () => {
    const { result } = renderHook(() => useContainerColumns());
    expect(result.current.ref).toBeDefined();
    expect(result.current.ref.current).toBeNull();
    expect(result.current.columns).toBe(2);
  });

  it("calls ResizeObserver.observe when ref is attached to a DOM element", () => {
    const instances: { observe: ReturnType<typeof vi.fn> }[] = [];
    vi.stubGlobal(
      "ResizeObserver",
      vi.fn().mockImplementation(function (this: {
        observe: ReturnType<typeof vi.fn>;
        disconnect: ReturnType<typeof vi.fn>;
      }) {
        this.observe = vi.fn();
        this.disconnect = vi.fn();
        instances.push(this);
        return this;
      }),
    );

    function Wrapper() {
      const { ref } = useContainerColumns();
      return <div ref={ref} data-testid="container" />;
    }
    render(<Wrapper />);

    expect(instances.length).toBeGreaterThanOrEqual(1);
    const instance = instances[0];
    expect(instance).toBeDefined();
    if (instance) expect(instance.observe).toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it("updates columns from container width when ref is attached (updateColumns uses getBoundingClientRect)", () => {
    const width = 600;
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
      width,
      height: 0,
      top: 0,
      left: 0,
      bottom: 0,
      right: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    function Wrapper() {
      const { ref, columns } = useContainerColumns();
      return (
        <div ref={ref} data-testid="container" data-columns={columns}>
          {columns}
        </div>
      );
    }
    const { getByTestId } = render(<Wrapper />);

    expect(getByTestId("container")).toHaveAttribute("data-columns", String(widthToColumns(width)));

    vi.mocked(Element.prototype.getBoundingClientRect).mockRestore();
  });
});
