/**
 * ResizableHandle / ResizablePanelGroup の orientation 契約のテスト（issue #1036 で発見）。
 *
 * react-resizable-panels v4 は ARIA window-splitter 規約に従い、separator の
 * `aria-orientation` に「separator 自身の見た目の向き」を設定する:
 * - 左右分割（group orientation="horizontal"）→ separator は `vertical`（細い縦線）
 * - 上下分割（group orientation="vertical"）→ separator は `horizontal`（全幅の横線）
 *
 * 旧実装は `aria-orientation="vertical"` を「上下分割」と逆に解釈して w-full を
 * 当てており、左右分割で separator が全幅化 → 両パネルが幅 0 に潰れて compose
 * 画面が操作不能になっていた。
 *
 * Pins the orientation contract of the resizable separator. react-resizable-panels
 * v4 sets `aria-orientation` to the separator's own visual orientation (vertical
 * line for a left/right split). The old classes interpreted it the other way
 * around, stretching the separator to full width and collapsing both panels.
 */
import { describe, it, expect, vi, beforeAll } from "vitest";
import { render } from "@testing-library/react";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "./resizable";

// jsdom には ResizeObserver が無く、react-resizable-panels がマウント時に
// 要求するため最小スタブを入れる。
// jsdom lacks ResizeObserver, which react-resizable-panels requires on mount.
beforeAll(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

function renderGroup(direction: "horizontal" | "vertical") {
  const { container } = render(
    <ResizablePanelGroup direction={direction}>
      <ResizablePanel />
      <ResizableHandle withHandle />
      <ResizablePanel />
    </ResizablePanelGroup>,
  );
  const separator = container.querySelector('[role="separator"]');
  if (!(separator instanceof HTMLElement)) {
    throw new Error("separator not rendered");
  }
  return separator;
}

describe("ResizableHandle orientation contract", () => {
  it("left/right split: separator is a thin vertical line (aria-orientation=vertical)", () => {
    const separator = renderGroup("horizontal");

    // v4 sets the separator's own orientation, not the group's.
    // v4 は group ではなく separator 自身の向きを設定する。
    expect(separator.getAttribute("aria-orientation")).toBe("vertical");

    // 細い縦線であること。全幅化（w-full）すると左右パネルが幅 0 に潰れる。
    // Must stay a 1px-wide line; a full-width separator collapses both panels.
    expect(separator.className).toContain("w-px");
    expect(effectiveClasses(separator)).not.toContain("w-full");
  });

  it("top/bottom split: separator is a full-width horizontal line (aria-orientation=horizontal)", () => {
    const separator = renderGroup("vertical");

    expect(separator.getAttribute("aria-orientation")).toBe("horizontal");

    // 上下分割では全幅 1px 高の横線になる（aria-orientation=horizontal で発火）。
    // The stacked split needs the full-width 1px-high variant to apply.
    expect(effectiveClasses(separator)).toContain("h-px");
    expect(effectiveClasses(separator)).toContain("w-full");
  });
});

/**
 * separator に「実際に効く」クラスだけを残す。`aria-[orientation=X]:` 付きの
 * バリアントは separator の実属性値と一致するときのみ展開して返す。
 *
 * Expands Tailwind `aria-[orientation=X]:` variants only when they match the
 * element's actual attribute, so assertions reflect what CSS would apply.
 */
function effectiveClasses(separator: HTMLElement): string[] {
  const actual = separator.getAttribute("aria-orientation");
  const result: string[] = [];
  for (const cls of separator.className.split(/\s+/)) {
    const match = cls.match(/^aria-\[orientation=(\w+)\]:(.+)$/);
    if (!match) {
      result.push(cls);
    } else if (match[1] === actual) {
      result.push(match[2]);
    }
  }
  return result;
}
