// @vitest-environment happy-dom
import { findByRole, fireEvent, getAllByRole, waitFor } from "@testing-library/dom";
import { render } from "hono/jsx/dom";
import { describe, expect, it, vi } from "vitest";
import { CommandPalette } from "./CommandPalette";

const items = [
  { id: "a", label: "Alpha" },
  { id: "b", label: "Beta" },
  { id: "c", label: "Gamma" },
];

function mount(props: { onSelect?: (item: { id: string }) => void; onClose?: () => void } = {}) {
  const container = document.createElement("div");
  document.body.append(container);
  const onSelect = vi.fn(props.onSelect);
  const onClose = vi.fn(props.onClose);
  render(<CommandPalette open items={items} onSelect={onSelect} onClose={onClose} />, container);
  return { container, onSelect, onClose };
}

const selectedLabel = (container: HTMLElement) =>
  getAllByRole(container, "option").find((o) => o.getAttribute("aria-selected") === "true")
    ?.textContent;

describe("CommandPalette", () => {
  it("opens as a modal dialog with every item and the first one active", async () => {
    const { container } = mount();
    const input = await findByRole(container, "combobox");
    expect(container.querySelector("dialog")?.open).toBe(true);
    expect(getAllByRole(container, "option").map((o) => o.textContent)).toEqual([
      "Alpha",
      "Beta",
      "Gamma",
    ]);
    expect(selectedLabel(container)).toBe("Alpha");
    expect(input.getAttribute("aria-activedescendant")).toBe(
      getAllByRole(container, "option")[0]?.id,
    );
  });

  it("filters options as the user types", async () => {
    const { container } = mount();
    const input = await findByRole(container, "combobox");
    fireEvent.input(input, { target: { value: "et" } });
    await waitFor(() =>
      expect(getAllByRole(container, "option").map((o) => o.textContent)).toEqual(["Beta"]),
    );
  });

  it("moves the active option with arrow keys and selects it with Enter", async () => {
    const { container, onSelect } = mount();
    const input = await findByRole(container, "combobox");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    await waitFor(() => expect(selectedLabel(container)).toBe("Beta"));
    fireEvent.keyDown(input, { key: "ArrowUp" });
    fireEvent.keyDown(input, { key: "ArrowUp" });
    await waitFor(() => expect(selectedLabel(container)).toBe("Gamma"));
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith(items[2]);
  });

  it("selects an option on click and closes on Escape", async () => {
    const { container, onSelect, onClose } = mount();
    await findByRole(container, "combobox");
    fireEvent.click(getAllByRole(container, "option")[1] as HTMLElement);
    expect(onSelect).toHaveBeenCalledWith(items[1]);
    fireEvent.keyDown(await findByRole(container, "combobox"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
