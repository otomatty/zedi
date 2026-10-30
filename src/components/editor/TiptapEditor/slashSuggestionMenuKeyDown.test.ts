/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from "vitest";
import { handleSlashSuggestionMenuKeyDown } from "./slashSuggestionMenuKeyDown";

function key(name: string): KeyboardEvent {
  return new KeyboardEvent("keydown", { key: name });
}

function actions() {
  let selected = 0;
  const setSelectedIndex = vi.fn((next: number | ((prev: number) => number)) => {
    selected = typeof next === "function" ? next(selected) : next;
  });
  return {
    setSelectedIndex,
    selectItem: vi.fn(),
    onClose: vi.fn(),
    selected: () => selected,
    start: (index: number) => {
      selected = index;
    },
  };
}

describe("handleSlashSuggestionMenuKeyDown", () => {
  it("wraps the selection around with the arrow keys", () => {
    const a = actions();
    a.start(2);

    expect(
      handleSlashSuggestionMenuKeyDown(key("ArrowDown"), { itemsLength: 3, selectedIndex: 2 }, a),
    ).toBe(true);
    expect(a.selected()).toBe(0);
    expect(
      handleSlashSuggestionMenuKeyDown(key("ArrowUp"), { itemsLength: 3, selectedIndex: 0 }, a),
    ).toBe(true);
    expect(a.selected()).toBe(2);
  });

  it("moves from the row on screen even if the stored index is past the end", () => {
    const a = actions();
    a.start(10);

    handleSlashSuggestionMenuKeyDown(key("ArrowUp"), { itemsLength: 3, selectedIndex: 2 }, a);

    expect(a.selected()).toBe(1);
  });

  it("runs the selected item on Enter", () => {
    const a = actions();
    const ev = key("Enter");
    const prevent = vi.spyOn(ev, "preventDefault");

    expect(handleSlashSuggestionMenuKeyDown(ev, { itemsLength: 3, selectedIndex: 1 }, a)).toBe(
      true,
    );
    expect(prevent).toHaveBeenCalled();
    expect(a.selectItem).toHaveBeenCalledWith(1);
  });

  it("closes on Escape, even when nothing matches", () => {
    const a = actions();

    expect(
      handleSlashSuggestionMenuKeyDown(key("Escape"), { itemsLength: 0, selectedIndex: 0 }, a),
    ).toBe(true);
    expect(a.onClose).toHaveBeenCalled();
  });

  it("leaves other keys, and arrows with no items, to the editor", () => {
    const a = actions();

    expect(
      handleSlashSuggestionMenuKeyDown(key("a"), { itemsLength: 3, selectedIndex: 0 }, a),
    ).toBe(false);
    expect(
      handleSlashSuggestionMenuKeyDown(key("ArrowDown"), { itemsLength: 0, selectedIndex: 0 }, a),
    ).toBe(false);
    expect(a.setSelectedIndex).not.toHaveBeenCalled();
  });
});
