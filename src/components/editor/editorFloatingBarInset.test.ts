import { describe, it, expect } from "vitest";
import {
  computeEditorFloatingBarBottomInsetPx,
  WIKI_LINK_INPUT_BAR_GAP_PX,
  WIKI_LINK_INPUT_BAR_HEIGHT_PX,
} from "./editorFloatingBarInset";

describe("computeEditorFloatingBarBottomInsetPx", () => {
  it("returns 0 on desktop or when the floating bar is not mounted", () => {
    expect(
      computeEditorFloatingBarBottomInsetPx({
        isMobile: false,
        hasFloatingBar: true,
        keyboardOffset: 280,
      }),
    ).toBe(0);
    expect(
      computeEditorFloatingBarBottomInsetPx({
        isMobile: true,
        hasFloatingBar: false,
        keyboardOffset: 280,
      }),
    ).toBe(0);
  });

  it("reserves bar height plus gap on mobile when the keyboard is closed", () => {
    expect(
      computeEditorFloatingBarBottomInsetPx({
        isMobile: true,
        hasFloatingBar: true,
        keyboardOffset: 0,
      }),
    ).toBe(WIKI_LINK_INPUT_BAR_HEIGHT_PX + WIKI_LINK_INPUT_BAR_GAP_PX);
  });

  it("adds the visualViewport keyboard offset while the bar is lifted", () => {
    expect(
      computeEditorFloatingBarBottomInsetPx({
        isMobile: true,
        hasFloatingBar: true,
        keyboardOffset: 280,
      }),
    ).toBe(280 + WIKI_LINK_INPUT_BAR_HEIGHT_PX + WIKI_LINK_INPUT_BAR_GAP_PX);
  });
});
