/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from "vitest";
import { handleSlashSuggestionMenuKeyDown } from "./slashSuggestionMenuKeyDown";

function key(name: string): KeyboardEvent {
  return new KeyboardEvent("keydown", { key: name });
}

describe("handleSlashSuggestionMenuKeyDown", () => {
  it("moves focus from last main row to path section on ArrowDown", () => {
    const setPathSectionActive = vi.fn();
    const setPathSelectedIndex = vi.fn();
    const setSelectedIndex = vi.fn();
    const ev = key("ArrowDown");
    const prevent = vi.spyOn(ev, "preventDefault");
    const ok = handleSlashSuggestionMenuKeyDown(
      ev,
      {
        itemsLength: 2,
        pathCompletionEnabled: true,
        pathSuggestions: ["src/"],
        pathSectionActive: false,
        pathSelectedIndex: 0,
        selectedIndex: 1,
      },
      {
        setPathSectionActive,
        setPathSelectedIndex,
        setSelectedIndex,
        applyPathPick: vi.fn(),
        selectItem: vi.fn(),
        onClose: vi.fn(),
      },
    );
    expect(ok).toBe(true);
    expect(prevent).toHaveBeenCalled();
    expect(setPathSectionActive).toHaveBeenCalledWith(true);
    expect(setPathSelectedIndex).toHaveBeenCalledWith(0);
  });

  it("applies path pick on Enter when path section is active", () => {
    const applyPathPick = vi.fn();
    const ev = key("Enter");
    vi.spyOn(ev, "preventDefault");
    const ok = handleSlashSuggestionMenuKeyDown(
      ev,
      {
        itemsLength: 1,
        pathCompletionEnabled: true,
        pathSuggestions: ["foo/", "bar/"],
        pathSectionActive: true,
        pathSelectedIndex: 1,
        selectedIndex: 0,
      },
      {
        setPathSectionActive: vi.fn(),
        setPathSelectedIndex: vi.fn(),
        setSelectedIndex: vi.fn(),
        applyPathPick,
        selectItem: vi.fn(),
        onClose: vi.fn(),
      },
    );
    expect(ok).toBe(true);
    expect(applyPathPick).toHaveBeenCalledWith("bar/");
  });
});
