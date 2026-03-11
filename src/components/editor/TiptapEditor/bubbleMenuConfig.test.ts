import { describe, it, expect } from "vitest";
import { BUBBLE_MENU_PRESET_COLORS } from "./bubbleMenuConfig";

describe("bubbleMenuConfig", () => {
  it("BUBBLE_MENU_PRESET_COLORS has default and 7 color presets", () => {
    expect(BUBBLE_MENU_PRESET_COLORS).toHaveLength(8);
    expect(BUBBLE_MENU_PRESET_COLORS[0]).toEqual({ label: "デフォルト", value: "" });
    expect(BUBBLE_MENU_PRESET_COLORS[1].label).toBe("グレー");
    expect(BUBBLE_MENU_PRESET_COLORS.every((c) => "label" in c && "value" in c)).toBe(true);
  });
});
